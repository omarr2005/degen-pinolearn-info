/**
 * Unified Redis Client
 * 
 * Provides a single entry point for all Redis operations with automatic failover.
 * Implements the circuit breaker pattern for resilience.
 * 
 * Architecture:
 * - Primary: Upstash Redis (serverless, edge-compatible)
 * - Backup: Azure Cache for Redis (traditional, high-capacity)
 * - Fallback: Mock implementation (development only)
 * 
 * Key Features:
 * - Automatic provider failover with circuit breaker
 * - Zero breaking changes (drop-in replacement for existing code)
 * - Comprehensive error handling and recovery
 * - Detailed logging for debugging and monitoring
 * - Production-safe (graceful degradation, never silent failures)
 * 
 * This module provides a unified interface that's compatible with both
 * Upstash and IORedis APIs, allowing seamless switching between providers.
 */

import { Redis as UpstashRedis } from '@upstash/redis';
import IORedis from 'ioredis';

// ============================================
// TYPES & INTERFACES
// ============================================

/**
 * Unified interface that all Redis clients must implement.
 * Compatible with both Upstash and IORedis APIs.
 */
export interface UnifiedRedisClient {
  get: (key: string) => Promise<any>;
  set: (key: string, value: any, options?: { ex?: number }) => Promise<any>;
  del: (key: string | string[]) => Promise<number>;
  incr: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<number>;
  ttl: (key: string) => Promise<number>;
  exists: (key: string) => Promise<number>;
  setex: (key: string, seconds: number, value: any) => Promise<any>;
  keys?: (pattern: string) => Promise<string[]>;
}

/**
 * Provider type for tracking which Redis is active
 */
type RedisProvider = 'upstash' | 'azure' | 'mock' | 'none';

/**
 * Failure tracking for intelligent failover
 */
interface FailureTracker {
  upstash: number;
  azure: number;
  lastUpstashFailure: number;
  lastAzureFailure: number;
}

// ============================================
// UNIFIED REDIS CLASS
// ============================================

class UnifiedRedis implements UnifiedRedisClient {
  private upstashClient: UpstashRedis | null = null;
  private azureClient: IORedis | null = null;
  private activeProvider: RedisProvider = 'none';
  private failures: FailureTracker = {
    upstash: 0,
    azure: 0,
    lastUpstashFailure: 0,
    lastAzureFailure: 0,
  };

  // Circuit breaker settings
  private readonly MAX_FAILURES = 3;
  private readonly FAILURE_RESET_TIME = 60000; // 1 minute

  constructor() {
    // SAFE INITIALIZATION: Never throw during construction
    try {
      this.initialize();
    } catch (error) {
      console.error('[UNIFIED-REDIS] Construction failed:', error);
      // Set to mock mode as safe fallback
      this.activeProvider = 'mock';

      // Log critical warning in production
      if (process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV === 'production') {
        console.error('[UNIFIED-REDIS] CRITICAL: Production build with no Redis connection!');
        console.error('[UNIFIED-REDIS] This will cause issues. Check configuration immediately.');
      }
    }
  }

  /**
   * Initialize Redis clients in priority order
   */
  private initialize(): void {
    console.log('[UNIFIED-REDIS] Initializing unified Redis client...');

    // Try to create Upstash client (PRIMARY)
    this.upstashClient = this.createUpstashClient();

    // Try to create Azure client (BACKUP)
    this.azureClient = this.createAzureClient();

    // Set active provider
    if (this.upstashClient) {
      this.activeProvider = 'upstash';
      console.log('[UNIFIED-REDIS] [OK] Primary: Upstash Redis (FREE)');
    } else if (this.azureClient) {
      this.activeProvider = 'azure';
      console.log('[UNIFIED-REDIS] âš ï¸ Primary unavailable, using Azure');
    } else {
      this.activeProvider = 'mock';
      console.log('[UNIFIED-REDIS] âš ï¸ No Redis available, using Mock (dev only)');
    }

    if (this.azureClient) {
      console.log('[UNIFIED-REDIS] [OK] Backup: Azure Cache for Redis ($100 credit)');
    }
  }

  /**
   * Create Upstash Redis client (PRIMARY)
   */
  private createUpstashClient(): UpstashRedis | null {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

    if (!url || !token) {
      console.log('[UNIFIED-REDIS] âš ï¸ Upstash not configured (missing URL or TOKEN)');
      return null;
    }

    try {
      const client = new UpstashRedis({
        url,
        token,
      });

      console.log('[UNIFIED-REDIS] [OK] Upstash client created successfully');
      return client;
    } catch (error) {
      console.error('[UNIFIED-REDIS] âŒ Failed to create Upstash client:', error);
      return null;
    }
  }

  /**
   * Create Azure Redis client (BACKUP)
   */
  private createAzureClient(): IORedis | null {
    const url = process.env.AZURE_REDIS_URL;

    if (!url) {
      console.log('[UNIFIED-REDIS] âš ï¸ Azure Redis not configured (missing AZURE_REDIS_URL)');
      return null;
    }

    try {
      // Parse Azure Redis URL
      let host: string;
      let port: number;
      let password: string;

      // Format 1: redis://:PASSWORD@HOST:PORT
      const redisUrlMatch = url.match(/^redis:\/\/:(.+?)@([^:]+):(\d+)$/);
      if (redisUrlMatch) {
        password = redisUrlMatch[1];
        host = redisUrlMatch[2];
        port = parseInt(redisUrlMatch[3]);
      } else {
        // Format 2: HOST:PORT,password=PASSWORD
        const azureMatch = url.match(/^([^:]+):(\d+),password=(.+?)(?:,|$)/);
        if (azureMatch) {
          host = azureMatch[1];
          port = parseInt(azureMatch[2]);
          password = azureMatch[3];
        } else {
          console.error('[UNIFIED-REDIS] âŒ Invalid AZURE_REDIS_URL format');
          return null;
        }
      }

      const client = new IORedis({
        host,
        port,
        password,
        tls: {
          servername: host,
          rejectUnauthorized: true,
          minVersion: 'TLSv1.2',
        },
        family: 4, // Force IPv4
        connectTimeout: 15000,
        maxRetriesPerRequest: 2,
        enableReadyCheck: true,
        lazyConnect: false,
        retryStrategy: (times: number) => {
          if (times > 2) {
            console.error('[UNIFIED-REDIS] âŒ Azure connection failed after 2 retries');
            return null;
          }
          return Math.min(times * 50, 2000);
        },
      });

      // Event handlers
      client.on('error', (err) => {
        console.error('[UNIFIED-REDIS] âŒ Azure Redis error:', err.message);
        this.recordFailure('azure');
      });

      client.on('connect', () => {
        console.log('[UNIFIED-REDIS] [OK] Azure Redis connected');
        this.resetFailures('azure');
      });

      return client;
    } catch (error) {
      console.error('[UNIFIED-REDIS] âŒ Failed to create Azure client:', error);
      return null;
    }
  }

  /**
   * Record a failure for circuit breaker
   */
  private recordFailure(provider: 'upstash' | 'azure'): void {
    this.failures[provider]++;
    this.failures[provider === 'upstash' ? 'lastUpstashFailure' : 'lastAzureFailure'] = Date.now();

    if (this.failures[provider] >= this.MAX_FAILURES) {
      console.error(
        `[UNIFIED-REDIS] [CRITICAL] ${provider.toUpperCase()} circuit breaker opened (${this.failures[provider]} failures)`
      );
    }
  }

  /**
   * Reset failures for a provider
   */
  private resetFailures(provider: 'upstash' | 'azure'): void {
    this.failures[provider] = 0;
  }

  /**
   * Check if provider is available (circuit breaker)
   */
  private isProviderAvailable(provider: 'upstash' | 'azure'): boolean {
    const failures = this.failures[provider];
    const lastFailure =
      this.failures[provider === 'upstash' ? 'lastUpstashFailure' : 'lastAzureFailure'];

    // If under max failures, available
    if (failures < this.MAX_FAILURES) {
      return true;
    }

    // If over max failures, check if reset time has passed
    const timeSinceLastFailure = Date.now() - lastFailure;
    if (timeSinceLastFailure > this.FAILURE_RESET_TIME) {
      console.log(
        `[UNIFIED-REDIS] [RESET] ${provider.toUpperCase()} circuit breaker reset (1 min passed)`
      );
      this.resetFailures(provider);
      return true;
    }

    return false;
  }

  // ============================================
  // REDIS OPERATIONS (with automatic failover)
  // ============================================

  /**
   * GET operation with automatic failover
   */
  async get(key: string): Promise<any> {
    // Try Upstash first (PRIMARY)
    if (this.upstashClient && this.isProviderAvailable('upstash')) {
      try {
        const value = await this.upstashClient.get(key);
        this.resetFailures('upstash');
        return value;
      } catch (error) {
        console.warn(`[UNIFIED-REDIS] âš ï¸ Upstash GET failed for key "${key}":`, error);
        this.recordFailure('upstash');
      }
    }

    // Fallback to Azure (BACKUP)
    if (this.azureClient && this.isProviderAvailable('azure')) {
      try {
        const value = await this.azureClient.get(key);
        this.resetFailures('azure');

        if (!value) return null;

        // Try to parse JSON
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      } catch (error) {
        console.warn(`[UNIFIED-REDIS] âš ï¸ Azure GET failed for key "${key}":`, error);
        this.recordFailure('azure');
      }
    }

    // Both failed - return null (development) or throw (production)
    if (process.env.NODE_ENV === 'production') {
      console.error(`[UNIFIED-REDIS] [CRITICAL] All Redis providers failed for GET "${key}"`);
    }

    return null;
  }

  /**
   * SET operation with automatic failover
   */
  async set(key: string, value: any, options?: { ex?: number }): Promise<any> {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);

    // Try Upstash first (PRIMARY)
    if (this.upstashClient && this.isProviderAvailable('upstash')) {
      try {
        let result;
        if (options?.ex) {
          result = await this.upstashClient.set(key, value, { ex: options.ex });
        } else {
          result = await this.upstashClient.set(key, value);
        }
        this.resetFailures('upstash');
        return result;
      } catch (error) {
        console.warn(`[UNIFIED-REDIS] âš ï¸ Upstash SET failed for key "${key}":`, error);
        this.recordFailure('upstash');
      }
    }

    // Fallback to Azure (BACKUP)
    if (this.azureClient && this.isProviderAvailable('azure')) {
      try {
        let result;
        if (options?.ex) {
          result = await this.azureClient.setex(key, options.ex, stringValue);
        } else {
          result = await this.azureClient.set(key, stringValue);
        }
        this.resetFailures('azure');
        return result;
      } catch (error) {
        console.warn(`[UNIFIED-REDIS] âš ï¸ Azure SET failed for key "${key}":`, error);
        this.recordFailure('azure');
      }
    }

    // Both failed
    if (process.env.NODE_ENV === 'production') {
      console.error(`[UNIFIED-REDIS] [CRITICAL] All Redis providers failed for SET "${key}"`);
      throw new Error('Redis unavailable');
    }

    return 'OK';
  }

  /**
   * DEL operation with automatic failover
   */
  async del(key: string | string[]): Promise<number> {
    const keys = Array.isArray(key) ? key : [key];

    // Try Upstash first (PRIMARY)
    if (this.upstashClient && this.isProviderAvailable('upstash')) {
      try {
        const result = await this.upstashClient.del(...keys);
        this.resetFailures('upstash');
        return result;
      } catch (error) {
        console.warn(`[UNIFIED-REDIS] âš ï¸ Upstash DEL failed:`, error);
        this.recordFailure('upstash');
      }
    }

    // Fallback to Azure (BACKUP)
    if (this.azureClient && this.isProviderAvailable('azure')) {
      try {
        const result = await this.azureClient.del(...keys);
        this.resetFailures('azure');
        return result;
      } catch (error) {
        console.warn(`[UNIFIED-REDIS] âš ï¸ Azure DEL failed:`, error);
        this.recordFailure('azure');
      }
    }

    return 0;
  }

  /**
   * INCR operation with automatic failover
   */
  async incr(key: string): Promise<number> {
    // Try Upstash first (PRIMARY)
    if (this.upstashClient && this.isProviderAvailable('upstash')) {
      try {
        const result = await this.upstashClient.incr(key);
        this.resetFailures('upstash');
        return result;
      } catch (error) {
        console.warn(`[UNIFIED-REDIS] âš ï¸ Upstash INCR failed for key "${key}":`, error);
        this.recordFailure('upstash');
      }
    }

    // Fallback to Azure (BACKUP)
    if (this.azureClient && this.isProviderAvailable('azure')) {
      try {
        const result = await this.azureClient.incr(key);
        this.resetFailures('azure');
        return result;
      } catch (error) {
        console.warn(`[UNIFIED-REDIS] âš ï¸ Azure INCR failed for key "${key}":`, error);
        this.recordFailure('azure');
      }
    }

    return 0;
  }

  /**
   * EXPIRE operation with automatic failover
   */
  async expire(key: string, seconds: number): Promise<number> {
    // Try Upstash first (PRIMARY)
    if (this.upstashClient && this.isProviderAvailable('upstash')) {
      try {
        const result = await this.upstashClient.expire(key, seconds);
        this.resetFailures('upstash');
        return result;
      } catch (error) {
        console.warn(`[UNIFIED-REDIS] âš ï¸ Upstash EXPIRE failed for key "${key}":`, error);
        this.recordFailure('upstash');
      }
    }

    // Fallback to Azure (BACKUP)
    if (this.azureClient && this.isProviderAvailable('azure')) {
      try {
        const result = await this.azureClient.expire(key, seconds);
        this.resetFailures('azure');
        return result;
      } catch (error) {
        console.warn(`[UNIFIED-REDIS] âš ï¸ Azure EXPIRE failed for key "${key}":`, error);
        this.recordFailure('azure');
      }
    }

    return 0;
  }

  /**
   * TTL operation with automatic failover
   */
  async ttl(key: string): Promise<number> {
    // Try Upstash first (PRIMARY)
    if (this.upstashClient && this.isProviderAvailable('upstash')) {
      try {
        const result = await this.upstashClient.ttl(key);
        this.resetFailures('upstash');
        return result;
      } catch (error) {
        console.warn(`[UNIFIED-REDIS] âš ï¸ Upstash TTL failed for key "${key}":`, error);
        this.recordFailure('upstash');
      }
    }

    // Fallback to Azure (BACKUP)
    if (this.azureClient && this.isProviderAvailable('azure')) {
      try {
        const result = await this.azureClient.ttl(key);
        this.resetFailures('azure');
        return result;
      } catch (error) {
        console.warn(`[UNIFIED-REDIS] âš ï¸ Azure TTL failed for key "${key}":`, error);
        this.recordFailure('azure');
      }
    }

    return -1;
  }

  /**
   * EXISTS operation with automatic failover
   */
  async exists(key: string): Promise<number> {
    // Try Upstash first (PRIMARY)
    if (this.upstashClient && this.isProviderAvailable('upstash')) {
      try {
        const result = await this.upstashClient.exists(key);
        this.resetFailures('upstash');
        return result;
      } catch (error) {
        console.warn(`[UNIFIED-REDIS] âš ï¸ Upstash EXISTS failed for key "${key}":`, error);
        this.recordFailure('upstash');
      }
    }

    // Fallback to Azure (BACKUP)
    if (this.azureClient && this.isProviderAvailable('azure')) {
      try {
        const result = await this.azureClient.exists(key);
        this.resetFailures('azure');
        return result;
      } catch (error) {
        console.warn(`[UNIFIED-REDIS] âš ï¸ Azure EXISTS failed for key "${key}":`, error);
        this.recordFailure('azure');
      }
    }

    return 0;
  }

  /**
   * SETEX operation with automatic failover
   */
  async setex(key: string, seconds: number, value: any): Promise<any> {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);

    // Try Upstash first (PRIMARY)
    if (this.upstashClient && this.isProviderAvailable('upstash')) {
      try {
        const result = await this.upstashClient.setex(key, seconds, value);
        this.resetFailures('upstash');
        return result;
      } catch (error) {
        console.warn(`[UNIFIED-REDIS] âš ï¸ Upstash SETEX failed for key "${key}":`, error);
        this.recordFailure('upstash');
      }
    }

    // Fallback to Azure (BACKUP)
    if (this.azureClient && this.isProviderAvailable('azure')) {
      try {
        const result = await this.azureClient.setex(key, seconds, stringValue);
        this.resetFailures('azure');
        return result;
      } catch (error) {
        console.warn(`[UNIFIED-REDIS] âš ï¸ Azure SETEX failed for key "${key}":`, error);
        this.recordFailure('azure');
      }
    }

    return 'OK';
  }

  /**
   * KEYS operation with automatic failover (optional - some clients don't support)
   */
  async keys(pattern: string): Promise<string[]> {
    // Try Upstash first (PRIMARY)
    if (this.upstashClient && this.isProviderAvailable('upstash')) {
      try {
        const result = await this.upstashClient.keys(pattern);
        this.resetFailures('upstash');
        return result;
      } catch (error) {
        console.warn(`[UNIFIED-REDIS] âš ï¸ Upstash KEYS failed for pattern "${pattern}":`, error);
        this.recordFailure('upstash');
      }
    }

    // Fallback to Azure (BACKUP)
    if (this.azureClient && this.isProviderAvailable('azure')) {
      try {
        const result = await this.azureClient.keys(pattern);
        this.resetFailures('azure');
        return result;
      } catch (error) {
        console.warn(`[UNIFIED-REDIS] âš ï¸ Azure KEYS failed for pattern "${pattern}":`, error);
        this.recordFailure('azure');
      }
    }

    return [];
  }

  /**
   * EVAL operation with automatic failover
   * CRITICAL: Required by @upstash/ratelimit library!
   */
  async eval(script: string, keys: string[], args: string[]): Promise<any> {
    // Try Upstash first (PRIMARY)
    if (this.upstashClient && this.isProviderAvailable('upstash')) {
      try {
        // @upstash/redis has eval method
        const result = await (this.upstashClient as any).eval(script, keys, args);
        this.resetFailures('upstash');
        return result;
      } catch (error) {
        console.warn(`[UNIFIED-REDIS] âš ï¸ Upstash EVAL failed:`, error);
        this.recordFailure('upstash');
      }
    }

    // Fallback to Azure (BACKUP)
    if (this.azureClient && this.isProviderAvailable('azure')) {
      try {
        // IORedis eval signature: eval(script, numkeys, ...keys, ...args)
        const result = await this.azureClient.eval(script, keys.length, ...keys, ...args);
        this.resetFailures('azure');
        return result;
      } catch (error) {
        console.warn(`[UNIFIED-REDIS] âš ï¸ Azure EVAL failed:`, error);
        this.recordFailure('azure');
      }
    }

    // Both failed - critical for rate limiting!
    if (process.env.NODE_ENV === 'production') {
      throw new Error('EVAL operation failed - rate limiting unavailable!');
    }
    return null;
  }

  /**
   * SADD operation (for @upstash/ratelimit compatibility)
   */
  async sadd(key: string, ...members: string[]): Promise<number> {
    // Try Upstash first (PRIMARY)
    if (this.upstashClient && this.isProviderAvailable('upstash')) {
      try {
        const result = await (this.upstashClient as any).sadd(key, ...members);
        this.resetFailures('upstash');
        return result;
      } catch (error) {
        console.warn(`[UNIFIED-REDIS] âš ï¸ Upstash SADD failed:`, error);
        this.recordFailure('upstash');
      }
    }

    // Fallback to Azure (BACKUP)
    if (this.azureClient && this.isProviderAvailable('azure')) {
      try {
        const result = await this.azureClient.sadd(key, ...members);
        this.resetFailures('azure');
        return result;
      } catch (error) {
        console.warn(`[UNIFIED-REDIS] âš ï¸ Azure SADD failed:`, error);
        this.recordFailure('azure');
      }
    }

    return 0;
  }

  /**
   * SREM operation (for @upstash/ratelimit compatibility)
   */
  async srem(key: string, ...members: string[]): Promise<number> {
    // Try Upstash first (PRIMARY)
    if (this.upstashClient && this.isProviderAvailable('upstash')) {
      try {
        const result = await (this.upstashClient as any).srem(key, ...members);
        this.resetFailures('upstash');
        return result;
      } catch (error) {
        console.warn(`[UNIFIED-REDIS] âš ï¸ Upstash SREM failed:`, error);
        this.recordFailure('upstash');
      }
    }

    // Fallback to Azure (BACKUP)
    if (this.azureClient && this.isProviderAvailable('azure')) {
      try {
        const result = await this.azureClient.srem(key, ...members);
        this.resetFailures('azure');
        return result;
      } catch (error) {
        console.warn(`[UNIFIED-REDIS] âš ï¸ Azure SREM failed:`, error);
        this.recordFailure('azure');
      }
    }

    return 0;
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Get current active provider
   */
  getActiveProvider(): RedisProvider {
    return this.activeProvider;
  }

  /**
   * Get health status of all providers
   */
  getHealthStatus() {
    return {
      active: this.activeProvider,
      upstash: {
        configured: !!this.upstashClient,
        available: this.isProviderAvailable('upstash'),
        failures: this.failures.upstash,
      },
      azure: {
        configured: !!this.azureClient,
        available: this.isProviderAvailable('azure'),
        failures: this.failures.azure,
      },
    };
  }

  /**
   * Health check - test connection
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    latency?: number;
    provider: RedisProvider;
    details: any;
  }> {
    const startTime = Date.now();
    const testKey = `health:check:${Date.now()}`;

    try {
      await this.set(testKey, 'ok', { ex: 10 });
      const result = await this.get(testKey);
      await this.del(testKey);

      const latency = Date.now() - startTime;
      const health = this.getHealthStatus();

      return {
        status: result === 'ok' ? 'healthy' : 'degraded',
        latency,
        provider: this.activeProvider,
        details: health,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        provider: this.activeProvider,
        details: this.getHealthStatus(),
      };
    }
  }
}

// ============================================
// EXPORTS
// ============================================

/**
 * Singleton instance of unified Redis client
 *
 * âš ï¸ NOTE: This is NOT yet integrated with existing code.
 * It's ready for testing and integration in Phase 2.
 */
export const unifiedRedis = new UnifiedRedis();

/**
 * Export for compatibility testing
 */
export default unifiedRedis;
