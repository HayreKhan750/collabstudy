import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Required for optimized Docker builds — copies only the necessary files
  // into a self-contained .next/standalone directory.
  output: "standalone",

  // Point Turbopack root to the monorepo root so it can resolve packages from
  // the shared node_modules while avoiding climbing above the repo boundary.
  turbopack: {
    root: require('path').resolve(__dirname, '../..'),
  },
};

// Wrap with Sentry's Next.js plugin for build-time source map upload
// and automatic instrumentation of server components and API routes.
// When SENTRY_DSN is not set, this is a transparent pass-through.
export default withSentryConfig(nextConfig, {
  // Suppress Sentry CLI output during builds (set to false to debug)
  silent: true,

  // Upload source maps to Sentry for readable stack traces.
  // Requires SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT env vars.
  widenClientFileUpload: true,

  // Automatically tree-shake Sentry logger statements in production
  disableLogger: true,

  // Route browser requests to Sentry through a Next.js rewrite to avoid
  // ad-blockers. This can increase server load — disable if not needed.
  tunnelRoute: "/monitoring",

  // Automatically instrument React component display names for better
  // component tracking in Sentry performance monitoring.
  reactComponentAnnotation: {
    enabled: true,
  },
});
