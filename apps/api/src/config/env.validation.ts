/**
 * Environment Variable Validation — Phase 12.1
 *
 * Called once at startup (bootstrap) before the NestJS app is created.
 * Throws a descriptive error and exits with code 1 if any required variable
 * is missing or invalid, preventing silent misconfiguration in production.
 */

interface EnvVar {
  name: string;
  description: string;
  required: boolean;
  /** Optional validator — return an error message string if invalid, undefined if ok */
  validate?: (value: string) => string | undefined;
}

const ENV_VARS: EnvVar[] = [
  // ── Database ────────────────────────────────────────────────────────────
  {
    name: 'DATABASE_URL',
    description: 'PostgreSQL connection string (e.g. postgresql://user:pass@host:5432/dbname)',
    required: true,
    validate: (v) =>
      v.startsWith('postgresql://') || v.startsWith('postgres://')
        ? undefined
        : 'Must be a valid PostgreSQL connection string starting with postgresql:// or postgres://',
  },

  // ── Redis ────────────────────────────────────────────────────────────────
  {
    name: 'REDIS_HOST',
    description: 'Redis hostname (e.g. localhost or redis in Docker)',
    required: true,
  },
  {
    name: 'REDIS_PORT',
    description: 'Redis port number (default: 6379)',
    required: false,
    validate: (v) => {
      const n = parseInt(v, 10);
      return Number.isInteger(n) && n > 0 && n < 65536
        ? undefined
        : 'Must be a valid port number between 1 and 65535';
    },
  },

  // ── Auth / JWT ────────────────────────────────────────────────────────────
  {
    name: 'JWT_SECRET',
    description: 'Secret key used to sign JWT access tokens — must be at least 32 characters',
    required: true,
    validate: (v) =>
      v.length >= 32
        ? undefined
        : `JWT_SECRET is too short (${v.length} chars). Use at least 32 random characters for security.`,
  },

  // ── Gemini AI ─────────────────────────────────────────────────────────────
  {
    name: 'GEMINI_API_KEY',
    description: 'Google Gemini API key for AI features (summaries, embeddings, digest)',
    required: false, // Gracefully degraded when absent
  },

  // ── S3 / Object Storage ───────────────────────────────────────────────────
  // All S3 vars are optional — when absent the app falls back to local disk.
  {
    name: 'AWS_ACCESS_KEY_ID',
    description: 'AWS (or S3-compatible) access key ID for file storage',
    required: false,
  },
  {
    name: 'AWS_SECRET_ACCESS_KEY',
    description: 'AWS (or S3-compatible) secret access key for file storage',
    required: false,
  },
  {
    name: 'AWS_S3_BUCKET_NAME',
    description: 'S3 bucket name where uploaded files are stored',
    required: false,
  },
  {
    name: 'S3_REGION',
    description: 'AWS region for S3 (e.g. us-east-1)',
    required: false,
  },
  {
    name: 'AWS_S3_ENDPOINT',
    description:
      'Custom S3 endpoint URL for non-AWS providers (Supabase, Cloudflare R2, MinIO). Leave blank for AWS.',
    required: false,
  },

  // ── Sentry ────────────────────────────────────────────────────────────────
  {
    name: 'SENTRY_DSN',
    description: 'Sentry DSN for error tracking and performance monitoring (optional but recommended in production)',
    required: false,
    // Warn (not error) in production if missing — app still runs without it
  },

  // ── Server ────────────────────────────────────────────────────────────────
  {
    name: 'PORT',
    description: 'HTTP port the API server listens on (default: 4000)',
    required: false,
    validate: (v) => {
      const n = parseInt(v, 10);
      return Number.isInteger(n) && n > 0 && n < 65536
        ? undefined
        : 'Must be a valid port number between 1 and 65535';
    },
  },
  {
    name: 'NODE_ENV',
    description: 'Runtime environment: development | staging | production',
    required: false,
    validate: (v) =>
      ['development', 'staging', 'production', 'test'].includes(v)
        ? undefined
        : 'Must be one of: development, staging, production, test',
  },
  {
    name: 'CORS_ORIGIN',
    description:
      'Allowed CORS origin for the frontend (e.g. https://app.collabstudy.com). Required in production.',
    required: false,
  },
  {
    name: 'LOG_LEVEL',
    description: 'Pino log level: trace | debug | info | warn | error | fatal (default: info in prod)',
    required: false,
    validate: (v) =>
      ['trace', 'debug', 'info', 'warn', 'error', 'fatal'].includes(v)
        ? undefined
        : 'Must be one of: trace, debug, info, warn, error, fatal',
  },
];

/** Extra production-only checks applied when NODE_ENV === 'production' */
const PRODUCTION_REQUIRED: string[] = [
  'CORS_ORIGIN', // Must be explicitly set in production — no wildcard
  'GEMINI_API_KEY', // AI features are a core product feature in production
];

export function validateEnv(): void {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProduction = process.env.NODE_ENV === 'production';

  for (const envVar of ENV_VARS) {
    const value = process.env[envVar.name];

    if (!value || value.trim() === '') {
      if (envVar.required) {
        errors.push(`  ✗ ${envVar.name} — MISSING (required)\n    → ${envVar.description}`);
      } else if (isProduction && PRODUCTION_REQUIRED.includes(envVar.name)) {
        errors.push(
          `  ✗ ${envVar.name} — MISSING (required in production)\n    → ${envVar.description}`,
        );
      } else if (!envVar.required) {
        warnings.push(`  ⚠  ${envVar.name} — not set (optional, using default if available)`);
      }
      continue;
    }

    // Run custom validator if present
    if (envVar.validate) {
      const errorMessage = envVar.validate(value.trim());
      if (errorMessage) {
        errors.push(`  ✗ ${envVar.name} — INVALID\n    → ${errorMessage}`);
      }
    }
  }

  const divider = '─'.repeat(60);

  if (warnings.length > 0 && process.env.NODE_ENV !== 'test') {
    console.warn(`\n${divider}`);
    console.warn('⚠  CollabStudy API — Environment Warnings');
    console.warn(divider);
    warnings.forEach((w) => console.warn(w));
    console.warn(`${divider}\n`);
  }

  if (errors.length > 0) {
    console.error(`\n${divider}`);
    console.error('🚨 CollabStudy API — Environment Configuration Error');
    console.error(divider);
    console.error('The following required environment variables are missing or invalid:\n');
    errors.forEach((e) => console.error(e));
    console.error(`\n${divider}`);
    console.error('💡 Copy apps/api/.env.example → apps/api/.env and fill in the values.');
    console.error(`${divider}\n`);
    process.exit(1);
  }

  if (process.env.NODE_ENV !== 'test') {
    console.log(`✅ Environment validation passed (${isProduction ? 'production' : process.env.NODE_ENV ?? 'development'} mode)`);
  }
}
