/**
 * Sentry Edge Runtime Configuration — Phase 12.5
 *
 * This file is automatically loaded by @sentry/nextjs for code running in the
 * Vercel/Next.js Edge Runtime (middleware, edge API routes).
 * The Edge runtime has a restricted API — fewer integrations are available.
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.NEXT_PUBLIC_GIT_SHA ?? 'local',

    // Low sample rate for edge functions — they run on every request
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 1.0,

    enabled: process.env.NODE_ENV === 'production',
  });
}
