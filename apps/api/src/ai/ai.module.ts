import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AiService } from './ai.service';
import { SummaryProcessor } from './summary.processor';
import { SUMMARY_QUEUE } from './summary.queue';
import { PrismaModule } from '../prisma/prisma.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [
    // Register the summary queue — connects to Redis via REDIS_URL env var
    BullModule.registerQueue({
      name: SUMMARY_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2_000, // 2s, 4s, 8s
        },
        removeOnComplete: 100, // keep last 100 completed jobs for status polling
        removeOnFail: 50,      // keep last 50 failed jobs for debugging
      },
    }),
    PrismaModule,
    forwardRef(() => ChatModule),
  ],
  providers: [AiService, SummaryProcessor],
  exports: [AiService, BullModule],
})
export class AiModule {}

