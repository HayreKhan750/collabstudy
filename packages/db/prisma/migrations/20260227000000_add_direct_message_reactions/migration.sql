-- CreateTable: direct_message_reactions
-- Adds emoji reaction support to Direct Messages (parity with channel message reactions)

CREATE TABLE "direct_message_reactions" (
    "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
    "emoji"      TEXT        NOT NULL,
    "userId"     UUID        NOT NULL,
    "messageId"  UUID        NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "direct_message_reactions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey: userId → users
ALTER TABLE "direct_message_reactions"
    ADD CONSTRAINT "direct_message_reactions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: messageId → direct_messages
ALTER TABLE "direct_message_reactions"
    ADD CONSTRAINT "direct_message_reactions_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "direct_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateUniqueIndex: one reaction per user per emoji per message
CREATE UNIQUE INDEX "direct_message_reactions_userId_messageId_emoji_key"
    ON "direct_message_reactions"("userId", "messageId", "emoji");

-- CreateIndex: fast lookup by messageId
CREATE INDEX "direct_message_reactions_messageId_idx"
    ON "direct_message_reactions"("messageId");
