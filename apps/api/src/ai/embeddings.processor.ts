import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { Prisma } from '@prisma/client';
import { EMBEDDINGS_QUEUE, EmbeddingJobData } from './embeddings.queue';
import { AiService } from './ai.service';
import { PrismaService } from '../prisma/prisma.service';

@Processor(EMBEDDINGS_QUEUE, {
  concurrency: 3, // process up to 3 embedding jobs in parallel
})
export class EmbeddingsProcessor extends WorkerHost {
  private readonly logger = new Logger(EmbeddingsProcessor.name);

  constructor(
    private readonly aiService: AiService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<EmbeddingJobData>): Promise<void> {
    const { messageId, content } = job.data;

    this.logger.log(
      `Processing embedding job ${job.id} for message ${messageId} (attempt ${job.attemptsMade + 1})`,
    );

    // Skip messages with no text content (file-only messages have null content)
    if (!content?.trim()) {
      this.logger.log(`Skipping embedding for message ${messageId} — no text content`);
      return;
    }

    // Call Gemini text-embedding-004 — returns [] if API key not configured
    const vector = await this.aiService.generateEmbedding(content);

    if (vector.length === 0) {
      this.logger.warn(
        `Embedding skipped for message ${messageId} — empty vector returned (API key missing?)`,
      );
      return;
    }

    // Persist the vector using raw SQL because Prisma does not natively
    // understand the pgvector `vector` type — we pass it as a formatted
    // string literal that PostgreSQL casts via the `::vector` type cast.
    const vectorLiteral = `[${vector.join(',')}]`;
    await this.prisma.$executeRaw(
      Prisma.sql`UPDATE messages SET embedding = ${vectorLiteral}::vector WHERE id = ${messageId}::uuid`,
    );

    this.logger.log(
      `✅ Embedding written for message ${messageId} (${vector.length} dimensions)`,
    );
  }
}
