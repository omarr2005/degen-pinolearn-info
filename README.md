# Production Engineering Portfolio

A curated collection of battle-tested infrastructure code from two production applications serving real users. These implementations solve real-world problems in distributed systems, high-availability architectures, and real-time applications.

## About

This portfolio represents over 18 months of iterative development on production systems. Every pattern and abstraction emerged from actual production incidents, performance bottlenecks, and scaling challenges - not theoretical exercises.

**Key Numbers:**
- 80,000+ lines of TypeScript
- 150+ API endpoints across both projects
- 45+ database models
- Zero planned downtime since launch

---

## Project 1: Learning Platform (EdTech SaaS)

A full-featured learning management system that generates personalized learning roadmaps. Currently running in production with active paying subscribers.

### Technical Highlights

**High-Availability Infrastructure**
- Dual-database architecture (Supabase primary, Azure PostgreSQL failover)
- Multi-provider Redis (Upstash primary, Azure Cache secondary)
- Circuit breaker pattern with configurable failure thresholds
- Automatic recovery with exponential backoff

**Database Layer**
- 35+ Prisma models with complex relations
- 908-line schema with full referential integrity
- Query optimization via precomputation (99.8% query reduction on hot paths)
- Per-user dashboard caching with 60s TTL

**Security Implementation**
- SSRF protection with DNS resolution checking for private IP ranges
- XSS sanitization on all user inputs
- SQL injection detection with pattern matching
- Content Security Policy with strict directives
- PDF upload validation with magic byte checking

**Monitoring & Analytics**
- PostHog integration for product analytics
- Custom event tracking for user journeys
- Funnel analysis for conversion optimization
- Real-time error tracking with Sentry
- Performance monitoring via Vercel Analytics

**Payment Infrastructure**
- Payment provider integration (LemonSqueezy)
- Webhook signature validation for both platforms
- Subscription lifecycle management
- Usage-based billing with daily limits
- Graceful degradation when payment providers are down

**Real-time Features**
- Server-Sent Events for live progress updates
- Optimistic UI updates with rollback
- Adaptive polling based on system load
- Emergency mode circuit breaker for traffic spikes

### Included Files

| File | Purpose |
|------|---------|
| `unified-redis.ts` | Multi-provider Redis client with circuit breaker, automatic failover, and health checking |
| `unified-database.ts` | Prisma proxy with dual-database failover and transparent recovery |
| `security.ts` | Comprehensive security layer including SSRF, XSS, SQLi protection |
| `discover-precompute.ts` | Background job that precomputes expensive queries, reducing DB load by 99.8% |
| `referrals.ts` | Viral growth engine with three-tier milestone rewards |

### Architecture Decision Records

1. **Why dual databases?** - Supabase has occasional planned maintenance. Azure provides seamless failover.
2. **Why circuit breaker?** - After 3 Redis timeouts in 60s, we skip Redis entirely rather than cascade latency.
3. **Why precomputation?** - /discover was running 5 queries per request. At 1000 users/hour, that's 5000 queries/hour just for one page.

---

## Project 2: Trading Psychology Bot (Crypto/Telegram)

A Telegram bot that provides trading psychology coaching, token security analysis, and whale tracking. Processes hundreds of messages daily with sub-second response times.

### Technical Highlights

**Multi-Model Architecture**
- Text reasoning via DeepSeek (cost-efficient for conversation)
- Vision analysis via Gemini Flash (chart screenshot interpretation)
- Dynamic model selection based on input type
- Graceful fallback when primary model is unavailable

**Real-time Streaming**
- Server-Sent Events parsing from OpenRouter
- Buffered Telegram message updates (rate limit aware)
- Progressive response rendering for better UX
- Connection pooling for high throughput

**Multi-Chain Integration**
- Ethereum payment verification via Etherscan API
- Solana payment verification via Solscan API
- TRON USDT verification via Tronscan API
- Automatic chain detection from transaction hash format

**Security Analysis Engine**
- GoPlus API integration for token security scanning
- Honeypot detection for Ethereum and Solana tokens
- Liquidity analysis and rug pull indicators
- Owner concentration warnings

**Personality System**
- 8 distinct trading psychology profiles
- Context-aware response generation
- Per-user conversation history
- Session management with configurable timeouts

### Included Files

| File | Purpose |
|------|---------|
| `ai.ts` | Dual-model orchestration with streaming, vision, and personality switching |
| `riskRadar.ts` | Multi-chain token security scanner using GoPlus API |

---

## Tech Stack

| Category | Technologies |
|----------|--------------|
| **Runtime** | Node.js 20, TypeScript 5.x, Deno (Edge Functions) |
| **Frameworks** | Next.js 14 (App Router), Telegraf 4.x |
| **Database** | PostgreSQL (Supabase + Azure), Prisma ORM |
| **Cache** | Redis (Upstash + Azure Cache) |
| **Models** | DeepSeek, Gemini Flash, LLaMA 3.3 70B |
| **Hosting** | Vercel (Edge), Azure App Service, Supabase Edge Functions |
| **Payments** | LemonSqueezy |
| **Monitoring** | PostHog, Sentry, Vercel Analytics |
| **APIs** | Etherscan, Solscan, Tronscan, GoPlus, OpenRouter |

---

## Patterns Demonstrated

| Pattern | Implementation |
|---------|---------------|
| Circuit Breaker | `unified-redis.ts` - Failure tracking, threshold-based disabling, timed recovery |
| Proxy Pattern | `unified-database.ts` - Dynamic model routing with transparent failover |
| Precomputation | `discover-precompute.ts` - Background jobs for expensive query caching |
| Adapter Pattern | `ai.ts` - Unified interface across multiple model providers |
| Strategy Pattern | `riskRadar.ts` - Chain-specific analysis strategies |
| Event Sourcing Lite | `referrals.ts` - Status transitions with audit trail |

---

## Why This Matters

These aren't proof-of-concept implementations. They're extracted from production systems that:
- Handle real money (subscriptions and crypto payments)
- Serve real users 24/7
- Have survived traffic spikes, provider outages, and edge cases
- Have been refined through production incidents and user feedback

The code reflects the reality of production engineering: graceful degradation, defensive programming, and respect for the chaos of distributed systems.

---

## Contact

Built by an independent developer. Technical discussions welcome.
