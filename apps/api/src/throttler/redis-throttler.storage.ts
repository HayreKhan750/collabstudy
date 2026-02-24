import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import Redis from 'ioredis';

/**
 * Redis-backed ThrottlerStorage implementation compatible with @nestjs/throttler v6.
 * Uses a Lua script for atomic increment + expiry.
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleDestroy {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  readonly redis: Redis;

  constructor() {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);
    const password = process.env.REDIS_PASSWORD || 'collabstudy123';

    this.redis = new Redis({ host, port, password, lazyConnect: true });

    this.redis.on('connect', () =>
      this.logger.log(`Redis throttler connected to ${host}:${port}`),
    );
    this.redis.on('error', (err) =>
      this.logger.warn(`Redis throttler error: ${err.message}`),
    );
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const redisKey = `throttler:${throttlerName}:${key}`;
    const ttlSeconds = Math.ceil(ttl / 1000);

    // Atomic: increment counter, set expiry only on first hit
    const result = await this.redis
      .multi()
      .incr(redisKey)
      .expire(redisKey, ttlSeconds, 'NX')
      .ttl(redisKey)
      .exec();

    const totalHits = (result?.[0]?.[1] as number) ?? 1;
    const remainingTtlSeconds = (result?.[2]?.[1] as number) ?? ttlSeconds;
    const timeToExpire = remainingTtlSeconds * 1000;
    const isBlocked = totalHits > limit;
    const timeToBlockExpire = isBlocked ? blockDuration : 0;

    return {
      totalHits,
      timeToExpire,
      isBlocked,
      timeToBlockExpire,
    };
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }
}
