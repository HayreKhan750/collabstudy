/**
 * Sentry Client-Side Configuration — Phase 12.5
 *
 * This file is automatically loaded by @sentry/nextjs for browser-side code.
 * It initializes Sentry for client-side error and performance monitoring.
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.NEXT_PUBLIC_GIT_SHA ?? 'local',

    // Capture 10% of transactions in production for performance monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Session replay — record 10% of sessions, 100% of sessions with errors
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    integrations: [
      Sentry.replayIntegration({
        // Mask all text and block all media by default (privacy-first)
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],

    // Do not capture errors for localhost in development unless explicitly enabled
    enabled: process.env.NODE_ENV === 'production',
  });
}
