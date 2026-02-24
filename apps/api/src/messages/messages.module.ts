import { Module, forwardRef } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ChannelsModule } from '../channels/channels.module';
import { ChatModule } from '../chat/chat.module';
import { AiModule } from '../ai/ai.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [PrismaModule, ChannelsModule, forwardRef(() => ChatModule), AiModule, UploadModule],
  providers: [MessagesService],
  controllers: [MessagesController],
  exports: [MessagesService],
})
export class MessagesModule {}
