-- Phase 11.1: Vector Embeddings Setup
-- Enable pgvector extension (idempotent, gracefully skipped if not installed)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'pgvector extension not available: %. Vector search features will be disabled.', SQLERRM;
END;
$$;

-- Add embedding column and HNSW index only if pgvector is available
DO $$
BEGIN
  -- Add embedding column to messages table
  -- Uses Gemini text-embedding-004 which produces 768-dimensional vectors
  -- Nullable: populated asynchronously by the EmbeddingsWorker after message creation
  ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "embedding" vector(768);

  -- Add HNSW index for fast approximate nearest-neighbour search using cosine similarity.
  -- HNSW is preferred over IVFFlat here because:
  --   1. No training phase needed (IVFFlat requires N rows before indexing is useful)
  --   2. Works correctly on empty / small tables
  --   3. Better recall at high QPS
  -- m=16: max connections per node (higher = better recall, more memory)
  -- ef_construction=64: search width during index build (higher = better recall, slower build)
  CREATE INDEX IF NOT EXISTS messages_embedding_hnsw_idx
    ON messages
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not apply vector column/index (pgvector not available): %. Skipping.', SQLERRM;
END;
$$;
