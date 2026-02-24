import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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
  constructor(private readonly prisma: PrismaService) {}

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
}
