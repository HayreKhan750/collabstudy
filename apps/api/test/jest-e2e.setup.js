/**
 * Jest globalSetup — runs once before all e2e suites.
 *
 * When invoked via `pnpm test:e2e` (which uses `dotenv -e .env.test`),
 * NODE_ENV will be "test" and DATABASE_URL will point at collabstudy_test.
 * In that case, we run `prisma migrate deploy` to ensure the test schema
 * is up-to-date before any suite runs.
 *
 * When Jest is invoked directly (e.g. from an IDE or npx jest), NODE_ENV
 * is not "test" and we skip migration entirely so the dev DB is untouched.
 */

const { execSync } = require('child_process');
const path = require('path');

module.exports = async function globalSetup() {
  if (process.env.NODE_ENV !== 'test') {
    // Not running under dotenv -e .env.test — skip to avoid touching dev DB.
    return;
  }

  const schemaPath = path.resolve(__dirname, '../../../packages/db/prisma/schema.prisma');

  console.log('\n[jest-e2e] Running prisma migrate deploy on test database...');
  console.log(`[jest-e2e] DATABASE_URL = ${process.env.DATABASE_URL}`);

  try {
    execSync(`npx prisma migrate deploy --schema="${schemaPath}"`, {
      stdio: 'pipe',
      env: { ...process.env },
    });
    console.log('[jest-e2e] Migrations applied successfully.\n');
  } catch (err) {
    // If the test DB doesn't exist yet, warn but don't block —
    // developer must run `bash apps/api/setup-test-db.sh` first.
    console.warn(
      '\n⚠️  [jest-e2e] Could not apply migrations to test database.',
      '\n   Run `bash apps/api/setup-test-db.sh` to create and migrate collabstudy_test first.',
      '\n   Falling through — tests will run against the current DATABASE_URL.\n',
    );
  }
};
