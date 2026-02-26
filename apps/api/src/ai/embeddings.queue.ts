/**
 * Phase 11.1: BullMQ queue name and job type definitions for embedding jobs.
 *
 * When a new channel message is created, MessagesService enqueues an
 * EmbeddingJobData job here. EmbeddingsProcessor picks it up, calls
 * AiService.generateEmbedding(), and writes the vector back to the DB.
 */

export const EMBEDDINGS_QUEUE = 'embeddings';

export interface EmbeddingJobData {
  /** The UUID of the Message record to embed. */
  messageId: string;
  /** The plain-text content to embed (avoids an extra DB round-trip in the worker). */
  content: string;
}
