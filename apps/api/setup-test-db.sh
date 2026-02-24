#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# setup-test-db.sh
# One-time script to create the collabstudy_test database.
# Run this once before running e2e tests for the first time.
#
# Usage:
#   bash apps/api/setup-test-db.sh
# ---------------------------------------------------------------------------

set -e

DB_USER="collabstudy"
DB_PASSWORD="collabstudy123"
DB_HOST="localhost"
DB_PORT="5432"
TEST_DB="collabstudy_test"

echo "Creating test database: $TEST_DB"

# Try via docker exec first (no psql required locally)
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "collabstudy-postgres"; then
  docker exec collabstudy-postgres psql -U "$DB_USER" -tc \
    "SELECT 1 FROM pg_database WHERE datname = '$TEST_DB'" | grep -q 1 \
    || docker exec collabstudy-postgres psql -U "$DB_USER" -c "CREATE DATABASE $TEST_DB;"
  echo "✅ Test database ready (via Docker)."
elif command -v psql &>/dev/null; then
  PGPASSWORD="$DB_PASSWORD" psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" -tc \
    "SELECT 1 FROM pg_database WHERE datname = '$TEST_DB'" | grep -q 1 \
    || PGPASSWORD="$DB_PASSWORD" psql -U "$DB_USER" -h "$DB_HOST" -p "$DB_PORT" \
       -c "CREATE DATABASE $TEST_DB;"
  echo "✅ Test database ready (via psql)."
else
  echo "⚠️  Neither Docker nor psql found. Please create '$TEST_DB' manually:"
  echo "   CREATE DATABASE $TEST_DB;"
  exit 1
fi

# Apply migrations to the test DB
echo "Applying Prisma migrations to test database..."
cd "$(dirname "$0")"
dotenv -e .env.test -- npx prisma migrate deploy \
  --schema=../../packages/db/prisma/schema.prisma
echo "✅ Migrations applied. Test environment is ready."
