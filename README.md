# Portfolio Showcase

A collection of production-grade TypeScript implementations demonstrating advanced patterns in distributed systems, AI integration, and real-time web applications.

## Projects

### 1. PinoLearn - AI-Powered Learning Platform
An EdTech platform with 126 API endpoints, 35+ database models, and enterprise-grade infrastructure.

**Highlights:**
- Dual-database architecture with automatic failover
- Circuit breaker pattern for Redis with multi-provider support
- Real-time AI content streaming with buffered updates
- SSRF protection and comprehensive security layer

[View PinoLearn Code →](./pinolearn/)

### 2. Degen Mentor - AI Crypto Trading Bot
A Telegram bot featuring multi-model AI architecture, real-time chart analysis, and multi-chain payment verification.

**Highlights:**
- Dual-model architecture (DeepSeek + Gemini)
- Vision-based chart analysis pipeline
- Server-Sent Events streaming with rate limiting
- Three-chain payment verification (ETH, SOL, USDT)

[View Degen Mentor Code →](./degen-mentor/)

---

## Technical Stack

| Layer | Technologies |
|-------|--------------|
| **Languages** | TypeScript, SQL |
| **Databases** | PostgreSQL (Supabase + Azure), Redis (Upstash + Azure) |
| **AI/ML** | OpenRouter, DeepSeek, Gemini, LLaMA |
| **Infrastructure** | Vercel, Azure, Supabase Edge Functions |
| **Payments** | LemonSqueezy, Paddle, Crypto (ETH/SOL/USDT) |

## Architecture Patterns

- **Circuit Breaker** - Automatic failover with failure tracking and reset timers
- **Proxy Pattern** - Dynamic database model routing with failover
- **Streaming SSE** - Real-time AI responses with buffered Telegram updates
- **SSRF Protection** - DNS resolution checking for private IP ranges

## Contact

Built by a student developer working on EdTech and crypto projects.
