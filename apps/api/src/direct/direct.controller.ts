import {
  Controller,
  Get,
  Post,
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
    console.log('🚦 [1] Route hit! Received DM summary request for conversationId:', conversationId);
    const jobData: DmSummaryJobData = {
      type: 'dm',
      conversationId,
      userId: req.user.userId,
    };
    console.log('🚦 [2] About to enqueue job to BullMQ / Redis...');
    const job = await this.summaryQueue.add('dm-summary', jobData, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2_000 },
    });
    console.log('🚦 [3] Job enqueued! jobId:', job.id, '— Sending HTTP 202 response...');
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
