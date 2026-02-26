import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

/** Maximum time (ms) to wait for the Gemini API before failing hard. */
const GEMINI_TIMEOUT_MS = 30_000;

/** Gemini embedding model — produces 768-dimensional vectors. */
const EMBEDDING_MODEL = 'text-embedding-004';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  /**
   * Generate a 768-dimensional embedding vector for the given text using
   * Gemini text-embedding-004. Called by the EmbeddingsProcessor worker.
   *
   * Returns an empty array if GEMINI_API_KEY is not set (safe no-op so
   * the worker can skip the DB update rather than crashing).
   *
   * Throws InternalServerErrorException on API failure so BullMQ retries
   * the job with exponential back-off.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY is not set — skipping embedding generation');
      return [];
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Gemini embedding API timed out after ${GEMINI_TIMEOUT_MS}ms`)),
          GEMINI_TIMEOUT_MS,
        ),
      );

      const result = await Promise.race([
        model.embedContent(text),
        timeoutPromise,
      ]);

      return result.embedding.values;
    } catch (err) {
      this.logger.error('Gemini embedContent() call failed:', err);
      throw new InternalServerErrorException(
        'Embedding generation failed. The job will be retried automatically.',
      );
    }
  }

  /**
   * Generate a personalised notification digest for the given user's unread
   * activity. Returns a concise, helpful plain-text summary string.
   *
   * Never throws — returns a fallback string on API failure so the digest
   * endpoint always succeeds even if Gemini is unavailable.
   */
  async generateDigest(data: {
    unreadChannels: {
      channelName: string;
      mentionCount: number;
      messages: { author: string; content: string; createdAt: Date }[];
    }[];
    unreadDms: { withUser: string; messageCount: number }[];
    totalMentions: number;
  }): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY not set — returning placeholder digest');
      return 'AI digest is not configured. Please set the GEMINI_API_KEY environment variable.';
    }

    // Build a compact plain-text summary of the unread activity to feed Gemini
    const lines: string[] = [];
    for (const ch of data.unreadChannels) {
      lines.push(`\n## #${ch.channelName} (${ch.messages.length} new message${ch.messages.length !== 1 ? 's' : ''}${ch.mentionCount > 0 ? `, ${ch.mentionCount} mention${ch.mentionCount !== 1 ? 's' : ''}` : ''})`);
      for (const m of ch.messages.slice(0, 10)) {
        lines.push(`  [${m.author}]: ${m.content.slice(0, 200)}`);
      }
      if (ch.messages.length > 10) lines.push(`  … and ${ch.messages.length - 10} more`);
    }
    for (const dm of data.unreadDms) {
      lines.push(`\n## DM from ${dm.withUser}: ${dm.messageCount} unread message${dm.messageCount !== 1 ? 's' : ''}`);
    }

    const activityText = lines.join('\n');

    const prompt = `You are a helpful assistant generating a smart notification digest for a team chat application.

The user has the following unread activity:
${activityText}

Write a concise, friendly digest (3-6 sentences max) that:
1. Highlights the most important channels and topics
2. Calls out any @mentions specifically (total: ${data.totalMentions})
3. Mentions any unread DMs
4. Uses a warm, helpful tone — like a smart assistant briefing them before they start work

Do NOT use markdown headers or bullet lists. Write in flowing, natural sentences.
Do NOT repeat counts verbatim — summarise meaningfully.`;

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Gemini digest API timed out after ${GEMINI_TIMEOUT_MS}ms`)),
          GEMINI_TIMEOUT_MS,
        ),
      );

      const result = await Promise.race([model.generateContent(prompt), timeoutPromise]);
      return result.response.text().trim();
    } catch (err) {
      this.logger.error('Gemini digest generation failed:', err);
      return 'Could not generate AI digest right now. Check your unread channels below.';
    }
  }

  /**
   * Summarise a plain-text chat transcript using Google Gemini.
   * Throws InternalServerErrorException (HTTP 500) on failure so BullMQ
   * can retry the job correctly instead of silently hanging.
   */
  async summarise(transcript: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY is not set — returning placeholder summary');
      return 'AI summary is not configured. Please set the GEMINI_API_KEY environment variable.';
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const prompt = `You are a helpful assistant that summarises chat conversations.
Analyse the following chat transcript and provide a concise, well-structured summary.

Format your response as:
**Overview:** A 1-2 sentence description of the main conversation topic.

**Key Topics:**
- Topic 1
- Topic 2
- Topic 3

**Participants:** List the unique participants.

**Action Items (if any):**
- Action item 1 (if mentioned)

Chat transcript:
${transcript}`;

      // Race the Gemini call against a hard timeout so the job never hangs forever.
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Gemini API timed out after ${GEMINI_TIMEOUT_MS}ms`)),
          GEMINI_TIMEOUT_MS,
        ),
      );

      const result = await Promise.race([
        model.generateContent(prompt),
        timeoutPromise,
      ]);

      return result.response.text();
    } catch (err) {
      this.logger.error('Gemini API call failed:', err);
      // Re-throw as an HTTP 500 so BullMQ marks the job as failed and retries.
      throw new InternalServerErrorException(
        'AI summary generation failed. The job will be retried automatically.',
      );
    }
  }
}
