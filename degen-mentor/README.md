# Degen Mentor Bot

AI-powered crypto trading psychology mentor for Telegram with multi-model architecture and vision capabilities.

## Files

| File | Lines | Description |
|------|-------|-------------|
| `ai.ts` | 509 | Dual-model AI with streaming and vision |
| `riskRadar.ts` | 260 | Multi-chain token security scanner |
| `verify.ts` | 308 | Three-chain payment verification |

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    Telegram Bot (Telegraf)                  │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐       │
│  │   ai.ts     │   │ riskRadar   │   │  verify.ts  │       │
│  │             │   │    .ts      │   │             │       │
│  │ • DeepSeek  │   │ • GoPlus    │   │ • Etherscan │       │
│  │ • Gemini    │   │   API       │   │ • Solscan   │       │
│  │ • Streaming │   │ • ETH + SOL │   │ • Tronscan  │       │
│  └─────────────┘   └─────────────┘   └─────────────┘       │
│         │                 │                 │               │
├─────────┴─────────────────┴─────────────────┴───────────────┤
│                    Supabase (PostgreSQL)                    │
│  users │ payments │ partners │ tracked_wallets              │
└────────────────────────────────────────────────────────────┘
```

## Key Patterns

### Dual-Model Architecture (ai.ts)

```typescript
// Text reasoning
const MODEL = 'deepseek/deepseek-chat';

// Vision/Chart analysis
const VISION_MODEL = 'google/gemini-2.5-flash';

// Dynamic date injection for current context
const getCurrentDate = () => {
  const now = new Date();
  return now.toLocaleDateString('en-US', { 
    month: 'long', day: 'numeric', year: 'numeric' 
  });
};
```

### SSE Streaming with Buffered Updates

```typescript
// Stream AI response token-by-token
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value, { stream: true });
  fullResponse += chunk;
  
  // Buffer updates to avoid Telegram rate limits
  if (Date.now() - lastUpdate > 1500) {
    await ctx.telegram.editMessageText(chatId, msgId, null, fullResponse);
    lastUpdate = Date.now();
  }
}
```

### Multi-Chain Token Scanning

```typescript
// Auto-detect chain from address format
function detectChain(address: string): 'ethereum' | 'solana' {
  if (address.startsWith('0x') && address.length === 42) {
    return 'ethereum';
  }
  if (address.length >= 32 && address.length <= 44) {
    return 'solana';
  }
  throw new Error('Unknown address format');
}
```

### Three-Chain Payment Verification

```typescript
// Route to correct blockchain explorer
switch (detectPaymentType(txHash)) {
  case 'ETH':
    return verifyEtherscan(txHash, expectedAmount);
  case 'SOL':
    return verifySolscan(txHash, expectedAmount);
  case 'USDT':
    return verifyTronscan(txHash, expectedAmount);
}
```

## Features

- **8 AI Personality Modes** - Diamond Hands, FOMO Killer, Whale Whisperer, etc.
- **Risk Radar** - Honeypot detection, rug pull scanning, liquidity analysis
- **Whale Tracking** - Monitor known whale wallet movements
- **Chart Analysis** - Vision model for technical analysis from screenshots
- **Crypto Payments** - Native ETH, SOL, USDT payment verification

## Tech Stack

- TypeScript
- Telegraf (Telegram Bot API)
- OpenRouter (DeepSeek + Gemini)
- Supabase (PostgreSQL)
- Azure App Service
- Etherscan / Solscan / Tronscan APIs
