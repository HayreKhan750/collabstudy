import { Controller, Get, Query, Param, UseGuards, Request } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchMessagesDto } from './dto/search-messages.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /**
   * GET /search?q=...&workspaceId=...&limit=...&cursor=...
   *
   * Full-text search over messages within a workspace, ranked by
   * trigram similarity (pg_trgm). Requires the caller to be a member
   * of the target workspace.
   */
  @Get()
  search(@Request() req: any, @Query() dto: SearchMessagesDto) {
    return this.searchService.searchMessages(req.user.userId, dto);
  }

  /**
   * GET /search/hybrid?q=...&workspaceId=...&limit=...
   *
   * Hybrid semantic + trigram search over messages within a workspace.
   * Scoring formula: 0.6 × trigram_similarity + 0.4 × cosine_similarity
   *
   * If the Gemini API is unavailable the endpoint falls back transparently
   * to trigram-only search, so the response shape is always identical.
   *
   * Query params:
   *   q           - Search term (required)
   *   workspaceId - UUID of the workspace to search in (required)
   *   limit       - Number of results per page (1–100, default 20)
   */
  @Get('hybrid')
  hybridSearch(@Request() req: any, @Query() dto: SearchMessagesDto) {
    return this.searchService.hybridSearchMessages(req.user.userId, dto);
  }

  /**
   * GET /search/related/:messageId?workspaceId=...&limit=...
   *
   * Phase 11.3: AI Smart Suggestions — find messages that are semantically
   * similar to the given message using pgvector cosine distance.
   *
   * Returns up to 8 results (configurable via `limit`) ordered by
   * descending similarity. Returns an empty array if the source message
   * has no embedding yet (worker still pending).
   *
   * Query params:
   *   workspaceId - UUID of the workspace (required, used for membership gate)
   *   limit       - Max results to return (1–20, default 8)
   */
  @Get('related/:messageId')
  findRelated(
    @Request() req: any,
    @Param('messageId') messageId: string,
    @Query('workspaceId') workspaceId: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Math.min(parseInt(limit, 10), 20) : 8;
    return this.searchService.findRelatedMessages(
      req.user.userId,
      messageId,
      workspaceId,
      parsedLimit,
    );
  }
}
