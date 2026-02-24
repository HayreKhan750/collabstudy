import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
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
   *
   * Query params:
   *   q           - Search term (required)
   *   workspaceId - UUID of the workspace to search in (required)
   *   limit       - Number of results per page (1–100, default 20)
   *   cursor      - Opaque pagination token from previous response
   */
  @Get()
  search(@Request() req: any, @Query() dto: SearchMessagesDto) {
    return this.searchService.searchMessages(req.user.userId, dto);
  }
}
