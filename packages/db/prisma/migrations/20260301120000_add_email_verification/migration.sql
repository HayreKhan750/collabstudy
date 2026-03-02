-- AddEmailVerification
-- Adds email verification fields to the users table.
-- emailVerified: false by default — existing users are grandfathered in as verified
-- so they are not locked out after this migration.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "emailVerified"      BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "verificationToken"  TEXT,
  ADD COLUMN IF NOT EXISTS "verificationExpiry" TIMESTAMP(3);

-- Grandfather existing users: mark all pre-existing accounts as verified
-- so no one gets locked out after deployment.
UPDATE "users" SET "emailVerified" = true WHERE "emailVerified" = false;
