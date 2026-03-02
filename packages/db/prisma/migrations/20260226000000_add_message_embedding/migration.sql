-- Phase 11.1: Vector Embeddings Setup
-- Enable pgvector extension (idempotent)
CREATE EXTENSION IF NOT EXISTS vector;

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
