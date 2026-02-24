import { Module, forwardRef } from '@nestjs/common';
import { ChannelsService } from './channels.service';
import { ChannelsController, ReadReceiptController, ChannelManagementController } from './channels.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ChatModule } from '../chat/chat.module';
import { RolesGuard } from '../auth/guards/roles.guard';

@Module({
  imports: [PrismaModule, forwardRef(() => ChatModule)],
  providers: [ChannelsService, RolesGuard],
  controllers: [ChannelsController, ReadReceiptController, ChannelManagementController],
  exports: [ChannelsService],
})
export class ChannelsModule {}
