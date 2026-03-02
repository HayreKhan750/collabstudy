#!/bin/sh
# =============================================================================
# CollabStudy API — Docker Entrypoint
# =============================================================================
# Runs Prisma migrate deploy before starting the NestJS server.
#
# Why here and not in docker-compose.prod.yml?
# - An init container in Compose is not natively supported in Docker Compose v2
#   without a workaround. Running migrations inside the app container's startup
#   is the simplest, safest approach for a single-node deployment.
# - `prisma migrate deploy` is IDEMPOTENT — it only applies pending migrations
#   and exits cleanly if everything is already up to date.
# - If the migration fails, this script exits non-zero and the container
#   restarts (thanks to `restart: unless-stopped`), preventing a broken app
#   from serving traffic against a mismatched schema.
#
# For multi-instance (horizontal scaling) deployments:
#   Run migrations as a one-off task BEFORE scaling up new instances.
#   See docs/MIGRATION_STRATEGY.md for details.
# =============================================================================

set -e  # Exit immediately if any command fails

echo "⏳ Running Prisma database migrations..."

node /app/packages/db/node_modules/prisma/build/index.js migrate deploy --schema=/app/packages/db/prisma/schema.prisma

echo "✅ Migrations complete. Starting CollabStudy API..."

# Hand off to the main process (node dist/main).
# `exec` replaces the shell with node so dumb-init can properly manage signals.
exec "$@"
