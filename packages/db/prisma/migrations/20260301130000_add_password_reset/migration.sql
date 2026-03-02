-- AddPasswordReset
-- Adds password reset OTP fields to the users table.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "passwordResetToken"  TEXT,
  ADD COLUMN IF NOT EXISTS "passwordResetExpiry"  TIMESTAMP(3);
