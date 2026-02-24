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
    this.logger.log(`Processing summary job ${job.id} type=${job.data.type}`);

    const { data } = job;

    try {
      let transcript = '';
      let roomKey = '';

      if (data.type === 'channel') {
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
        roomKey = `dm:${data.conversationId}`;
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

      const summary = await this.aiService.summarise(transcript);

      this.logger.log(`Summary job ${job.id} completed successfully`);

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
      this.logger.error(`Summary job ${job.id} failed (attempt ${job.attemptsMade + 1}):`, err);
      // Re-throw so BullMQ retries with exponential backoff
      throw err;
    }
  }
}
