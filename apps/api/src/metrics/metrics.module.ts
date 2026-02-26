/**
 * MetricsModule — Phase 12.4 Observability
 *
 * Exposes GET /metrics in Prometheus text format using prom-client.
 * Registers the default Node.js metrics (event loop lag, heap, GC, etc.)
 * plus application-specific metrics:
 *   - http_request_duration_seconds histogram
 *   - ws_connected_clients_total gauge
 *   - bullmq_queue_depth_total gauge
 *
 * The /metrics endpoint is NOT protected by JwtAuthGuard — it should be
 * restricted at the network/infrastructure layer (e.g. only allow Prometheus
 * scraper IP via nginx allow/deny or a firewall rule).
 */

import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { QueueMetricsService } from './queue-metrics.service';
import { BullModule } from '@nestjs/bullmq';
import { SUMMARY_QUEUE } from '../ai/summary.queue';
import { EMBEDDINGS_QUEUE } from '../ai/embeddings.queue';

@Module({
  imports: [
    // Register queue references so QueueMetricsService can inspect depth
    BullModule.registerQueue(
      { name: SUMMARY_QUEUE },
      { name: EMBEDDINGS_QUEUE },
    ),
  ],
  controllers: [MetricsController],
  providers: [MetricsService, QueueMetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
