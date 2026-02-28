import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DirectService } from './direct.service';
import { StartConversationDto } from './dto/start-conversation.dto';
import { SendDirectMessageDto } from './dto/send-direct-message.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SUMMARY_QUEUE, DmSummaryJobData } from '../ai/summary.queue';

@Controller('direct')
@UseGuards(JwtAuthGuard)
export class DirectController {
  constructor(
    private readonly directService: DirectService,
    @InjectQueue(SUMMARY_QUEUE) private readonly summaryQueue: Queue,
  ) {}

  /**
   * POST /direct/start
   * Start or retrieve a 1:1 conversation with a user.
   */
  @Post('start')
  @HttpCode(HttpStatus.OK)
  start(@Request() req: any, @Body() dto: StartConversationDto) {
    return this.directService.startConversation(req.user.userId, dto);
  }

  /**
   * GET /direct
   * Get all conversations for the current user.
   */
  @Get()
  getAll(@Request() req: any) {
    return this.directService.getConversations(req.user.userId);
  }

  /**
   * GET /direct/:id/messages
   * Get paginated messages for a conversation.
   */
  @Get(':id/messages')
  getMessages(
    @Request() req: any,
    @Param('id') conversationId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('parentId') parentId?: string,
  ) {
    return this.directService.getMessages(
      req.user.userId,
      conversationId,
      limit ? parseInt(limit, 10) : 50,
      cursor,
      // If parentId query param present → fetch thread replies for that parent
      // If absent → fetch main chat messages only (parentId IS NULL)
      parentId ?? undefined,
    );
  }

  /**
   * POST /direct/:id/messages
   * Send a message in a conversation.
   */
  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  sendMessage(
    @Request() req: any,
    @Param('id') conversationId: string,
    @Body() dto: SendDirectMessageDto,
  ) {
    return this.directService.sendMessage(req.user.userId, conversationId, dto);
  }

  /**
   * POST /direct/:id/summary
   * Enqueue an AI summary job and return 202 Accepted + jobId.
   * The result is delivered via WebSocket event `summary_generated`.
   */
  @Post(':id/summary')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestSummary(
    @Request() req: any,
    @Param('id') conversationId: string,
  ) {
    const jobData: DmSummaryJobData = {
      type: 'dm',
      conversationId,
      userId: req.user.userId,
    };
    const job = await this.summaryQueue.add('dm-summary', jobData, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2_000 },
    });
    return {
      status: 'queued',
      jobId: job.id,
      message: 'Summary is being generated. You will receive a summary_generated WebSocket event when ready.',
    };
  }

  /**
   * POST /direct/:id/mark-read
   * Mark a DM conversation as read for the current user (clears unread badge).
   */
  @Post(':id/mark-read')
  @HttpCode(HttpStatus.OK)
  markDmRead(
    @Request() req: any,
    @Param('id') conversationId: string,
  ) {
    return this.directService.markDmRead(req.user.userId, conversationId);
  }

  /**
   * POST /direct/:id/hide
   * Hide a DM conversation from the current user's sidebar.
   */
  @Post(':id/hide')
  @HttpCode(HttpStatus.OK)
  hideDm(
    @Request() req: any,
    @Param('id') conversationId: string,
  ) {
    return this.directService.hideConversation(req.user.userId, conversationId);
  }

  /**
   * DELETE /direct/:id/messages/bulk
   * Bulk delete DM messages (sender only per message).
   */
  @Delete(':id/messages/bulk')
  @HttpCode(HttpStatus.OK)
  async bulkDeleteDmMessages(
    @Request() req: any,
    @Param('id') conversationId: string,
    @Body() body: { messageIds: string[] },
  ) {
    const userId = req.user.userId;
    const deleted: string[] = [];
    for (const messageId of body.messageIds ?? []) {
      try {
        await this.directService.deleteDmMessage(userId, conversationId, messageId);
        deleted.push(messageId);
      } catch {
        // Skip messages user can't delete
      }
    }
    return { deleted };
  }

  /**
   * PATCH /direct/:id/messages/:messageId
   * Edit a DM message (sender only)
   */
  @Patch(':id/messages/:messageId')
  editDmMessage(
    @Request() req: any,
    @Param('id') conversationId: string,
    @Param('messageId') messageId: string,
    @Body() body: { content: string },
  ) {
    return this.directService.editDmMessage(req.user.userId, conversationId, messageId, body.content);
  }

  /**
   * DELETE /direct/:id/messages/:messageId
   * Delete a DM message (sender only)
   */
  @Delete(':id/messages/:messageId')
  @HttpCode(HttpStatus.OK)
  deleteDmMessage(
    @Request() req: any,
    @Param('id') conversationId: string,
    @Param('messageId') messageId: string,
  ) {
    return this.directService.deleteDmMessage(req.user.userId, conversationId, messageId);
  }

  /**
   * POST /direct/:id/messages/:messageId/reactions
   * Toggle an emoji reaction on a DM message
   */
  @Post(':id/messages/:messageId/reactions')
  @HttpCode(HttpStatus.OK)
  toggleDmReaction(
    @Request() req: any,
    @Param('id') conversationId: string,
    @Param('messageId') messageId: string,
    @Body() body: { emoji: string },
  ) {
    return this.directService.toggleDmReaction(req.user.userId, conversationId, messageId, body.emoji);
  }

  /**
   * DELETE /direct/:id/history
   * Clear all messages in a DM conversation.
   */
  @Delete(':id/history')
  @HttpCode(HttpStatus.OK)
  async clearHistory(
    @Request() req: any,
    @Param('id') conversationId: string,
  ) {
    return this.directService.clearHistory(req.user.userId, conversationId);
  }

  /**
   * GET /direct/workspace/:workspaceId/users
   * Get all workspace members (for picking DM recipients).
   */
  @Get('workspace/:workspaceId/users')
  getWorkspaceUsers(
    @Request() req: any,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.directService.getWorkspaceUsers(req.user.userId, workspaceId);
  }
}
