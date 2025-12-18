# PinoLearn - Learning Platform Infrastructure

Production infrastructure code from a full-featured EdTech platform. This is not a tutorial or proof-of-concept - it's extracted from a live system serving paying subscribers.

## Technical Summary

| Metric | Value |
|--------|-------|
| API Endpoints | 126 |
| Database Models | 35+ |
| React Components | 63 |
| Schema Size | 908 lines (Prisma) |
| Uptime | 99.9%+ |

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                      Application Layer                            │
│  Next.js 14 (App Router) + React 18 + TypeScript                 │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────┐   ┌─────────────────────────────────┐   │
│  │   unified-redis     │   │     unified-database            │   │
│  │                     │   │                                 │   │
│  │  Primary            │   │  Primary          Failover      │   │
│  │  ┌─────────┐        │   │  ┌───────────┐  ┌───────────┐  │   │
│  │  │ Upstash │        │   │  │ Supabase  │─▶│   Azure   │  │   │
│  │  └────┬────┘        │   │  │PostgreSQL │  │PostgreSQL │  │   │
│  │       │ Failover    │   │  └───────────┘  └───────────┘  │   │
│  │  ┌────▼────┐        │   │                                 │   │
│  │  │  Azure  │        │   │  Prisma Proxy Pattern           │   │
│  │  │  Cache  │        │   │                                 │   │
│  │  └─────────┘        │   └─────────────────────────────────┘   │
│  │                     │                                          │
│  │  Circuit Breaker    │   ┌─────────────────────────────────┐   │
│  │  - 3 failures = off │   │       discover-precompute       │   │
│  │  - 60s auto-reset   │   │                                 │   │
│  └─────────────────────┘   │  - Runs every 5 minutes         │   │
│                            │  - Caches hot queries in Redis  │   │
│                            │  - 99.8% query reduction         │   │
├────────────────────────────┴─────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────┐   ┌─────────────────────────────────┐   │
│  │     security.ts     │   │         referrals.ts            │   │
│  │                     │   │                                 │   │
│  │  - SSRF protection  │   │  - Unique code generation       │   │
│  │  - XSS sanitization │   │  - Three-tier milestones        │   │
│  │  - SQLi detection   │   │  - Dual-sided rewards           │   │
│  │  - CSP headers      │   │  - Progress tracking            │   │
│  │  - PDF validation   │   │                                 │   │
│  └─────────────────────┘   └─────────────────────────────────────┘
└──────────────────────────────────────────────────────────────────┘
```

## Included Files

### unified-redis.ts (775 lines)
Multi-provider Redis client with automatic failover.

```typescript
// Circuit breaker configuration
private readonly MAX_FAILURES = 3;
private readonly FAILURE_RESET_TIME = 60000; // 1 minute

// Check if provider is available
private isProviderAvailable(provider: 'upstash' | 'azure'): boolean {
  const failures = this.failures[provider];
  if (failures < this.MAX_FAILURES) return true;
  
  const timeSinceLastFailure = Date.now() - lastFailure;
  if (timeSinceLastFailure > this.FAILURE_RESET_TIME) {
    this.resetFailures(provider);
    return true;
  }
  return false;
}
```

### unified-database.ts (481 lines)
Prisma proxy pattern with transparent failover between database providers.

```typescript
// Dynamic model proxy for seamless failover
private createProxy(modelName: string): any {
  return new Proxy({}, {
    get: (target, prop) => {
      return (...args: any[]) => {
        return this.executeWithFailover((client) => {
          const model = (client as any)[modelName];
          return model[prop as string].apply(model, args);
        });
      };
    },
  });
}
```

### security.ts (250 lines)
Comprehensive security layer for production applications.

```typescript
// SSRF protection - block private IP ranges
function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts[0] === 10) return true;                      // 10.0.0.0/8
  if (parts[0] === 172 && parts[1] >= 16) return true;   // 172.16.0.0/12
  if (parts[0] === 192 && parts[1] === 168) return true; // 192.168.0.0/16
  return false;
}
```

### discover-precompute.ts (228 lines)
Background job that eliminates database bottlenecks on high-traffic pages.

```typescript
// Performance impact
// Before: 5,000 queries/hour on /discover
// After: 12 queries/hour
// Reduction: 99.8%

const [featured, trending, highestRated, topCreators, recentlyAdded] =
  await Promise.all([
    // 5 parallel queries instead of sequential
    fetchFeatured(),
    fetchTrending(),
    fetchHighestRated(),
    fetchTopCreators(),
    fetchRecentlyAdded(),
  ]);
```

### referrals.ts (262 lines)
Viral growth engine with milestone-based rewards.

```typescript
// Three-tier reward structure
const REWARDS = {
  FIRST_REFERRAL: {
    referrer: { proTrialDays: 3, credits: 50 },
    referred: { proTrialDays: 3, credits: 50 },
  },
  MILESTONE_5: {
    referrer: { proTrialDays: 7, badges: ['early_adopter'] },
  },
  MILESTONE_10: {
    referrer: { proTrialDays: 30, badges: ['ambassador'] },
  },
};
```

## Monitoring and Analytics

The platform implements comprehensive observability:

| Tool | Purpose |
|------|---------|
| **PostHog** | Product analytics, user journeys, funnels |
| **Sentry** | Error tracking, performance monitoring |
| **Vercel Analytics** | Core Web Vitals, latency metrics |
| **Custom Logging** | Structured logs with correlation IDs |

## Why These Patterns?

**Dual Database**
Supabase has scheduled maintenance windows. Rather than show users errors, we failover to Azure PostgreSQL automatically.

**Circuit Breaker**
After experiencing cascading timeouts when Redis was slow (not down), we implemented circuit breaking. After 3 failures in 60 seconds, we skip Redis and serve directly from the database.

**Query Precomputation**
Our /discover page was the #1 database consumer. Running 5 queries on every page load doesn't scale. Now we run them once every 5 minutes and cache the results.

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 14 (App Router) |
| Database | PostgreSQL via Prisma |
| Cache | Redis (Upstash + Azure) |
| Hosting | Vercel (Edge) |
| Payments | LemonSqueezy |
| Auth | Clerk |
