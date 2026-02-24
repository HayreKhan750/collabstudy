import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * GET /health — lightweight liveness probe.
   * NOT throttle-skipped — used to verify rate limiting is active.
   */
  @Get('health')
  health(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  /**
   * GET /health/skip — skips throttle, for internal monitoring.
   */
  @SkipThrottle()
  @Get('health/skip')
  healthSkip(): { status: string } {
    return { status: 'ok' };
  }
}
