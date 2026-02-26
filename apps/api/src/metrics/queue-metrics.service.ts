/**
 * QueueMetricsService — Phase 12.4
 *
 * Polls BullMQ queue depths every 30 seconds and updates the Prometheus
 * gauges in MetricsService. This keeps the metrics endpoint cheap to scrape
 * (no live queue inspection per scrape request).
 *
 * Queues monitored:
 *   - SUMMARY_QUEUE  (AI channel/DM summarisation)
 *   - EMBEDDINGS_QUEUE (pgvector embedding generation)
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { MetricsService } from './metrics.service';
import { SUMMARY_QUEUE } from '../ai/summary.queue';
import { EMBEDDINGS_QUEUE } from '../ai/embeddings.queue';

/** Polling interval in milliseconds. */
const POLL_INTERVAL_MS = 30_000;

@Injectable()
export class QueueMetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueMetricsService.name);
  private pollTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly metricsService: MetricsService,
    @InjectQueue(SUMMARY_QUEUE)
    private readonly summaryQueue: Queue,
    @InjectQueue(EMBEDDINGS_QUEUE)
    private readonly embeddingsQueue: Queue,
  ) {}

  onModuleInit(): void {
    // Run once immediately at startup, then every POLL_INTERVAL_MS
    this.updateQueueMetrics().catch(() => {});
    this.pollTimer = setInterval(() => {
      this.updateQueueMetrics().catch((err: Error) => {
        this.logger.warn(`Queue metrics poll error: ${err.message}`);
      });
    }, POLL_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
  }

  private async updateQueueMetrics(): Promise<void> {
    const queues: Array<{ queue: Queue; name: string }> = [
      { queue: this.summaryQueue, name: SUMMARY_QUEUE },
      { queue: this.embeddingsQueue, name: EMBEDDINGS_QUEUE },
    ];

    for (const { queue, name } of queues) {
      try {
        // getJobCounts returns: { waiting, active, completed, failed, delayed, paused }
        const counts = await queue.getJobCounts('waiting', 'active', 'failed');

        this.metricsService.queueDepth.set({ queue: name }, counts.waiting ?? 0);
        this.metricsService.queueActive.set({ queue: name }, counts.active ?? 0);
        this.metricsService.queueFailed.set({ queue: name }, counts.failed ?? 0);
      } catch (err) {
        // Redis may be temporarily unavailable — log and continue
        this.logger.warn(`Failed to fetch job counts for queue "${name}": ${(err as Error).message}`);
      }
    }
  }
}
