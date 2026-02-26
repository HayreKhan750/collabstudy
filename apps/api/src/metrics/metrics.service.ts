/**
 * MetricsService — Phase 12.4
 *
 * Central registry for all Prometheus metrics.
 * Singleton — injected wherever metrics need to be recorded.
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import { collectDefaultMetrics, Registry, Histogram, Gauge, Counter } from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  /** Shared Prometheus registry — all metrics are registered here. */
  readonly registry = new Registry();

  // ── HTTP Metrics ──────────────────────────────────────────────────────────

  /**
   * http_request_duration_seconds
   * Records the duration of every HTTP request, labelled by method, route,
   * and HTTP status code. Used to compute p50/p99 latency and error rates.
   */
  readonly httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'] as const,
    // Buckets chosen for a web API: <10ms, 25ms, 50ms, 100ms, 250ms, 500ms, 1s, 2.5s, 5s, 10s
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });

  /**
   * http_requests_total
   * Counter of all HTTP requests by method, route, and status code.
   * Enables calculation of overall request rate and error rate (5xx / total).
   */
  readonly httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [this.registry],
  });

  // ── WebSocket Metrics ─────────────────────────────────────────────────────

  /**
   * ws_connected_clients_total
   * Current number of authenticated Socket.io connections.
   * Incremented on handleConnection, decremented on handleDisconnect.
   */
  readonly wsConnectedClients = new Gauge({
    name: 'ws_connected_clients_total',
    help: 'Number of currently connected WebSocket clients',
    registers: [this.registry],
  });

  // ── BullMQ Queue Metrics ──────────────────────────────────────────────────

  /**
   * bullmq_queue_depth_total
   * Number of waiting (pending) jobs per queue.
   * Polled every 30 seconds by QueueMetricsService.
   */
  readonly queueDepth = new Gauge({
    name: 'bullmq_queue_depth_total',
    help: 'Number of pending jobs in each BullMQ queue',
    labelNames: ['queue'] as const,
    registers: [this.registry],
  });

  /**
   * bullmq_queue_active_total
   * Number of actively-processing jobs per queue.
   */
  readonly queueActive = new Gauge({
    name: 'bullmq_queue_active_total',
    help: 'Number of active (processing) jobs in each BullMQ queue',
    labelNames: ['queue'] as const,
    registers: [this.registry],
  });

  /**
   * bullmq_queue_failed_total
   * Number of failed jobs per queue (accumulated, not rate).
   */
  readonly queueFailed = new Gauge({
    name: 'bullmq_queue_failed_total',
    help: 'Number of failed jobs in each BullMQ queue',
    labelNames: ['queue'] as const,
    registers: [this.registry],
  });

  onModuleInit(): void {
    // Register default Node.js metrics: process CPU, memory, event loop lag,
    // GC duration, heap size, open file descriptors, etc.
    collectDefaultMetrics({ register: this.registry, prefix: 'nodejs_' });
  }

  /** Returns the full Prometheus text exposition. */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /** Content-type header value for Prometheus scraping. */
  get contentType(): string {
    return this.registry.contentType;
  }
}
