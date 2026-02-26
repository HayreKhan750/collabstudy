/**
 * Sentry Server-Side Configuration — Phase 12.5
 *
 * This file is automatically loaded by @sentry/nextjs for Node.js server code
 * (App Router server components, API routes, middleware running on Node).
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.NEXT_PUBLIC_GIT_SHA ?? 'local',

    // Capture 10% of server-side transactions in production
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    enabled: process.env.NODE_ENV === 'production',
  });
}
