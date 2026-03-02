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

PRISMA="node /app/packages/db/node_modules/prisma/build/index.js"
SCHEMA="--schema=/app/packages/db/prisma/schema.prisma"

# ---------------------------------------------------------------------------
# Resolve any migrations that are stuck in a "failed" state in the database.
# This happens when a migration script partially executes and then errors out,
# leaving a row in _prisma_migrations with applied_steps_count < steps_count.
# Prisma refuses to run new migrations until failed ones are resolved.
#
# Strategy: mark each known-failed migration as "rolled back" so Prisma will
# re-attempt it on the next `migrate deploy`. The SQL in each migration is
# written with IF NOT EXISTS / IF EXISTS guards so re-running is safe.
#
# To add more migrations to this list in future, append their directory name.
# ---------------------------------------------------------------------------
FAILED_MIGRATIONS="
  20260221000000_add_pg_trgm_and_gin_index
"

for migration in $FAILED_MIGRATIONS; do
  echo "🔍 Checking migration: $migration"
  # `migrate resolve --rolled-back` exits non-zero if the migration is not in a
  # failed state (e.g. already applied or doesn't exist). That is expected and
  # safe — we suppress stderr for that case and continue.
  if $PRISMA migrate resolve $SCHEMA --rolled-back "$migration" 2>/dev/null; then
    echo "↩️  Marked $migration as rolled back (will be re-applied by migrate deploy)"
  else
    echo "ℹ️  $migration is not in a failed state — nothing to resolve"
  fi
done

echo "⏳ Running Prisma database migrations..."

$PRISMA migrate deploy $SCHEMA

echo "✅ Migrations complete. Starting CollabStudy API..."

# Hand off to the main process (node dist/main).
# `exec` replaces the shell with node so dumb-init can properly manage signals.
exec "$@"
