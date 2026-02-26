import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { AppThrottlerGuard } from './throttler/throttler.guard';
import { ServeStaticModule } from '@nestjs/serve-static';
import { LoggerModule } from 'nestjs-pino';
import { join } from 'path';
import { RedisThrottlerStorage } from './throttler/redis-throttler.storage';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { ChannelsModule } from './channels/channels.module';
import { MessagesModule } from './messages/messages.module';
import { ChatModule } from './chat/chat.module';
import { SearchModule } from './search/search.module';
import { UploadModule } from './upload/upload.module';
import { DirectModule } from './direct/direct.module';
import { HealthModule } from './health/health.module';
import { UsersModule } from './users/users.module';
import { AiModule } from './ai/ai.module';
import { MetricsModule } from './metrics/metrics.module';
import { HttpMetricsInterceptor } from './metrics/http-metrics.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // BullMQ global config — all queues share this Redis connection
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
        password: process.env.REDIS_PASSWORD ?? undefined,
      },
    }),
    // ─── Structured Logging (Phase 8.2) ──────────────────────────────────────
    LoggerModule.forRoot({
      pinoHttp: {
        // In development use pino-pretty for human-readable output;
        // in production emit raw JSON for log aggregators (Datadog, Loki, etc.)
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
            : undefined,
        // Redact sensitive fields from logs
        redact: {
          paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token'],
          censor: '[REDACTED]',
        },
        // Log level: debug in dev, info in prod
        level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
        // Auto-log every HTTP request with method, url, status, responseTime
        autoLogging: true,
        // Quiet down health-check endpoints to avoid log noise
        quietReqLogger: false,
        customSuccessMessage: (req: any, res: any) =>
          `${req.method} ${req.url} → ${res.statusCode}`,
        customErrorMessage: (req: any, res: any, err: Error) =>
          `${req.method} ${req.url} → ${res.statusCode} — ${err.message}`,
        serializers: {
          req(req: any) {
            return { method: req.method, url: req.url, id: req.id };
          },
          res(res: any) {
            return { statusCode: res.statusCode };
          },
        },
      },
    }),
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        // Named throttlers — applied by the global ThrottlerGuard.
        // "default": 60 authenticated requests per minute per user/IP.
        // "strict":  used on auth endpoints (10 req / 60 s).
        // "upload":  used on upload endpoint (10 req / 60 s).
        throttlers: [
          { name: 'default', ttl: 60_000, limit: 60 },
          { name: 'strict',  ttl: 60_000, limit: 10 },
          { name: 'upload',  ttl: 60_000, limit: 10 },
        ],
        storage: new RedisThrottlerStorage(),
      }),
    }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),
    PrismaModule,
    AuthModule,
    WorkspacesModule,
    ChannelsModule,
    MessagesModule,
    ChatModule,
    SearchModule,
    UploadModule,
    DirectModule,
    HealthModule,
    UsersModule,
    AiModule,
    MetricsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Bind custom AppThrottlerGuard globally — adds Retry-After headers
    // and uses userId as the throttle key for authenticated routes.
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },
    // ── Prometheus HTTP metrics interceptor (Phase 12.4) ──────────────────
    // Records request duration + count for every HTTP request globally.
    // Skips WebSocket events automatically (context.getType() check inside).
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
})
export class AppModule {}
