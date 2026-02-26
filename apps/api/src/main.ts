// ⚠ Sentry MUST be imported first — before any other imports.
// This ensures OpenTelemetry can instrument all subsequently loaded modules.
import './config/sentry.instrument';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import helmet from 'helmet';
import { validateEnv } from './config/env.validation';

async function bootstrap() {
  // ── Environment Validation (Phase 12.1) ──────────────────────────────────
  // Fail fast if required env vars are missing or invalid.
  // Must run before anything else so misconfiguration is caught at boot time.
  validateEnv();
  const app = await NestFactory.create(AppModule, {
    // Buffer logs until Pino logger is attached
    bufferLogs: true,
  });

  // Use Pino as the global NestJS logger (replaces default console logger)
  app.useLogger(app.get(Logger));

  // ─── Security Headers (Phase 8.1) ────────────────────────────────────────
  // Determine the API origin for CSP directives.
  // In development the API is on :4000 and the frontend on :3000.
  // We must explicitly allow the API origin in img/media/connect-src so that
  // locally-served uploads (http://localhost:4000/uploads/*) are not blocked.
  const apiPort = process.env.PORT || 4000;
  const apiOrigin = `http://localhost:${apiPort}`;
  const apiOriginWs = `ws://localhost:${apiPort}`;
  const apiOriginWss = `wss://localhost:${apiPort}`;
  const corsOrigin = process.env.CORS_ORIGIN ?? '';

  // Collect any extra allowed origins (LAN IP, staging domain, etc.)
  const extraOrigins = [corsOrigin].filter(Boolean);

  app.use(
    helmet({
      // Content Security Policy — locked down for a chat app
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"], // inline styles needed by Next.js
          // Allow images from:
          //   • same origin (frontend)
          //   • the API server (locally-served /uploads/* files)
          //   • data: URIs (base64 embedded images)
          //   • blob: URIs (canvas / object URLs)
          //   • https: (S3 / CDN in production)
          //   • any extra configured origin
          imgSrc: ["'self'", apiOrigin, 'data:', 'blob:', 'https:', ...extraOrigins],
          // Same logic for audio/video attachments
          mediaSrc: ["'self'", apiOrigin, 'blob:', 'https:', ...extraOrigins],
          // WebSocket + fetch targets
          connectSrc: [
            "'self'",
            apiOrigin,
            apiOriginWs,
            apiOriginWss,
            ...extraOrigins,
          ],
          fontSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          frameSrc: ["'none'"],
          // Do NOT add upgradeInsecureRequests in dev — it would upgrade
          // http://localhost:4000 → https and break everything locally.
          ...(process.env.NODE_ENV === 'production'
            ? { upgradeInsecureRequests: [] }
            : {}),
        },
      },
      // Prevent browsers from MIME-sniffing responses
      noSniff: true,
      // Don't leak the X-Powered-By header
      hidePoweredBy: true,
      // Clickjacking protection
      frameguard: { action: 'deny' },
      // HSTS — only set in production (HTTPS)
      hsts:
        process.env.NODE_ENV === 'production'
          ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
          : false,
      // XSS protection header (legacy browsers)
      xssFilter: true,
      // Referrer policy
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      // crossOriginEmbedderPolicy must be false for WebRTC (getUserMedia)
      crossOriginEmbedderPolicy: false,
      // CORP must be "cross-origin" so our Next.js frontend (port 3000) can
      // load images/media served by the API (port 4000) from the uploads/ dir.
      // The default "same-origin" would block all cross-port resource loads.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // ─── CORS ────────────────────────────────────────────────────────────────
  // In production: ONLY the explicit CORS_ORIGIN is allowed — no wildcards.
  // In development: localhost:3000 and any LAN IPs are additionally allowed.
  const isProduction = process.env.NODE_ENV === 'production';
  const allowedOrigins: string[] = isProduction
    ? // Production: only the configured origin — fail hard if it's missing
      [process.env.CORS_ORIGIN!].filter(Boolean)
    : // Development: localhost + any LAN address + optional CORS_ORIGIN
      [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        process.env.CORS_ORIGIN,
      ].filter(Boolean) as string[];

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin only in development (curl, Postman, mobile apps)
      if (!origin) {
        if (!isProduction) return callback(null, true);
        // In production, reject origin-less requests for API security
        return callback(new Error('CORS: requests without an Origin header are not allowed in production'));
      }
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin "${origin}" is not allowed`));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    // Expose rate-limit headers so clients can back off gracefully
    exposedHeaders: ['Retry-After', 'X-RateLimit-Limit', 'X-RateLimit-Reset'],
  });

  // ─── Global Validation ───────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 4000;
  await app.listen(port);
  app.get(Logger).log(`🚀 CollabStudy API running on http://localhost:${port} [${process.env.NODE_ENV ?? 'development'}]`);
}
bootstrap();
