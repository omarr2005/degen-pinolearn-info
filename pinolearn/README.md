# PinoLearn Infrastructure

Production-grade infrastructure code from an EdTech platform serving AI-powered learning roadmaps.

## Files

| File | Lines | Description |
|------|-------|-------------|
| `unified-redis.ts` | 775 | Multi-provider Redis with circuit breaker |
| `unified-database.ts` | 481 | Dual-database proxy with automatic failover |
| `security.ts` | 250 | XSS, SQL injection, SSRF protection |
| `helpers.ts` | 960 | Content extraction + AI generation pipeline |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
├─────────────────────────────────────────────────────────────┤
│  unified-redis.ts          │  unified-database.ts           │
│  ┌─────────────────────┐   │  ┌─────────────────────────┐   │
│  │ Circuit Breaker     │   │  │ Prisma Proxy Pattern    │   │
│  │ ┌─────┐   ┌─────┐   │   │  │ ┌─────────┐ ┌─────────┐ │   │
│  │ │Upst.│──▶│Azure│   │   │  │ │Supabase │▶│ Azure   │ │   │
│  │ └─────┘   └─────┘   │   │  │ └─────────┘ └─────────┘ │   │
│  └─────────────────────┘   │  └─────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  security.ts               │  helpers.ts                    │
│  • SSRF protection         │  • YouTube transcript extract  │
│  • XSS sanitization        │  • PDF parsing (pdfjs-dist)    │
│  • SQL injection detect    │  • Article extraction          │
│  • CSP headers             │  • AI roadmap generation       │
└─────────────────────────────────────────────────────────────┘
```

## Key Patterns

### Circuit Breaker (unified-redis.ts)

```typescript
// Failure tracking per provider
private failures: FailureTracker = {
  upstash: 0,
  azure: 0,
  lastUpstashFailure: 0,
  lastAzureFailure: 0,
};

// Auto-reset after 60 seconds
if (timeSinceLastFailure > FAILURE_RESET_TIME) {
  this.resetFailures(provider);
  return true;
}
```

### Proxy Pattern (unified-database.ts)

```typescript
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

### SSRF Protection (security.ts)

```typescript
// Check private IP ranges
if (parts[0] === 10) return true;                    // 10.0.0.0/8
if (parts[0] === 172 && parts[1] >= 16) return true; // 172.16.0.0/12
if (parts[0] === 192 && parts[1] === 168) return true; // 192.168.0.0/16
```

## Stats

- **126 API endpoints**
- **35+ database models**
- **63 React components**
- **908-line Prisma schema**

## Tech Stack

- TypeScript
- Next.js 14 (App Router)
- Prisma + PostgreSQL
- Redis (Upstash + Azure)
- OpenRouter AI
