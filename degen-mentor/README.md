# Degen Mentor - Trading Psychology Bot

Production code from a Telegram bot that provides trading psychology coaching, token security analysis, and real-time market insights. Processes hundreds of messages daily with sub-second response times.

## Technical Summary

| Metric | Value |
|--------|-------|
| Daily Messages | 500+ |
| Response Latency | < 2s |
| Supported Chains | 3 (ETH, SOL, TRON) |
| Uptime | 99%+ |

## Architecture Overview

```
┌───────────────────────────────────────────────────────────────┐
│                     Telegram Bot Layer                         │
│                     (Telegraf 4.x)                             │
├───────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │                      ai.ts                                │ │
│  │                                                           │ │
│  │  ┌─────────────────┐    ┌─────────────────────────────┐  │ │
│  │  │   Text Model    │    │      Vision Model           │  │ │
│  │  │   (DeepSeek)    │    │      (Gemini Flash)         │  │ │
│  │  │                 │    │                             │  │ │
│  │  │  - Conversation │    │  - Chart analysis           │  │ │
│  │  │  - Psychology   │    │  - Screenshot parsing       │  │ │
│  │  │  - 8 personas   │    │  - Pattern recognition      │  │ │
│  │  └─────────────────┘    └─────────────────────────────┘  │ │
│  │                                                           │ │
│  │  SSE Streaming → Buffered Telegram Updates               │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌───────────────────────┐    ┌───────────────────────────┐  │
│  │     riskRadar.ts      │    │    Payment Verification    │  │
│  │                       │    │                            │  │
│  │  GoPlus API           │    │  Etherscan (ETH)          │  │
│  │  ├─ Honeypot check    │    │  Solscan (SOL)            │  │
│  │  ├─ Rug pull score    │    │  Tronscan (USDT/TRC20)    │  │
│  │  ├─ Liquidity lock    │    │                            │  │
│  │  └─ Owner analysis    │    │  Auto chain detection      │  │
│  │                       │    │                            │  │
│  │  Supports: ETH + SOL  │    │                            │  │
│  └───────────────────────┘    └───────────────────────────┘  │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│                     Supabase (PostgreSQL)                      │
│  users | payments | sessions | tracked_wallets | partners      │
└────────────────────────────────────────────────────────────────┘
```

## Included Files

### ai.ts (509 lines)
Dual-model architecture with streaming and personality system.

```typescript
// Model selection based on input type
const MODEL = 'deepseek/deepseek-chat';          // Text reasoning
const VISION_MODEL = 'google/gemini-2.5-flash';  // Image analysis

// Streaming with buffered updates
let lastUpdate = Date.now();
const MIN_UPDATE_INTERVAL = 1500; // Telegram rate limit

for await (const chunk of stream) {
  fullResponse += chunk;
  
  if (Date.now() - lastUpdate > MIN_UPDATE_INTERVAL) {
    await ctx.telegram.editMessageText(chatId, msgId, null, fullResponse);
    lastUpdate = Date.now();
  }
}
```

### riskRadar.ts (260 lines)
Multi-chain token security scanner using GoPlus API.

```typescript
// Auto-detect blockchain from address format
function detectChain(address: string): 'ethereum' | 'solana' {
  if (address.startsWith('0x') && address.length === 42) {
    return 'ethereum';
  }
  if (address.length >= 32 && address.length <= 44) {
    return 'solana';
  }
  throw new Error('Unknown address format');
}

// Security checks performed
interface TokenRiskReport {
  isHoneypot: boolean;
  rugPullRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  liquidityLocked: boolean;
  ownershipRenounced: boolean;
  topHolderConcentration: number;
}
```

## Technical Decisions

**Why Dual Models?**
DeepSeek is 10x cheaper than GPT-4 for text conversation. But it lacks vision capabilities. Gemini Flash handles image analysis when users send chart screenshots. The router selects the appropriate model based on message content.

**Why Buffered Updates?**
Telegram rate limits message edits to roughly 1 per second per message. Streaming responses token-by-token would hit rate limits. We buffer updates and flush every 1.5 seconds.

**Why Multi-Chain Verification?**
Our users pay in whichever crypto they hold. Some prefer ETH (lower fees on L2), others prefer SOL (fast), others prefer USDT on TRON (stable + low fees). Supporting all three maximizes conversion.

## Features

| Feature | Description |
|---------|-------------|
| **Personality Modes** | 8 distinct trading psychology profiles (Diamond Hands, FOMO Killer, Whale Whisperer, etc.) |
| **Risk Radar** | Token security scanning with honeypot detection and rug pull indicators |
| **Whale Tracking** | Monitor known whale wallet movements in real-time |
| **Chart Analysis** | Vision model interprets technical analysis from screenshots |
| **Direct Payments** | Native crypto payments with automatic verification |

## Tech Stack

| Category | Technology |
|----------|------------|
| Bot Framework | Telegraf 4.x |
| Runtime | Node.js 20 |
| Database | PostgreSQL (Supabase) |
| Models | DeepSeek Chat, Gemini Flash |
| Hosting | Azure App Service |
| APIs | GoPlus, Etherscan, Solscan, Tronscan |

## Usage Patterns

The bot handles several interaction types:

1. **Text messages** → Routed to DeepSeek for psychology coaching
2. **Image messages** → Routed to Gemini for chart analysis  
3. **Token addresses** → Routed to Risk Radar for security scan
4. **Transaction hashes** → Routed to payment verification

Each interaction is logged with response latency for performance monitoring.
