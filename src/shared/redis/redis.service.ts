import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    this.client = new Redis({
      host: this.config.get('redis.host'),
      port: this.config.get('redis.port'),
      password: this.config.get('redis.password') || undefined,
      lazyConnect: true,
    });
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.setex(key, ttlSeconds, value);
      //await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  // ── Distributed locking ────────────────────────────────────────────────────

  /**
   * Attempts to acquire a distributed lock.
   *
   * Uses SET NX PX — atomic: only succeeds if the key does not exist.
   * Returns a unique token on success, null if the lock is already held.
   *
   * @param key    - Lock key, e.g. "lock:auction:<productId>"
   * @param ttlMs  - Auto-expiry in milliseconds — prevents deadlocks if the
   *                 holder crashes before releasing.
   * @returns token to pass into releaseLock(), or null if lock not acquired.
   */
  async acquireLock(key: string, ttlMs: number): Promise<string | null> {
    const token = randomUUID();
    const result = await this.client.set(key, token, 'PX', ttlMs, 'NX');
    return result === 'OK' ? token : null;
  }

  /**
   * Releases a lock — but ONLY if we still own it.
   *
   * The Lua script is atomic: it reads and deletes in a single operation so
   * we never accidentally release a lock acquired by another process after
   * our TTL expired.
   *
   * @param key   - Same key passed to acquireLock()
   * @param token - Token returned by acquireLock()
   */
  async releaseLock(key: string, token: string): Promise<void> {
    const script = `
      if redis.call('get', KEYS[1]) == ARGV[1] then
        return redis.call('del', KEYS[1])
      else
        return 0
      end
    `;
    await this.client.eval(script, 1, key, token);
  }
}
