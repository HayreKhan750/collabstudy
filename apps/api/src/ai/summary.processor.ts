import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SUMMARY_QUEUE, SummaryJobData } from './summary.queue';
import { AiService } from './ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChatGateway } from '../chat/chat.gateway';

@Processor(SUMMARY_QUEUE, {
  concurrency: 2, // process at most 2 summary jobs in parallel
})
export class SummaryProcessor extends WorkerHost {
  private readonly logger = new Logger(SummaryProcessor.name);

  constructor(
    private readonly aiService: AiService,
    private readonly prisma: PrismaService,
    private readonly chatGateway: ChatGateway,
  ) {
    super();
  }

  async process(job: Job<SummaryJobData>): Promise<{ summary: string }> {
    this.logger.log(`1. Summary request received — job ${job.id} type=${job.data.type} attempt=${job.attemptsMade + 1}`);

    const { data } = job;

    try {
      let transcript = '';
      let roomKey = '';

      if (data.type === 'channel') {
        this.logger.log(`2. Fetching message history for channel ${data.channelId}...`);
        // Fetch last 50 top-level messages in the channel (no soft-delete in schema)
        const messages = await this.prisma.message.findMany({
          where: { channelId: data.channelId, parentId: null },
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { user: { select: { username: true } } },
        });
        messages.reverse();
        transcript = messages
          .map((m) => `${m.user.username}: ${m.content ?? '[attachment]'}`)
          .join('\n');
        roomKey = `channel:${data.channelId}`;
      } else {
        this.logger.log(`2. Fetching message history for conversation ${data.conversationId}...`);
        // Fetch last 50 DM messages in the conversation
        const messages = await this.prisma.directMessage.findMany({
          where: { conversationId: data.conversationId },
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { sender: { select: { username: true } } },
        });
        messages.reverse();
        transcript = messages
          .map((m) => `${m.sender.username}: ${m.content ?? '[attachment]'}`)
          .join('\n');
        roomKey = `direct:${data.conversationId}`;
      }

      if (!transcript.trim()) {
        const summary = 'No messages to summarise yet.';
        this.chatGateway.emitSummaryGenerated(roomKey, {
          jobId: job.id!,
          summary,
          ...(data.type === 'channel'
            ? { channelId: data.channelId }
            : { conversationId: data.conversationId }),
        });
        return { summary };
      }

      this.logger.log(`3. Calling external AI API (Gemini) for job ${job.id}...`);
      const summary = await this.aiService.summarise(transcript);

      this.logger.log(`4. Summary job ${job.id} completed successfully — emitting to room ${roomKey}`);

      // Emit WebSocket event so frontend updates in real-time
      this.chatGateway.emitSummaryGenerated(roomKey, {
        jobId: job.id!,
        summary,
        ...(data.type === 'channel'
          ? { channelId: data.channelId }
          : { conversationId: data.conversationId }),
      });

      return { summary };
    } catch (err) {
      this.logger.error(`❌ AI API ERROR — Summary job ${job.id} failed (attempt ${job.attemptsMade + 1}):`, err);

      // On final attempt (no more retries), emit an error event to the frontend
      // so it doesn't have to wait for the 15s client-side timeout.
      const maxAttempts = (job.opts?.attempts ?? 1);
      if (job.attemptsMade + 1 >= maxAttempts) {
        const { data } = job;
        const roomKey = data.type === 'channel'
          ? `channel:${data.channelId}`
          : `direct:${data.conversationId}`;
        const errorPayload = {
          error: true,
          summary: '⚠️ AI summary failed after multiple attempts. Please try again later.',
          ...(data.type === 'channel'
            ? { channelId: data.channelId }
            : { conversationId: data.conversationId }),
        };
        this.logger.log(`Emitting summary_generated (error) to room ${roomKey} after final attempt`);
        this.chatGateway.emitSummaryGenerated(roomKey, errorPayload);
      }

      // Re-throw so BullMQ retries with exponential backoff
      throw err;
    }
  }
}
