import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  PrismaHealthIndicator,
  MemoryHealthIndicator,
  DiskHealthIndicator,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';

@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly disk: DiskHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      // ── Database ──────────────────────────────────────────────────────────
      () => this.prismaHealth.pingCheck('database', this.prisma),
      // ── Memory ────────────────────────────────────────────────────────────
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),  // 300 MB
      () => this.memory.checkRSS('memory_rss', 512 * 1024 * 1024),    // 512 MB
      // ── Disk ──────────────────────────────────────────────────────────────
      () =>
        this.disk.checkStorage('disk', {
          path: '/',
          thresholdPercent: 0.9, // alert when disk > 90% full
        }),
    ]);
  }
}
