# CollabStudy — Production Database Migration Strategy

> **Audience:** Engineers deploying or making schema changes to the CollabStudy platform.  
> **Last updated:** Phase 12.4

---

## Table of Contents

1. [Overview](#overview)
2. [How Migrations Work in This Project](#how-migrations-work-in-this-project)
3. [Running Migrations](#running-migrations)
4. [The Expand and Contract Pattern (Zero-Downtime)](#the-expand-and-contract-pattern-zero-downtime)
5. [Rollback Strategy](#rollback-strategy)
6. [Emergency Procedures](#emergency-procedures)
7. [⛔ Forbidden Commands in Production](#-forbidden-commands-in-production)

---

## Overview

CollabStudy uses **Prisma Migrate** for all database schema changes. Every schema change must go through a migration file committed to version control — no ad-hoc SQL, no `prisma db push` in production.

The golden rule:

> **`prisma migrate deploy` is for production. `prisma migrate dev` is NEVER for production.**

---

## How Migrations Work in This Project

### Migration files

All migration SQL lives in `packages/db/prisma/migrations/`. Each migration is a directory with:
- A timestamped name (e.g., `20240301120000_add_embedding_column/`)
- A `migration.sql` file containing the exact SQL to apply

These files are **committed to Git** and **never edited after creation**.

### Automatic migration on startup

The API container's `docker-entrypoint.sh` runs `prisma migrate deploy` before the NestJS server starts. This means:

1. Container boots → entrypoint runs → Prisma checks which migrations have not yet been applied → applies them in order → NestJS starts.
2. `prisma migrate deploy` is **idempotent** — if all migrations are already applied it exits cleanly in milliseconds.
3. If a migration **fails**, the entrypoint exits non-zero, the container crashes, and Docker restarts it (`restart: unless-stopped`). The old version of the app (if using a blue/green or rolling deploy) continues serving traffic until the issue is resolved.

---

## Running Migrations

### Local development

```bash
# Create a new migration from schema changes (dev only)
cd packages/db
pnpm prisma migrate dev --name describe_your_change

# Check migration status
pnpm prisma migrate status
```

### Production (manual / one-off)

```bash
# Via Docker Compose — run migrate deploy as a one-off command
docker compose -f docker-compose.prod.yml exec api \
  npx prisma migrate deploy --schema=/app/packages/db/prisma/schema.prisma

# Or via npm script from the repo root (requires DATABASE_URL in env)
pnpm db:migrate:deploy

# Check what migrations are pending before deploying
pnpm db:migrate:status
```

### In CI/CD

The `docker-entrypoint.sh` handles migrations automatically when the container starts.  
For **horizontal scaling** (multiple API instances), run the migration as a **one-off task** before updating the deployment:

```bash
# Run migration in a dedicated short-lived container BEFORE updating the service
docker run --rm \
  -e DATABASE_URL="${DATABASE_URL}" \
  ghcr.io/your-org/collabstudy-api:latest \
  npx prisma migrate deploy --schema=/app/packages/db/prisma/schema.prisma
```

This prevents a race condition where multiple instances all try to acquire the migration lock simultaneously.

---

## The Expand and Contract Pattern (Zero-Downtime)

The **Expand and Contract** pattern (also called **parallel change**) lets you make breaking schema changes without any downtime. The old and new versions of the app must be able to run simultaneously against the database during the rollout window.

### The Problem

Suppose you want to rename a column:

```sql
-- ❌ DANGEROUS — breaks the old app version still running in production
ALTER TABLE users RENAME COLUMN full_name TO display_name;
```

The moment this runs, any still-running instance of the old app (which uses `full_name`) crashes.

### The Solution: 3 Phases

#### Phase 1: EXPAND (add the new, keep the old)

Create a migration that **adds** the new column without removing the old one. Update the application code to **write to both** columns and **read from the new** column with a fallback to the old.

```sql
-- Migration: add_display_name_column
ALTER TABLE users ADD COLUMN display_name TEXT;

-- Backfill existing data
UPDATE users SET display_name = full_name WHERE display_name IS NULL;
```

Deploy this version. Both old and new app instances work correctly.

#### Phase 2: CONTRACT (remove the old)

Once **100% of instances** are running the new code (verified via your deployment dashboard), create a second migration to drop the old column.

```sql
-- Migration: drop_full_name_column
ALTER TABLE users DROP COLUMN full_name;
```

Update the app code to remove all references to `full_name`.

#### Phase 3: CLEANUP

Remove any compatibility shims in the code that wrote to both columns.

### Column Rename Checklist

- [ ] Step 1: Add new column (nullable or with default)
- [ ] Step 2: Backfill data in migration SQL
- [ ] Step 3: Update app to write to both / read from new
- [ ] Step 4: Deploy and verify — all instances on new code
- [ ] Step 5: Create migration to drop old column
- [ ] Step 6: Deploy the cleanup migration
- [ ] Step 7: Remove compatibility code

### Index Changes (Zero-Downtime)

Adding indexes on large tables can lock the table and cause downtime. Use `CREATE INDEX CONCURRENTLY`:

```sql
-- ✅ Non-blocking index creation (Postgres only)
CREATE INDEX CONCURRENTLY idx_messages_channel_id ON messages(channel_id);
```

> **Note:** Prisma's generated SQL does not use `CONCURRENTLY` by default. For large tables, write the migration SQL manually.

---

## Rollback Strategy

Prisma Migrate does **not** support automatic down-migrations. Rollback is a deliberate, manual process.

### Option 1: Roll forward (preferred)

Write a new migration that undoes the problematic change and deploy it. This is the safest approach because it keeps your migration history clean and auditable.

```bash
# On your local machine, revert the schema change and generate a new migration
cd packages/db
pnpm prisma migrate dev --name revert_broken_change
```

### Option 2: Restore from backup (nuclear option)

If the migration caused data corruption and roll-forward is not possible:

1. **Stop all API instances** immediately to prevent further writes.
2. Restore the database from the most recent pre-migration backup.
3. Redeploy the previous version of the application (by image SHA tag).
4. Investigate, fix the migration, and re-deploy.

```bash
# Restore from a pg_dump backup
pg_restore --clean --if-exists -d "$DATABASE_URL" /path/to/backup.dump

# Redeploy the previous image (using the SHA tag from GHCR)
docker compose -f docker-compose.prod.yml \
  pull api  # or pin to a specific SHA tag in the compose file
docker compose -f docker-compose.prod.yml up -d api
```

### Before every production deployment

1. Take a manual database snapshot/backup.
2. Run `pnpm db:migrate:status` to review pending migrations.
3. Review the generated SQL in `packages/db/prisma/migrations/` for destructive operations (`DROP`, `ALTER ... DROP COLUMN`, `TRUNCATE`).
4. Test the migration on a staging environment that mirrors production data volume.

---

## Emergency Procedures

### Migration stuck / lock not released

Prisma uses an advisory lock to prevent concurrent migrations. If a previous migration crashed mid-flight, the lock may still be held.

```sql
-- Check for held advisory locks
SELECT pid, query, state FROM pg_stat_activity
WHERE query LIKE '%advisory%' OR query LIKE '%migrate%';

-- Terminate the blocking connection (replace <pid> with actual PID)
SELECT pg_terminate_backend(<pid>);

-- Then re-run the migration
pnpm db:migrate:deploy
```

### Migration applied but app won't start

1. Check container logs: `docker compose -f docker-compose.prod.yml logs api`
2. If the schema is ahead of the code, redeploy the correct image version.
3. If the schema is behind, the entrypoint will retry on next container restart.

---

## ⛔ Forbidden Commands in Production

| Command | Why it's forbidden |
|---------|-------------------|
| `prisma migrate dev` | Creates new migrations interactively, may prompt for data loss confirmation, and is designed for development only. **Never run in production.** |
| `prisma db push` | Bypasses the migration system entirely — applies schema changes without creating a migration file. Changes will be invisible to future deployments and cannot be rolled back cleanly. |
| `prisma migrate reset` | **Drops and recreates the entire database.** Catastrophic data loss. |
| Direct `ALTER TABLE` / `DROP TABLE` SQL (outside of a migration file) | Bypasses version control and makes the schema state inconsistent with Prisma's migration history. |

---

> 💡 **When in doubt:** Create a migration file, review the SQL, test on staging, back up production, then deploy. Never skip steps under time pressure — a bad migration is far more costly to fix than a brief deployment delay.
