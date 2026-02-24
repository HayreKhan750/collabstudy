import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Custom ThrottlerGuard (Phase 9.2)
 *
 * Extends the default NestJS ThrottlerGuard to:
 *  1. Add the standard `Retry-After` header on 429 responses so clients
 *     know exactly how many seconds to wait before retrying.
 *  2. Use the authenticated user's ID as the throttle key when available
 *     (falls back to IP for unauthenticated routes).
 *
 * RFC 6585 specifies Retry-After as the number of seconds to wait.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  /**
   * Use authenticated userId as throttle key when available;
   * fall back to IP address for public/unauthenticated endpoints.
   */
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const userId: string | undefined = req.user?.userId;
    return userId ?? req.ip ?? 'anonymous';
  }

  /**
   * Called when the rate limit is exceeded.
   * Adds `Retry-After` (seconds) and `X-RateLimit-Reset` headers before
   * delegating to the parent which throws ThrottlerException (HTTP 429).
   */
  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: {
      limit: number;
      ttl: number;
      key: string;
      tracker: string;
      totalHits: number;
      timeToExpire: number;
      isBlocked: boolean;
      timeToBlockExpire: number;
    },
  ): Promise<void> {
    const response = context.switchToHttp().getResponse<{
      setHeader: (key: string, value: string | number) => void;
    }>();

    // timeToExpire is in milliseconds — convert to seconds for the header
    const retryAfterSeconds = Math.ceil(throttlerLimitDetail.timeToExpire / 1000);
    const resetAt = Math.floor(Date.now() / 1000) + retryAfterSeconds;

    response.setHeader('Retry-After', retryAfterSeconds);
    response.setHeader('X-RateLimit-Limit', throttlerLimitDetail.limit);
    response.setHeader('X-RateLimit-Reset', resetAt);

    return super.throwThrottlingException(context, throttlerLimitDetail);
  }
}
