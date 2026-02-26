/**
 * MetricsController — Phase 12.4
 *
 * Exposes GET /metrics in Prometheus text format.
 *
 * SECURITY NOTE: This endpoint should be restricted at the infrastructure
 * level (nginx, firewall, VPC security group) so only the Prometheus scraper
 * can reach it — NOT exposed to the public internet.
 *
 * It is intentionally excluded from JwtAuthGuard via SkipThrottle + no guard
 * decorator, so Prometheus can scrape it without auth headers.
 */

import { Controller, Get, Header, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { MetricsService } from './metrics.service';

@Controller('metrics')
@SkipThrottle() // Prometheus scrapes frequently — exempt from rate limiting
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @Header('Cache-Control', 'no-cache, no-store, must-revalidate')
  async getMetrics(@Res() res: Response): Promise<void> {
    const metrics = await this.metricsService.getMetrics();
    res.set('Content-Type', this.metricsService.contentType);
    res.send(metrics);
  }
}
