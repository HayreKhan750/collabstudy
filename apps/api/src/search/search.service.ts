import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { SearchMessagesDto } from './dto/search-messages.dto';

/**
 * SearchService — full-text search over messages using PostgreSQL pg_trgm.
 *
 * Strategy:
 *  - Uses `word_similarity(query, content)` from pg_trgm for ranked results.
 *    word_similarity computes the similarity of the query against the best matching
 *    contiguous sequence of words in the content — perfect for substring-style search.
 *  - The GIN index (gin_trgm_ops) on messages.content makes trigram lookups O(log n).
 *  - Workspace scoping is enforced via a JOIN through channels, preventing
 *    users from searching messages outside their workspace.
 *  - Cursor-based pagination uses a (similarity_score DESC, createdAt DESC, id ASC)
 *    composite key for stable, duplicate-free pages even when scores tie.
 *  - All user-supplied values are passed as Prisma.sql tagged-template parameters
 *    ($N placeholders) — safe against SQL injection.
 */
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {}

  async searchMessages(userId: string, dto: SearchMessagesDto) {
    const { q, workspaceId, limit = 20, cursor } = dto;

    // ── 1. Verify the requesting user is a member of the workspace ────────────
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
      select: { userId: true },
    });

    if (!membership) {
      throw new ForbiddenException('You are not a member of this workspace');
    }

    // ── 2. Parse cursor ────────────────────────────────────────────────────────
    // Cursor format: base64(JSON.stringify({ score, createdAt, id }))
    // Using createdAt + id as the tie-breaker gives a stable, deterministic order.
    let cursorScore: number | null = null;
    let cursorCreatedAt: string | null = null;
    let cursorId: string | null = null;

    if (cursor) {
      try {
        const decoded = Buffer.from(cursor, 'base64').toString('utf8');
        const parsed = JSON.parse(decoded) as {
          score: number;
          createdAt: string;
          id: string;
        };
        cursorScore = parsed.score;
        cursorCreatedAt = parsed.createdAt;
        cursorId = parsed.id;
      } catch {
        // Malformed cursor — ignore and start from the beginning
      }
    }

    // ── 3. Build and execute the raw SQL query ─────────────────────────────────
    // We use $queryRaw here because:
    //   a) Prisma ORM does not expose pg_trgm similarity() or GIN index hints.
    //   b) We need ORDER BY on a computed similarity() expression.
    //   c) Keyset pagination on a computed score column requires a WHERE predicate
    //      that Prisma's query builder cannot generate.
    //
    // All interpolated values use Prisma.sql tagged templates — never string concat.
    // Minimum similarity threshold of 0.1 filters noise and ensures index is used.

    const takeLimit = limit + 1; // fetch one extra to detect if next page exists

    type RawMessage = {
      id: string;
      content: string;
      userId: string;
      channelId: string;
      parentId: string | null;
      createdAt: Date;
      updatedAt: Date;
      similarity: number;
      username: string;
      full_name: string | null;
      avatar: string | null;
      channel_name: string;
    };

    let rows: RawMessage[];

    if (cursorScore !== null && cursorCreatedAt !== null && cursorId !== null) {
      // Keyset pagination using (similarity DESC, createdAt DESC, id ASC)
      // The WHERE condition mirrors the ORDER BY exactly:
      //   next page = rows that come AFTER the last row of the previous page
      //
      // IMPORTANT: similarity() returns float4 (single-precision). We cast the
      // cursor score to float4 as well so that equality comparisons are exact
      // even after the score has been serialized to JSON and back (which would
      // otherwise introduce float8 rounding differences that break = / < tests).
      rows = await this.prisma.$queryRaw<RawMessage[]>`
        SELECT
          m.id,
          m.content,
          m."userId",
          m."channelId",
          m."parentId",
          m."createdAt",
          m."updatedAt",
          word_similarity(${q}, m.content) AS similarity,
          u.username,
          u."fullName"      AS full_name,
          u.avatar,
          c.name            AS channel_name
        FROM messages m
        JOIN channels c   ON c.id  = m."channelId"
        JOIN workspaces w ON w.id  = c."workspaceId"
        JOIN users u      ON u.id  = m."userId"
        WHERE
          w.id = ${workspaceId}::uuid
          AND word_similarity(${q}, m.content) > 0.3
          AND (
            word_similarity(${q}, m.content) < ${cursorScore}::float4
            OR (
              word_similarity(${q}, m.content) = ${cursorScore}::float4
              AND m."createdAt" < ${cursorCreatedAt}::timestamptz
            )
            OR (
              word_similarity(${q}, m.content) = ${cursorScore}::float4
              AND m."createdAt" = ${cursorCreatedAt}::timestamptz
              AND m.id::text > ${cursorId}
            )
          )
        ORDER BY similarity DESC, m."createdAt" DESC, m.id ASC
        LIMIT ${takeLimit}
      `;
    } else {
      // First page — no cursor
      rows = await this.prisma.$queryRaw<RawMessage[]>`
        SELECT
          m.id,
          m.content,
          m."userId",
          m."channelId",
          m."parentId",
          m."createdAt",
          m."updatedAt",
          word_similarity(${q}, m.content) AS similarity,
          u.username,
          u."fullName"      AS full_name,
          u.avatar,
          c.name            AS channel_name
        FROM messages m
        JOIN channels c   ON c.id  = m."channelId"
        JOIN workspaces w ON w.id  = c."workspaceId"
        JOIN users u      ON u.id  = m."userId"
        WHERE
          w.id = ${workspaceId}::uuid
          AND word_similarity(${q}, m.content) > 0.3
        ORDER BY similarity DESC, m."createdAt" DESC, m.id ASC
        LIMIT ${takeLimit}
      `;
    }

    // ── 4. Determine next cursor ───────────────────────────────────────────────
    const hasNextPage = rows.length > limit;
    if (hasNextPage) rows.pop(); // discard the extra sentinel row

    const lastRow = rows.length > 0 ? rows[rows.length - 1] : null;
    const nextCursor =
      hasNextPage && lastRow
        ? Buffer.from(
            JSON.stringify({
              score: Number(lastRow.similarity),
              createdAt: lastRow.createdAt instanceof Date
                ? lastRow.createdAt.toISOString()
                : String(lastRow.createdAt),
              id: lastRow.id,
            }),
          ).toString('base64')
        : null;

    // ── 5. Shape the response ──────────────────────────────────────────────────
    const messages = rows.map((row) => ({
      id: row.id,
      content: row.content,
      channelId: row.channelId,
      channelName: row.channel_name,
      parentId: row.parentId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      similarity: Number(row.similarity),
      user: {
        id: row.userId,
        username: row.username,
        fullName: row.full_name,
        avatar: row.avatar,
      },
    }));

    return {
      messages,
      nextCursor,
      total: messages.length,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HYBRID SEARCH  (Phase 11.2)
  // Formula: 0.6 × trigram_similarity + 0.4 × (1 - cosine_distance)
  //
  // • Trigram part   → word_similarity(q, content)  via pg_trgm GIN index
  // • Semantic part  → 1 - (embedding <=> query_vec) via pgvector HNSW index
  //   (<=> returns cosine DISTANCE, so we flip it to get similarity)
  //
  // Fallback: if Gemini embedding fails (no API key, timeout, etc.) we fall
  // back silently to trigram-only search with the original similarity formula.
  //
  // All user-supplied values use Prisma.sql tagged templates — never string concat.
  // ─────────────────────────────────────────────────────────────────────────────
  async hybridSearchMessages(userId: string, dto: SearchMessagesDto) {
    const { q, workspaceId, limit = 20 } = dto;

    // ── 1. Membership gate (same as keyword search) ───────────────────────────
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
      select: { userId: true },
    });
    if (!membership) {
      throw new ForbiddenException('You are not a member of this workspace');
    }

    // ── 2. Generate query embedding (graceful fallback on failure) ────────────
    let queryVector: number[] | null = null;
    try {
      const vec = await this.aiService.generateEmbedding(q);
      if (vec.length === 768) queryVector = vec;
    } catch (err) {
      this.logger.warn(
        `Hybrid search: embedding generation failed — falling back to trigram-only. Error: ${err}`,
      );
    }

    // ── 3. Build & execute raw SQL ────────────────────────────────────────────
    //
    // Shared response shape — identical to searchMessages() so the frontend
    // can switch endpoints without any other changes.
    type HybridRow = {
      id: string;
      content: string;
      userId: string;
      channelId: string;
      parentId: string | null;
      createdAt: Date;
      updatedAt: Date;
      hybrid_score: number;
      username: string;
      full_name: string | null;
      avatar: string | null;
      channel_name: string;
    };

    const takeLimit = limit + 1;
    let rows: HybridRow[];

    if (queryVector !== null) {
      // ── Full hybrid: trigram + semantic ─────────────────────────────────────
      // We format the vector as a Postgres literal string '[x,x,x,...]'
      // and cast it inside the SQL expression — safe because the values come
      // from Gemini (floats only), never from user input.
      const vectorLiteral = `[${queryVector.join(',')}]`;

      // Messages without an embedding yet (worker hasn't run) get a semantic
      // contribution of 0.0, so they still appear via trigram similarity.
      rows = await this.prisma.$queryRaw<HybridRow[]>`
        SELECT
          m.id,
          m.content,
          m."userId",
          m."channelId",
          m."parentId",
          m."createdAt",
          m."updatedAt",
          (
            0.6 * word_similarity(${q}, m.content)
            + 0.4 * CASE
                WHEN m.embedding IS NOT NULL
                THEN 1.0 - (m.embedding <=> ${vectorLiteral}::vector)
                ELSE 0.0
              END
          )                         AS hybrid_score,
          u.username,
          u."fullName"              AS full_name,
          u.avatar,
          c.name                    AS channel_name
        FROM messages m
        JOIN channels c   ON c.id  = m."channelId"
        JOIN workspaces w ON w.id  = c."workspaceId"
        JOIN users u      ON u.id  = m."userId"
        WHERE
          w.id = ${workspaceId}::uuid
          AND (
            word_similarity(${q}, m.content) > 0.1
            OR (
              m.embedding IS NOT NULL
              AND (1.0 - (m.embedding <=> ${vectorLiteral}::vector)) > 0.5
            )
          )
        ORDER BY hybrid_score DESC, m."createdAt" DESC, m.id ASC
        LIMIT ${takeLimit}
      `;
    } else {
      // ── Fallback: trigram-only (mirrors searchMessages behaviour) ────────────
      rows = await this.prisma.$queryRaw<HybridRow[]>`
        SELECT
          m.id,
          m.content,
          m."userId",
          m."channelId",
          m."parentId",
          m."createdAt",
          m."updatedAt",
          word_similarity(${q}, m.content) AS hybrid_score,
          u.username,
          u."fullName"              AS full_name,
          u.avatar,
          c.name                    AS channel_name
        FROM messages m
        JOIN channels c   ON c.id  = m."channelId"
        JOIN workspaces w ON w.id  = c."workspaceId"
        JOIN users u      ON u.id  = m."userId"
        WHERE
          w.id = ${workspaceId}::uuid
          AND word_similarity(${q}, m.content) > 0.3
        ORDER BY hybrid_score DESC, m."createdAt" DESC, m.id ASC
        LIMIT ${takeLimit}
      `;
    }

    // ── 4. Pagination (simple — hybrid search uses page-1 only for now) ───────
    const hasNextPage = rows.length > limit;
    if (hasNextPage) rows.pop();

    // ── 5. Shape response — identical to searchMessages() ────────────────────
    const messages = rows.map((row) => ({
      id: row.id,
      content: row.content,
      channelId: row.channelId,
      channelName: row.channel_name,
      parentId: row.parentId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      similarity: Number(row.hybrid_score),
      user: {
        id: row.userId,
        username: row.username,
        fullName: row.full_name,
        avatar: row.avatar,
      },
    }));

    return {
      messages,
      nextCursor: null, // Phase 11.2: pagination for hybrid search is a future enhancement
      total: messages.length,
      searchMode: queryVector !== null ? 'hybrid' : 'trigram-fallback',
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RELATED MESSAGES  (Phase 11.3)
  //
  // Given a messageId, finds the top-N most semantically similar messages in
  // the same workspace using pgvector cosine distance (<=>).
  //
  // Algorithm:
  //   1. Look up the embedding of the requested message.
  //   2. If no embedding exists (worker hasn't run yet), return empty array.
  //   3. Run a KNN query ordered by cosine distance, with a similarity threshold
  //      of 0.5 (cosine distance ≤ 0.5 → similarity ≥ 0.5) to filter noise.
  //   4. Exclude the source message and its own thread replies.
  //   5. Return max 8 results in the same response shape as searchMessages().
  //
  // Security: workspaceId is validated via membership gate. messageId is
  //   passed as a Prisma.sql parameter — never via string concatenation.
  // ─────────────────────────────────────────────────────────────────────────────
  async findRelatedMessages(
    userId: string,
    messageId: string,
    workspaceId: string,
    limit = 8,
  ) {
    // ── 1. Membership gate ────────────────────────────────────────────────────
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
      select: { userId: true },
    });
    if (!membership) {
      throw new ForbiddenException('You are not a member of this workspace');
    }

    // ── 2. Fetch the source message's embedding ───────────────────────────────
    // We use $queryRaw because the `embedding` column is Unsupported in Prisma.
    type EmbeddingRow = { embedding: string | null };
    const [sourceRow] = await this.prisma.$queryRaw<EmbeddingRow[]>`
      SELECT embedding::text FROM messages WHERE id = ${messageId}::uuid LIMIT 1
    `;

    if (!sourceRow?.embedding) {
      this.logger.log(
        `findRelatedMessages: message ${messageId} has no embedding yet — returning empty`,
      );
      return { messages: [], total: 0 };
    }

    // embedding is returned as a Postgres vector literal '[x,y,z,...]'
    // We pass it directly back into the KNN query as a ::vector cast.
    const embeddingLiteral = sourceRow.embedding;

    // ── 3. KNN similarity search ──────────────────────────────────────────────
    // Distance threshold: <=> ≤ 0.5 means cosine similarity ≥ 0.5 — confident
    // enough to surface as a "related" result. Anything lower is coincidental.
    type RelatedRow = {
      id: string;
      content: string;
      userId: string;
      channelId: string;
      parentId: string | null;
      createdAt: Date;
      updatedAt: Date;
      cosine_distance: number;
      username: string;
      full_name: string | null;
      avatar: string | null;
      channel_name: string;
    };

    const rows = await this.prisma.$queryRaw<RelatedRow[]>`
      SELECT
        m.id,
        m.content,
        m."userId",
        m."channelId",
        m."parentId",
        m."createdAt",
        m."updatedAt",
        (m.embedding <=> ${embeddingLiteral}::vector)  AS cosine_distance,
        u.username,
        u."fullName"                                    AS full_name,
        u.avatar,
        c.name                                          AS channel_name
      FROM messages m
      JOIN channels c   ON c.id = m."channelId"
      JOIN workspaces w ON w.id = c."workspaceId"
      JOIN users u      ON u.id = m."userId"
      WHERE
        w.id              = ${workspaceId}::uuid
        AND m.embedding   IS NOT NULL
        AND m.id         != ${messageId}::uuid
        AND (m.embedding <=> ${embeddingLiteral}::vector) <= 0.5
      ORDER BY cosine_distance ASC
      LIMIT ${limit}
    `;

    // ── 4. Shape response — same as searchMessages() ──────────────────────────
    const messages = rows.map((row) => ({
      id: row.id,
      content: row.content,
      channelId: row.channelId,
      channelName: row.channel_name,
      parentId: row.parentId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      // Convert distance → similarity for UI consistency
      similarity: Number((1 - Number(row.cosine_distance)).toFixed(4)),
      user: {
        id: row.userId,
        username: row.username,
        fullName: row.full_name,
        avatar: row.avatar,
      },
    }));

    return { messages, total: messages.length };
  }
}
