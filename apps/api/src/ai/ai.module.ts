import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AiService } from './ai.service';
import { SummaryProcessor } from './summary.processor';
import { SUMMARY_QUEUE } from './summary.queue';
import { EmbeddingsProcessor } from './embeddings.processor';
import { EMBEDDINGS_QUEUE } from './embeddings.queue';
import { PrismaModule } from '../prisma/prisma.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [
    // Summary queue — AI channel/DM summarisation jobs
    BullModule.registerQueue({
      name: SUMMARY_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2_000, // 2s, 4s, 8s
        },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    }),
    // Phase 11.1: Embeddings queue — async vector generation for every new message
    BullModule.registerQueue({
      name: EMBEDDINGS_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 3_000, // 3s, 6s, 12s — Gemini embedding API is slightly slower
        },
        removeOnComplete: 50,  // embeddings are fire-and-forget; minimal history needed
        removeOnFail: 100,     // keep failed jobs longer for debugging
      },
    }),
    PrismaModule,
    forwardRef(() => ChatModule),
  ],
  providers: [AiService, SummaryProcessor, EmbeddingsProcessor],
  exports: [AiService, BullModule],
})
export class AiModule {}

