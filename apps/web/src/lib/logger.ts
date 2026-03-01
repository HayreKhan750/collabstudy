/**
 * logger.ts — thin production-safe logger for the web app.
 *
 * In production (NODE_ENV === 'production') all debug/warn output is
 * suppressed so the console stays completely clean.
 * Errors are always surfaced (they indicate bugs that need fixing).
 */

const isProd = process.env.NODE_ENV === 'production';

export const logger = {
  /** Operational info — suppressed in production */
  info: (...args: unknown[]) => {
    if (!isProd) console.info(...args);
  },

  /** Expected-path warnings (e.g. network hiccups) — suppressed in production */
  warn: (...args: unknown[]) => {
    if (!isProd) console.warn(...args);
  },

  /** Unexpected errors — always shown (Sentry will pick these up in prod) */
  error: (...args: unknown[]) => {
    console.error(...args);
  },

  /** Debug-only output — suppressed in production */
  debug: (...args: unknown[]) => {
    if (!isProd) console.debug(...args);
  },
};
