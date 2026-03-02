-- Add pinnedMessageId to DirectConversation so each conversation can track one pinned DM
ALTER TABLE "direct_conversations" ADD COLUMN "pinnedMessageId" UUID;

ALTER TABLE "direct_conversations"
  ADD CONSTRAINT "direct_conversations_pinnedMessageId_fkey"
  FOREIGN KEY ("pinnedMessageId")
  REFERENCES "direct_messages"("id")
  ON DELETE SET NULL;
