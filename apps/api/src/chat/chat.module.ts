import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ChatGateway } from './chat.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { ChannelsModule } from '../channels/channels.module';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => ChannelsModule),
    forwardRef(() => MetricsModule),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your_jwt_secret_change_in_production',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  providers: [ChatGateway],
  exports: [ChatGateway],
})
export class ChatModule {}
