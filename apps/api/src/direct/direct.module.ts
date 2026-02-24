import { Module, forwardRef } from '@nestjs/common';
import { DirectController } from './direct.controller';
import { DirectService } from './direct.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ChatModule } from '../chat/chat.module';
import { AiModule } from '../ai/ai.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [PrismaModule, forwardRef(() => ChatModule), AiModule, UploadModule],
  controllers: [DirectController],
  providers: [DirectService],
  exports: [DirectService],
})
export class DirectModule {}
