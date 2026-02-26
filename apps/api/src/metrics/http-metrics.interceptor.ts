/**
 * HttpMetricsInterceptor — Phase 12.4
 *
 * NestJS interceptor that records HTTP request duration and count for every
 * request passing through the application, emitting them to the Prometheus
 * registry via MetricsService.
 *
 * Registered globally in app.module.ts via APP_INTERCEPTOR.
 *
 * Labels:
 *   method     — HTTP verb (GET, POST, …)
 *   route      — Normalized route pattern (e.g. /channels/:id/messages)
 *   status_code — HTTP response status (200, 404, 500, …)
 *
 * Note: Uses the Express request URL as a fallback when a matched route
 * pattern is unavailable (e.g. for 404 paths).
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request, Response } from 'express';
import { MetricsService } from './metrics.service';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Only track HTTP contexts (not WebSocket events)
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const startTime = process.hrtime.bigint();

    const method = req.method;

    return next.handle().pipe(
      tap({
        next: () => this.record(req, res, method, startTime),
        error: () => this.record(req, res, method, startTime),
      }),
    );
  }

  private record(
    req: Request,
    res: Response,
    method: string,
    startTime: bigint,
  ): void {
    const durationNs = process.hrtime.bigint() - startTime;
    const durationSeconds = Number(durationNs) / 1e9;

    // Use the matched route pattern for accurate labelling.
    // Falls back to the raw URL path (trimmed) to avoid high-cardinality labels
    // from dynamic IDs in unmatched routes.
    const route: string =
      (req.route?.path as string | undefined) ??
      req.path.replace(/\/[0-9a-f-]{8,}/gi, '/:id');

    const statusCode = String(res.statusCode);

    const labels = { method, route, status_code: statusCode };

    this.metricsService.httpRequestDuration.observe(labels, durationSeconds);
    this.metricsService.httpRequestsTotal.inc(labels);
  }
}
