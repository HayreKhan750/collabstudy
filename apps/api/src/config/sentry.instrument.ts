/**
 * Sentry Instrumentation — Phase 12.5
 *
 * IMPORTANT: This file must be imported FIRST in main.ts — before any other
 * imports — so Sentry can instrument all modules (NestJS, Prisma, HTTP, etc.)
 * via automatic OpenTelemetry instrumentation.
 *
 * This is intentionally a side-effect-only import:
 *   import './config/sentry.instrument';
 */

import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

const dsn = process.env.SENTRY_DSN;

// Only initialize when a DSN is provided — gracefully skipped in development
// or when SENTRY_DSN is not configured. No error is thrown.
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.GIT_SHA ?? 'local',

    // Performance monitoring — capture 10% of requests in production,
    // 100% in non-production for easier debugging.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Profiling — captures CPU profiles for sampled transactions.
    // Profiling sample rate is relative to tracesSampleRate.
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    integrations: [
      // CPU profiling
      nodeProfilingIntegration(),
    ],

    // Do not capture errors in test environments
    enabled: process.env.NODE_ENV !== 'test',
  });

  console.log('🔍 Sentry initialized (API) — environment:', process.env.NODE_ENV ?? 'development');
} else if (process.env.NODE_ENV === 'production') {
  // Warn in production if Sentry is not configured — don't crash.
  console.warn('⚠  SENTRY_DSN is not set. Error tracking is disabled. Set SENTRY_DSN to enable Sentry.');
}
