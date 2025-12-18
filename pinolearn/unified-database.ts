/**
 * Unified Database Client with Automatic Failover
 *
 * Architecture:
 * 1. Try Supabase (Primary) - Fast, Free tier
 * 2. Auto-fallback to Azure (Backup) - Paid, Unlimited
 * 3. Circuit breaker: Skip failed provider for 60 seconds
 *
 * Usage:
 * import { db } from '@/lib/unified-database';
 * const user = await db.user.findUnique({ where: { id } });
 */

import { PrismaClient } from '@prisma/client';

// Failure tracking for circuit breaker
interface ProviderHealth {
  failures: number;
  lastFailure: number;
  isCircuitOpen: boolean;
}

const providerHealth: Record<string, ProviderHealth> = {
  supabase: { failures: 0, lastFailure: 0, isCircuitOpen: false },
  azure: { failures: 0, lastFailure: 0, isCircuitOpen: false },
};

// Circuit breaker configuration
const FAILURE_THRESHOLD = 3; // Open circuit after 3 failures
const CIRCUIT_RESET_TIME = 60000; // Reset after 60 seconds
const OPERATION_TIMEOUT = 5000; // 5 second timeout per operation

// Create Prisma clients
let supabaseClient: PrismaClient | null = null;
let azureClient: PrismaClient | null = null;

function createSupabaseClient(): PrismaClient | null {
  if (!process.env.DATABASE_URL) {
    console.warn('[UNIFIED-DB] ðŸŸ¡ DATABASE_URL not configured (Supabase)');
    return null;
  }

  try {
    console.log('[UNIFIED-DB] ðŸ”µ Creating Supabase PostgreSQL client...');
    console.log(
      '[UNIFIED-DB] ðŸ“ Supabase URL:',
      process.env.DATABASE_URL.split('@')[1]?.split('/')[0] || 'HIDDEN'
    );

    const client = new PrismaClient({
      datasources: {
        db: { url: process.env.DATABASE_URL },
      },
      log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'event' },
        { level: 'warn', emit: 'event' },
      ],
      errorFormat: 'minimal',
    });

    // ðŸ”¥ CRITICAL: Log all database operations
    client.$on('query', (e: any) => {
      console.log('[SUPABASE-QUERY]', {
        query: e.query.substring(0, 100),
        duration: `${e.duration}ms`,
        timestamp: new Date().toISOString(),
      });
    });

    client.$on('error', (e: any) => {
      console.error('[SUPABASE-ERROR]', {
        message: e.message,
        target: e.target,
        timestamp: new Date().toISOString(),
      });
    });

    client.$on('warn', (e: any) => {
      console.warn('[SUPABASE-WARN]', e.message);
    });

    console.log('[UNIFIED-DB] [OK] Supabase client created successfully');
    return client;
  } catch (error) {
    console.error('[UNIFIED-DB] âŒ Failed to create Supabase client:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      env_url_exists: !!process.env.DATABASE_URL,
      timestamp: new Date().toISOString(),
    });
    return null;
  }
}

function createAzureClient(): PrismaClient | null {
  if (!process.env.AZURE_DATABASE_URL) {
    console.warn('[UNIFIED-DB] ðŸŸ¡ AZURE_DATABASE_URL not configured');
    return null;
  }

  try {
    console.log('[UNIFIED-DB] ðŸ”· Creating Azure PostgreSQL client...');
    console.log(
      '[UNIFIED-DB] ðŸ“ Azure URL:',
      process.env.AZURE_DATABASE_URL.split('@')[1]?.split('/')[0] || 'HIDDEN'
    );

    const client = new PrismaClient({
      datasources: {
        db: { url: process.env.AZURE_DATABASE_URL },
      },
      log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'event' },
        { level: 'warn', emit: 'event' },
      ],
      errorFormat: 'minimal',
    });

    // ðŸ”¥ CRITICAL: Log all database operations
    client.$on('query', (e: any) => {
      console.log('[AZURE-QUERY]', {
        query: e.query.substring(0, 100),
        duration: `${e.duration}ms`,
        timestamp: new Date().toISOString(),
      });
    });

    client.$on('error', (e: any) => {
      console.error('[AZURE-ERROR]', {
        message: e.message,
        target: e.target,
        timestamp: new Date().toISOString(),
      });
    });

    client.$on('warn', (e: any) => {
      console.warn('[AZURE-WARN]', e.message);
    });

    console.log('[UNIFIED-DB] [OK] Azure client created successfully');
    return client;
  } catch (error) {
    console.error('[UNIFIED-DB] âŒ Failed to create Azure client:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      env_url_exists: !!process.env.AZURE_DATABASE_URL,
      timestamp: new Date().toISOString(),
    });
    return null;
  }
}

// Initialize clients
supabaseClient = createSupabaseClient();
azureClient = createAzureClient();

// Circuit breaker functions
function recordFailure(provider: 'supabase' | 'azure') {
  const health = providerHealth[provider];
  health.failures++;
  health.lastFailure = Date.now();

  if (health.failures >= FAILURE_THRESHOLD) {
    health.isCircuitOpen = true;
    console.warn(
      `[UNIFIED-DB] ðŸ”´ Circuit breaker OPEN for ${provider} (${health.failures} failures)`
    );
  }
}

function isProviderAvailable(provider: 'supabase' | 'azure'): boolean {
  const health = providerHealth[provider];

  // Check if circuit should be reset
  if (health.isCircuitOpen && Date.now() - health.lastFailure > CIRCUIT_RESET_TIME) {
    console.log(`[UNIFIED-DB] ðŸ”„ Circuit breaker RESET for ${provider} (trying again)`);
    health.failures = 0;
    health.isCircuitOpen = false;
  }

  return !health.isCircuitOpen;
}

function recordSuccess(provider: 'supabase' | 'azure') {
  const health = providerHealth[provider];
  if (health.failures > 0) {
    console.log(`[UNIFIED-DB] [OK] ${provider} recovered (resetting failure count)`);
    health.failures = 0;
  }
  health.isCircuitOpen = false;
}

// Timeout wrapper for operations
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Operation timeout')), timeoutMs)
    ),
  ]);
}

/**
 * Unified Database Client Proxy
 * Automatically routes queries to available database (Supabase â†’ Azure)
 */
class UnifiedDatabaseClient {
  private get activeClient(): PrismaClient {
    // Try Supabase first (fast, free)
    if (supabaseClient && isProviderAvailable('supabase')) {
      return supabaseClient;
    }

    // Fallback to Azure (reliable, paid)
    if (azureClient && isProviderAvailable('azure')) {
      console.warn('[UNIFIED-DB] âš ï¸ Using Azure PostgreSQL (Supabase unavailable)');
      return azureClient;
    }

    // Both failed - use Supabase anyway (will throw error)
    if (supabaseClient) {
      console.error('[UNIFIED-DB] ðŸ”´ Both databases unavailable, trying Supabase anyway');
      return supabaseClient;
    }

    throw new Error('No database clients available');
  }

  /**
   * Execute query with automatic failover
   */
  private async executeWithFailover<T>(
    operation: (client: PrismaClient) => Promise<T>
  ): Promise<T> {
    // Try Supabase first
    if (supabaseClient && isProviderAvailable('supabase')) {
      try {
        const result = await withTimeout(operation(supabaseClient), OPERATION_TIMEOUT);
        recordSuccess('supabase');
        return result;
      } catch (error) {
        console.error('[UNIFIED-DB] âŒ Supabase query failed:', error);
        recordFailure('supabase');

        // Try Azure as fallback
        if (azureClient && isProviderAvailable('azure')) {
          console.warn('[UNIFIED-DB] ðŸ”„ Failing over to Azure PostgreSQL...');
          try {
            const result = await withTimeout(operation(azureClient), OPERATION_TIMEOUT);
            recordSuccess('azure');
            return result;
          } catch (azureError) {
            console.error('[UNIFIED-DB] âŒ Azure query also failed:', azureError);
            recordFailure('azure');
            throw azureError;
          }
        }

        throw error;
      }
    }

    // Supabase unavailable, try Azure directly
    if (azureClient && isProviderAvailable('azure')) {
      console.warn('[UNIFIED-DB] âš ï¸ Using Azure PostgreSQL (Supabase circuit open)');
      try {
        const result = await withTimeout(operation(azureClient), OPERATION_TIMEOUT);
        recordSuccess('azure');
        return result;
      } catch (error) {
        console.error('[UNIFIED-DB] âŒ Azure query failed:', error);
        recordFailure('azure');
        throw error;
      }
    }

    throw new Error('All database providers unavailable');
  }

  // Prisma proxy - routes all operations through failover logic
  get user() {
    return this.createProxy('user');
  }

  get roadmap() {
    return this.createProxy('roadmap');
  }

  get lesson() {
    return this.createProxy('lesson');
  }

  get mentorChatSession() {
    return this.createProxy('mentorChatSession');
  }

  get mentorChatMessage() {
    return this.createProxy('mentorChatMessage');
  }

  get userActivity() {
    return this.createProxy('userActivity');
  }

  get quiz() {
    return this.createProxy('quiz');
  }

  get flashcardSet() {
    return this.createProxy('flashcardSet');
  }

  get comment() {
    return this.createProxy('comment');
  }

  get rating() {
    return this.createProxy('rating');
  }

  get follow() {
    return this.createProxy('follow');
  }

  get notification() {
    return this.createProxy('notification');
  }

  get collection() {
    return this.createProxy('collection');
  }

  get attachment() {
    return this.createProxy('attachment');
  }

  get resource() {
    return this.createProxy('resource');
  }

  get tag() {
    return this.createProxy('tag');
  }

  get roadmapTag() {
    return this.createProxy('roadmapTag');
  }

  get activity() {
    return this.createProxy('activity');
  }

  get achievement() {
    return this.createProxy('achievement');
  }

  get project() {
    return this.createProxy('project');
  }

  get quizAttempt() {
    return this.createProxy('quizAttempt');
  }

  get userUsage() {
    return this.createProxy('userUsage');
  }

  get referral() {
    return this.createProxy('referral');
  }

  get userRewards() {
    return this.createProxy('userRewards');
  }

  get webhookEvent() {
    return this.createProxy('webhookEvent');
  }

  get chatMessage() {
    return this.createProxy('chatMessage');
  }

  get question() {
    return this.createProxy('question');
  }

  get flashcard() {
    return this.createProxy('flashcard');
  }

  // Special methods
  async $transaction(operations: any[]) {
    return this.executeWithFailover((client) => client.$transaction(operations));
  }

  async $connect() {
    return this.executeWithFailover((client) => client.$connect());
  }

  async $disconnect() {
    const promises = [];
    if (supabaseClient) promises.push(supabaseClient.$disconnect());
    if (azureClient) promises.push(azureClient.$disconnect());
    await Promise.all(promises);
  }

  private createProxy(modelName: string): any {
    return new Proxy(
      {},
      {
        get: (target, prop) => {
          return (...args: any[]) => {
            return this.executeWithFailover((client) => {
              const model = (client as any)[modelName];
              const method = model[prop as string];
              return method.apply(model, args);
            });
          };
        },
      }
    );
  }

  // Health check
  async healthCheck() {
    const results = {
      supabase: { available: false, latency: 0 },
      azure: { available: false, latency: 0 },
    };

    // Test Supabase
    if (supabaseClient) {
      const start = Date.now();
      try {
        await withTimeout(supabaseClient.$queryRaw`SELECT 1`, 3000);
        results.supabase.available = true;
        results.supabase.latency = Date.now() - start;
      } catch (error) {
        console.error('[UNIFIED-DB] Supabase health check failed:', error);
      }
    }

    // Test Azure
    if (azureClient) {
      const start = Date.now();
      try {
        await withTimeout(azureClient.$queryRaw`SELECT 1`, 3000);
        results.azure.available = true;
        results.azure.latency = Date.now() - start;
      } catch (error) {
        console.error('[UNIFIED-DB] Azure health check failed:', error);
      }
    }

    return results;
  }
}

// Export singleton instance
export const db = new UnifiedDatabaseClient();

// Log initialization
console.log('[UNIFIED-DB] ========================================');
console.log('[UNIFIED-DB] ðŸš€ Unified Database Client initialized');
console.log('[UNIFIED-DB] ========================================');
console.log(
  '[UNIFIED-DB] [OK] Primary: Supabase PostgreSQL',
  supabaseClient ? '(available)' : '(unavailable)'
);
console.log(
  '[UNIFIED-DB] [OK] Backup: Azure PostgreSQL',
  azureClient ? '(available)' : '(unavailable)'
);
console.log('[UNIFIED-DB] âš¡ Automatic failover: ENABLED');
console.log('[UNIFIED-DB] ðŸ”„ Circuit breaker: ENABLED');
console.log('[UNIFIED-DB] ========================================');
