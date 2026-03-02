import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';

/**
 * Maximum time (ms) to wait for the Python AI microservice before failing.
 * The Python service itself has its own Gemini timeout — this is an outer guard.
 */
const AI_SERVICE_TIMEOUT_MS = 35_000;

/**
 * AiService
 * ---------
 * Proxies all AI requests (summarise, embed, digest) to the Python
 * microservice at AI_SERVICE_URL instead of calling Gemini directly.
 *
 * This keeps the NestJS app free of heavy AI SDK dependencies and lets
 * the Python service scale independently.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  /** Base URL of the Python AI microservice (no trailing slash). */
  private get baseUrl(): string {
    return (process.env.AI_SERVICE_URL ?? 'http://localhost:8000').replace(/\/$/, '');
  }

  /**
   * POST a JSON body to the AI microservice and return the parsed response.
   * Throws InternalServerErrorException on network errors or non-2xx responses.
   */
  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_SERVICE_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`AI service responded ${res.status}: ${text}`);
      }

      return res.json() as Promise<T>;
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new Error(`AI service timed out after ${AI_SERVICE_TIMEOUT_MS}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Generate a 768-dimensional embedding vector for the given text.
   * Proxies to POST /embed on the Python microservice.
   *
   * Returns an empty array if AI_SERVICE_URL is not set (safe no-op so
   * the worker skips the DB update rather than crashing).
   *
   * Throws InternalServerErrorException on failure so BullMQ retries
   * the job with exponential back-off.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!process.env.AI_SERVICE_URL) {
      this.logger.warn('AI_SERVICE_URL is not set — skipping embedding generation');
      return [];
    }

    try {
      const data = await this.post<{ embedding: number[]; dimensions: number }>(
        '/embed',
        { text },
      );
      return data.embedding;
    } catch (err) {
      this.logger.error('AI microservice /embed call failed:', err);
      throw new InternalServerErrorException(
        'Embedding generation failed. The job will be retried automatically.',
      );
    }
  }

  /**
   * Generate a personalised notification digest for the given user's unread
   * activity. Proxies to POST /summarise on the Python microservice with a
   * pre-built activity text prompt.
   *
   * Never throws — returns a fallback string on failure so the digest
   * endpoint always succeeds even if the AI service is unavailable.
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
    if (!process.env.AI_SERVICE_URL) {
      this.logger.warn('AI_SERVICE_URL not set — returning placeholder digest');
      return 'AI digest is not configured. Please set the AI_SERVICE_URL environment variable.';
    }

    // Build a compact plain-text summary of the unread activity
    const lines: string[] = [
      'Generate a smart notification digest for a team chat app user.',
      '',
      'Unread activity:',
    ];
    for (const ch of data.unreadChannels) {
      lines.push(
        `\n#${ch.channelName} — ${ch.messages.length} new message${ch.messages.length !== 1 ? 's' : ''}` +
        (ch.mentionCount > 0 ? `, ${ch.mentionCount} mention${ch.mentionCount !== 1 ? 's' : ''}` : ''),
      );
      for (const m of ch.messages.slice(0, 10)) {
        lines.push(`  [${m.author}]: ${m.content.slice(0, 200)}`);
      }
      if (ch.messages.length > 10) lines.push(`  … and ${ch.messages.length - 10} more`);
    }
    for (const dm of data.unreadDms) {
      lines.push(`\nDM from ${dm.withUser}: ${dm.messageCount} unread message${dm.messageCount !== 1 ? 's' : ''}`);
    }
    lines.push(
      `\nTotal @mentions: ${data.totalMentions}`,
      '\nWrite 3-6 friendly sentences. No markdown headers or bullet lists.',
    );

    try {
      const result = await this.post<{ summary: string }>('/summarise', {
        text: lines.join('\n'),
      });
      return result.summary;
    } catch (err) {
      this.logger.error('AI microservice /summarise (digest) call failed:', err);
      return 'Could not generate AI digest right now. Check your unread channels below.';
    }
  }

  /**
   * Summarise a plain-text chat transcript.
   * Proxies to POST /summarise on the Python microservice.
   *
   * Throws InternalServerErrorException on failure so BullMQ marks the
   * job as failed and retries with exponential back-off.
   */
  async summarise(transcript: string): Promise<string> {
    const aiServiceUrl = process.env.AI_SERVICE_URL;
    
    if (!aiServiceUrl) {
      this.logger.error('[AI SERVICE] ❌ AI_SERVICE_URL environment variable is NOT SET!');
      this.logger.error('[AI SERVICE] 📋 Please configure AI_SERVICE_URL in your .env file (e.g., http://localhost:8000)');
      return 'AI summary is not configured. Please set the AI_SERVICE_URL environment variable.';
    }

    this.logger.log(`[AI SERVICE] 🔗 Connecting to AI microservice at: ${aiServiceUrl}`);

    const prompt = `Summarise the following chat transcript with this structure:
**Overview:** 1-2 sentences on the main topic.
**Key Topics:** bullet points of main subjects discussed.
**Participants:** list unique participants.
**Action Items (if any):** any tasks or follow-ups mentioned.

Transcript:
${transcript}`;

    this.logger.log(`[AI SERVICE] 📤 Sending request to POST ${aiServiceUrl}/summarise`);
    this.logger.log(`[AI SERVICE] 📊 Payload size: ${JSON.stringify({ text: prompt }).length} bytes`);

    try {
      const startTime = Date.now();
      const result = await this.post<{ summary: string }>('/summarise', { text: prompt });
      const duration = Date.now() - startTime;
      
      this.logger.log(`[AI SERVICE] ✅ Summary received successfully in ${duration}ms`);
      this.logger.log(`[AI SERVICE] 📝 Summary length: ${result.summary.length} characters`);
      
      return result.summary;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      
      this.logger.error(`[AI SERVICE] ❌ /summarise call FAILED!`);
      this.logger.error(`[AI SERVICE] 🔍 Error details: ${errorMessage}`);
      
      // Check for common connection issues
      if (errorMessage.includes('ECONNREFUSED')) {
        this.logger.error(`[AI SERVICE] 🚫 CONNECTION REFUSED! The Python AI service is not running at ${aiServiceUrl}`);
        this.logger.error(`[AI SERVICE] 💡 Solution: Start the Python service with 'cd apps/ai && python -m uvicorn main:app --reload'`);
      } else if (errorMessage.includes('timed out')) {
        this.logger.error(`[AI SERVICE] ⏱️ REQUEST TIMED OUT after ${AI_SERVICE_TIMEOUT_MS}ms`);
        this.logger.error(`[AI SERVICE] 💡 The AI provider (Gemini) may be slow or unresponsive. Check API_KEY and quota.`);
      } else if (errorMessage.includes('AI service responded')) {
        this.logger.error(`[AI SERVICE] 📛 The AI service returned an error response`);
        this.logger.error(`[AI SERVICE] 💡 Check Python service logs for details`);
      }
      
      this.logger.error(`[AI SERVICE] 📚 Full error:`, err);
      
      throw new InternalServerErrorException(
        'AI summary generation failed. The job will be retried automatically.',
      );
    }
  }
}
