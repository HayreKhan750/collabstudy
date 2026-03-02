-- Performance Phase 2: Composite indexes for message query optimization
-- Covers the primary query: WHERE channelId=? AND parentId IS NULL ORDER BY createdAt DESC
-- Used by findAllByChannel for both initial load and cursor pagination.

-- Drop the old single-column createdAt+channelId indexes that are now superseded
-- by the composite covering index below. (IF EXISTS guards idempotency.)
DROP INDEX IF EXISTS "messages_channelId_createdAt_idx";

-- Primary covering index for message list queries
-- Satisfies: WHERE channelId=? AND parentId=? ORDER BY createdAt DESC, id DESC
CREATE INDEX IF NOT EXISTS "messages_channelId_parentId_createdAt_idx"
  ON "messages"("channelId", "parentId", "createdAt" DESC);

-- Index for cursor pagination id lookups within a channel
CREATE INDEX IF NOT EXISTS "messages_channelId_id_idx"
  ON "messages"("channelId", "id");

-- Index for pinned message queries
CREATE INDEX IF NOT EXISTS "messages_channelId_isPinned_idx"
  ON "messages"("channelId", "isPinned");

-- Covering index for reaction emoji grouping per message
-- Satisfies: WHERE messageId=? GROUP BY emoji
CREATE INDEX IF NOT EXISTS "reactions_messageId_emoji_idx"
  ON "reactions"("messageId", "emoji");
