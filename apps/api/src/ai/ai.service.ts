import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

/** Maximum time (ms) to wait for the Gemini API before failing hard. */
const GEMINI_TIMEOUT_MS = 30_000;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

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
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

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
