# =============================================================================
# CollabStudy API — Multi-Stage Production Dockerfile
# =============================================================================
# Stage 1 (builder): installs ALL deps, generates Prisma client, compiles TS
# Stage 2 (production): copies only built artifacts and prod deps — minimal image
# =============================================================================

# ── Stage 1: Builder
FROM node:20-alpine AS builder

# Install OS-level build dependencies needed for native addons (bcrypt, etc.)
RUN apk add --no-cache python3 make g++ openssl

# Enable Corepack so pnpm is available
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# ── Copy workspace manifests first for layer caching
# Root workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Package manifests (needed by pnpm workspace resolution)
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/

# App manifest
COPY apps/api/package.json ./apps/api/

# ── Install ALL dependencies (including devDeps for build)
RUN pnpm install --frozen-lockfile

# ── Copy source files
COPY packages/db/ ./packages/db/
COPY packages/shared/ ./packages/shared/
COPY apps/api/ ./apps/api/

# ── Generate Prisma client
RUN pnpm --filter @collabstudy/db exec prisma generate

# ── Build NestJS app
WORKDIR /app/apps/api
RUN pnpm run build

# NOTE: We intentionally skip the --prod prune step to avoid pnpm hoisting
# complexity with the prisma CLI binary. The image is slightly larger but
# guaranteed to work. node_modules/.bin/prisma will always be available.


# ── Stage 2: Production Runner
FROM node:20-alpine AS production

# Install openssl for Prisma binary compatibility + dumb-init for proper signal handling
# postgresql-client provides psql, used in docker-entrypoint.sh to resolve stuck migrations
RUN apk add --no-cache openssl dumb-init postgresql-client
RUN corepack enable && corepack prepare pnpm@latest --activate
# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001 -G nodejs

WORKDIR /app

# ── Copy production artifacts from builder
# Production node_modules (pruned)
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/packages ./packages

# Built NestJS dist
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/package.json ./apps/api/package.json

# Prisma schema (needed at runtime for migrations)
COPY --from=builder --chown=nestjs:nodejs /app/packages/db/prisma ./packages/db/prisma

# Prisma CLI — copy packages/db/node_modules where pnpm hoists the prisma binary
COPY --from=builder --chown=nestjs:nodejs /app/packages/db/node_modules ./packages/db/node_modules

# Local uploads directory (used as fallback when S3 is not configured)
RUN mkdir -p /app/apps/api/uploads && chown nestjs:nodejs /app/apps/api/uploads

# Copy and configure the entrypoint script that runs migrations then starts the app
# cache-bust: v4
COPY --chown=nestjs:nodejs apps/api/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Switch to non-root user
USER nestjs

# Set working directory to the api app
WORKDIR /app/apps/api

# Expose API port (must match PORT env var, default 4000)
EXPOSE 4000

# Use dumb-init to reap zombie processes and forward signals correctly.
# The entrypoint runs `prisma migrate deploy` then execs the CMD below.
ENTRYPOINT ["dumb-init", "--", "/app/docker-entrypoint.sh"]

# Start the compiled NestJS app (passed as $@ to entrypoint)
CMD ["node", "dist/main"]
