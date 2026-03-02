-- Phase 9.4: Query Performance Audit
-- Add GIN trigram index on direct_messages.content for full-text search.
-- Mirrors the existing idx_messages_content_trgm on the messages table.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_direct_messages_content_trgm
    ON direct_messages USING GIN (content gin_trgm_ops);

-- Composite index for thread queries: (channelId, parentId, createdAt DESC)
-- Speeds up fetching replies to a parent message sorted chronologically.
CREATE INDEX IF NOT EXISTS idx_messages_channel_parent_created
    ON messages ("channelId", "parentId", "createdAt" DESC);
