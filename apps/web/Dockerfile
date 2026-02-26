# =============================================================================
# CollabStudy Web — Multi-Stage Production Dockerfile (Next.js Standalone)
# =============================================================================
# Stage 1 (deps):     installs production dependencies
# Stage 2 (builder):  builds the Next.js application with standalone output
# Stage 3 (runner):   minimal image — only the standalone bundle + static assets
# =============================================================================
# Requires next.config.ts to have: output: 'standalone'
# =============================================================================

# ── Stage 1: Dependency Installer ─────────────────────────────────────────────
FROM node:20-alpine AS deps

RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

# Install all dependencies
RUN pnpm install --frozen-lockfile


# ── Stage 2: Builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

# Copy all source files
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/
COPY package.json pnpm-workspace.yaml ./

# Set Next.js telemetry to disabled for CI/Docker builds
ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js — produces .next/standalone + .next/static
WORKDIR /app/apps/web
RUN pnpm run build


# ── Stage 3: Production Runner ────────────────────────────────────────────────
FROM node:20-alpine AS production

RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001 -G nodejs

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Default port — override with PORT env var in compose/k8s
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy the Next.js standalone bundle (self-contained Node server)
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
# Copy static assets (CSS, JS chunks, images)
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
# Copy public directory (favicons, ringtone, svgs, etc.)
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]

# The standalone server.js is output at the root of the standalone bundle
# Next.js places it at: .next/standalone/apps/web/server.js
CMD ["node", "apps/web/server.js"]
