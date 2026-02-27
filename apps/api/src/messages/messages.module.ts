import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ChannelsModule } from '../channels/channels.module';
import { ChatModule } from '../chat/chat.module';
import { AiModule } from '../ai/ai.module';
import { UploadModule } from '../upload/upload.module';
import { UsersModule } from '../users/users.module';
import { EMBEDDINGS_QUEUE } from '../ai/embeddings.queue';
import { SUMMARY_QUEUE } from '../ai/summary.queue';

@Module({
  imports: [
    PrismaModule,
    ChannelsModule,
    forwardRef(() => ChatModule),
    AiModule,
    UploadModule,
    UsersModule,
    // ⚠️  CRITICAL FIX: MessagesService injects @InjectQueue(EMBEDDINGS_QUEUE) and
    // MessagesController injects @InjectQueue(SUMMARY_QUEUE).  BullMQ queue tokens
    // are scoped to the module that registers them — re-exporting BullModule from
    // AiModule is NOT sufficient; the queues must also be registered here so NestJS
    // DI can resolve @InjectQueue() within this module's providers/controllers.
    BullModule.registerQueue({ name: EMBEDDINGS_QUEUE }),
    BullModule.registerQueue({ name: SUMMARY_QUEUE }),
  ],
  providers: [MessagesService],
  controllers: [MessagesController],
  exports: [MessagesService],
})
export class MessagesModule {}
