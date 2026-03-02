-- Enable the pg_trgm extension for trigram-based similarity search.
-- This is idempotent (IF NOT EXISTS) so it is safe to re-run.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create a GIN index on messages.content using the gin_trgm_ops operator class.
-- GIN (Generalized Inverted Index) with gin_trgm_ops is the recommended index
-- type for full-text similarity / LIKE / ILIKE searches with pg_trgm.
-- It supports both `%` (LIKE / ILIKE) and `similarity()` lookups efficiently.
CREATE INDEX IF NOT EXISTS idx_messages_content_trgm
    ON messages USING GIN (content gin_trgm_ops);
