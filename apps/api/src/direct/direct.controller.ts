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
  ForbiddenException,
  NotFoundException,
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
  ) {
    return this.directService.getMessages(
      req.user.userId,
      conversationId,
      limit ? parseInt(limit, 10) : 50,
      cursor,
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
   * PATCH /direct/:dmId/messages/:messageId
   * Edit a DM message (sender only).
   */
  @Patch(':dmId/messages/:messageId')
  editMessage(
    @Request() req: any,
    @Param('dmId') dmId: string,
    @Param('messageId') messageId: string,
    @Body('content') content: string,
  ) {
    return this.directService.editDmMessage(req.user.userId, dmId, messageId, content);
  }

  /**
   * DELETE /direct/:dmId/messages/:messageId
   * Delete a DM message (sender only).
   */
  @Delete(':dmId/messages/:messageId')
  @HttpCode(HttpStatus.OK)
  deleteMessage(
    @Request() req: any,
    @Param('dmId') dmId: string,
    @Param('messageId') messageId: string,
  ) {
    return this.directService.deleteDmMessage(req.user.userId, dmId, messageId);
  }

  /**
   * POST /direct/:dmId/messages/:messageId/reactions
   * Toggle an emoji reaction on a DM message.
   */
  @Post(':dmId/messages/:messageId/reactions')
  @HttpCode(HttpStatus.OK)
  toggleReaction(
    @Request() req: any,
    @Param('dmId') dmId: string,
    @Param('messageId') messageId: string,
    @Body('emoji') emoji: string,
  ) {
    return this.directService.toggleDmReaction(req.user.userId, dmId, messageId, emoji);
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
