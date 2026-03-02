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
# Strategy: directly DELETE the failed migration row from _prisma_migrations
# so that `migrate deploy` re-applies it from scratch. The migration SQL uses
# IF NOT EXISTS guards so re-running is fully idempotent and safe.
#
# We use psql (available via the DATABASE_URL env var) to run the SQL directly,
# bypassing the Prisma CLI which itself errors out (P3009) when resolving.
#
# To add more migrations to this list in future, append their names below.
# ---------------------------------------------------------------------------
FAILED_MIGRATIONS="
  20260220000000_init
  20260221000000_add_pg_trgm_and_gin_index
  20260227000000_add_direct_message_reactions
"

if [ -n "$DATABASE_URL" ]; then
  for migration in $FAILED_MIGRATIONS; do
    echo "🔍 Checking for failed migration: $migration"
    # Delete the failed migration row so migrate deploy re-applies it.
    # This is equivalent to `prisma migrate resolve --rolled-back` but done
    # directly in SQL to avoid the P3009 chicken-and-egg problem in the CLI.
    RESULT=$(psql "$DATABASE_URL" -tAc \
      "DELETE FROM _prisma_migrations WHERE migration_name = '$migration' AND finished_at IS NULL RETURNING migration_name;" \
      2>/dev/null || true)
    if [ -n "$RESULT" ]; then
      echo "↩️  Removed failed migration record: $RESULT (will be re-applied)"
    else
      echo "ℹ️  No failed record found for $migration — already resolved or not present"
    fi
  done
else
  echo "⚠️  DATABASE_URL not set — skipping failed migration resolution"
fi

echo "⏳ Running Prisma database migrations..."

$PRISMA migrate deploy $SCHEMA

echo "✅ Migrations complete. Starting CollabStudy API..."

# Hand off to the main process (node dist/main).
# `exec` replaces the shell with node so dumb-init can properly manage signals.
exec "$@"
