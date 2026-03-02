-- CreateTable: direct_message_reactions
-- Adds emoji reaction support to Direct Messages (parity with channel message reactions)
-- Uses IF NOT EXISTS guards throughout — safe to re-run if table was already created by init migration.

CREATE TABLE IF NOT EXISTS "direct_message_reactions" (
    "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
    "emoji"      TEXT        NOT NULL,
    "userId"     UUID        NOT NULL,
    "messageId"  UUID        NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "direct_message_reactions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey: userId → users (idempotent)
DO $$
BEGIN
  ALTER TABLE "direct_message_reactions"
      ADD CONSTRAINT "direct_message_reactions_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN
  NULL; -- constraint already exists, skip
END;
$$;

-- AddForeignKey: messageId → direct_messages (idempotent)
DO $$
BEGIN
  ALTER TABLE "direct_message_reactions"
      ADD CONSTRAINT "direct_message_reactions_messageId_fkey"
      FOREIGN KEY ("messageId") REFERENCES "direct_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN
  NULL; -- constraint already exists, skip
END;
$$;

-- CreateUniqueIndex: one reaction per user per emoji per message
CREATE UNIQUE INDEX IF NOT EXISTS "direct_message_reactions_userId_messageId_emoji_key"
    ON "direct_message_reactions"("userId", "messageId", "emoji");

-- CreateIndex: fast lookup by messageId
CREATE INDEX IF NOT EXISTS "direct_message_reactions_messageId_idx"
    ON "direct_message_reactions"("messageId");
