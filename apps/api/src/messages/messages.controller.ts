import { Controller, Get, Post, Delete, Patch, Body, Param, Query, UseGuards, Request, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { AddReactionDto } from './dto/add-reaction.dto';
import { PollVoteDto } from './dto/poll-vote.dto';
import { BulkDeleteDto } from './dto/bulk-delete.dto';
import { EditMessageDto } from './dto/edit-message.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatGateway } from '../chat/chat.gateway';
import { SUMMARY_QUEUE, ChannelSummaryJobData } from '../ai/summary.queue';

@Controller('channels/:channelId/messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  private readonly logger = new Logger(MessagesController.name);

  constructor(
    private readonly messagesService: MessagesService,
    private readonly chatGateway: ChatGateway,
    @InjectQueue(SUMMARY_QUEUE) private readonly summaryQueue: Queue,
  ) {}

  /**
   * POST /channels/:channelId/messages
   * Create a new message (workspace members only)
   */
  @Post()
  create(
    @Request() req: any,
    @Param('channelId') channelId: string,
    @Body() createMessageDto: CreateMessageDto,
  ) {
    return this.messagesService.create(req.user.userId, channelId, createMessageDto);
  }

  /**
   * GET /channels/:channelId/messages
   * Get messages with cursor-based pagination
   * Query params: limit (default 50), cursor (optional)
   */
  @Get()
  findAll(
    @Request() req: any,
    @Param('channelId') channelId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('parentId') parentId?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    return this.messagesService.findAllByChannel(
      req.user.userId,
      channelId,
      parsedLimit,
      cursor,
      parentId,
    );
  }

  /**
   * POST /channels/:channelId/messages/summary
   * Enqueue an AI summary job and return 202 Accepted + jobId.
   * The result is delivered via WebSocket event `summary_generated`.
   */
  @Post('summary')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestSummary(
    @Request() req: any,
    @Param('channelId') channelId: string,
  ) {
    const jobData: ChannelSummaryJobData = {
      type: 'channel',
      channelId,
      userId: req.user.userId,
    };
    const job = await this.summaryQueue.add('channel-summary', jobData, {
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
   * POST /channels/:channelId/messages/:messageId/reactions
   * Add a reaction to a message (workspace members only)
   */
  @Post(':messageId/reactions')
  @HttpCode(HttpStatus.CREATED)
  addReaction(
    @Request() req: any,
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @Body() addReactionDto: AddReactionDto,
  ) {
    return this.messagesService.addReaction(req.user.userId, channelId, messageId, addReactionDto);
  }

  /**
   * DELETE /channels/:channelId/messages/:messageId/reactions/:reactionId
   * Remove a reaction (only the reaction owner can remove)
   */
  @Delete(':messageId/reactions/:reactionId')
  @HttpCode(HttpStatus.OK)
  removeReaction(
    @Request() req: any,
    @Param('reactionId') reactionId: string,
  ) {
    return this.messagesService.removeReaction(req.user.userId, reactionId);
  }

  /**
   * PATCH /channels/:channelId/messages/:messageId
   * Edit message content (author only).
   * Emits message_updated via WebSocket after a successful DB update.
   */
  @Patch(':messageId')
  async editMessage(
    @Request() req: any,
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @Body() editMessageDto: EditMessageDto,
  ) {
    const updated = await this.messagesService.editMessage(req.user.userId, channelId, messageId, editMessageDto);
    // Emit from the controller — no circular dependency risk here.
    // Wrap in try/catch so a WS failure never crashes the HTTP response.
    try {
      this.chatGateway.emitMessageUpdated(channelId, updated);
    } catch (err) {
      this.logger.error('Failed to emit message_updated WS event', err);
    }
    return updated;
  }

  /**
   * POST /channels/:channelId/messages/:messageId/pin
   * Toggle pin on a message (workspace admins/owners or channel owner).
   */
  @Post(':messageId/pin')
  @HttpCode(HttpStatus.OK)
  async pinMessage(
    @Request() req: any,
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
  ) {
    return this.messagesService.togglePin(req.user.userId, channelId, messageId);
  }

  /**
   * DELETE /channels/:channelId/messages/bulk
   * Bulk delete messages (author can delete own; admins can delete any).
   */
  @Delete('bulk')
  @HttpCode(HttpStatus.OK)
  async bulkDeleteMessages(
    @Request() req: any,
    @Param('channelId') channelId: string,
    @Body() body: { messageIds: string[] },
  ) {
    const userId = req.user.userId;
    const deleted: string[] = [];
    for (const messageId of body.messageIds ?? []) {
      try {
        await this.messagesService.deleteMessage(userId, channelId, messageId);
        this.chatGateway.emitMessageDeleted(channelId, { messageId, channelId });
        deleted.push(messageId);
      } catch {
        // Skip messages user can't delete (403/404) — delete what we can
      }
    }
    return { deleted };
  }

  /**
   * DELETE /channels/:channelId/messages/:messageId
   * Hard-delete a message (author only).
   * Emits message_deleted via WebSocket after a successful DB delete.
   */
  @Delete(':messageId')
  @HttpCode(HttpStatus.OK)
  async deleteMessage(
    @Request() req: any,
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
  ) {
    const result = await this.messagesService.deleteMessage(req.user.userId, channelId, messageId);
    // Wrap in try/catch so a WS failure never crashes the HTTP response.
    try {
      this.chatGateway.emitMessageDeleted(channelId, { messageId, channelId });
    } catch (err) {
      this.logger.error('Failed to emit message_deleted WS event', err);
    }
    return result;
  }

  /**
   * POST /channels/:channelId/messages/:messageId/save
   * Toggle save (bookmark) a message for the current user.
   */
  @Post(':messageId/save')
  saveMessage(
    @Request() req: any,
    @Param('messageId') messageId: string,
  ) {
    return this.messagesService.saveMessage(req.user.userId, messageId);
  }

  /**
   * POST /channels/:channelId/messages/:messageId/poll/vote
   * Cast or retract a vote on a poll option.
   */
  @Post(':messageId/poll/vote')
  @HttpCode(HttpStatus.OK)
  async votePoll(
    @Request() req: any,
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @Body() body: { optionId: string },
  ) {
    const result = await this.messagesService.votePoll(req.user.userId, messageId, body.optionId);
    // Broadcast real-time poll update to channel room
    this.chatGateway.broadcastPollUpdate(channelId, result);
    return result;
  }

  /**
   * PATCH /channels/:channelId/messages/:messageId/poll/close
   * Close a poll (creator only).
   */
  @Patch(':messageId/poll/close')
  @HttpCode(HttpStatus.OK)
  async closePoll(
    @Request() req: any,
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
  ) {
    const result = await this.messagesService.closePoll(req.user.userId, messageId);
    this.chatGateway.broadcastPollUpdate(channelId, result);
    return result;
  }
}
