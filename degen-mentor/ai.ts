// ═══════════════════════════════════════════════════════════════
// AI SERVICE - OpenRouter integration with DeepSeek V3.2
// ═══════════════════════════════════════════════════════════════

import { CryptoContext } from '../lib/contexts';

const API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'deepseek/deepseek-chat';
const VISION_MODEL = 'google/gemini-2.5-flash';

// Chart analysis prompt for vision model
const CHART_ANALYSIS_PROMPT = `You are a crypto chart analyst. Analyze this chart image and provide:
1. Asset and timeframe (if visible)
2. Current trend (bullish/bearish/sideways)
3. Key support and resistance levels (if visible)
4. Technical indicators visible (RSI, MACD, volume, etc.)
5. Any patterns (triangles, head and shoulders, flags, etc.)

Be CONCISE - respond in 2-4 sentences maximum. Focus on the most important observations.
If this is not a chart, briefly describe what you see.`;

interface Message {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface AIResponse {
    success: boolean;
    content: string;
    error?: string;
}

// OpenRouter API response type
interface OpenRouterResponse {
    choices: Array<{
        message: {
            content: string;
        };
    }>;
    usage?: {
        total_tokens: number;
    };
}

// ═══════════════════════════════════════
// MAIN SYSTEM PROMPT
// ═══════════════════════════════════════

// Get current date for AI context
const getCurrentDate = () => {
    const now = new Date();
    return `${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
};

const BASE_SYSTEM_PROMPT = `You are DEGEN MENTOR, an elite crypto-native AI trading psychology coach.

IMPORTANT: Today's date is ${getCurrentDate()}. We are in the year 2025. The Bitcoin halving already happened in April 2024. Always give current, up-to-date information.

PERSONALITY:
- Speak like a crypto OG: ape, degen, rug, pump, moon, LFG, wagmi, ngmi, ser, fren, gm, based, rekt
- Reference famous figures naturally: Satoshi, CZ, Vitalik, Michael Saylor, SBF (cautionary tale)
- Use emojis 🚀💎🐋🔥📊🧠⚠️ but don't overdo it
- Be realistic about risks - reference FTX, Luna crashes
- Dark humor about market crashes (we cope through memes)

YOUR KNOWLEDGE:
- Crypto legends: CZ ("If you can't hold, you won't be rich"), Saylor (Bitcoin maxi), Vitalik (ETH vision)
- History: Mt Gox, Pizza Day, Luna collapse, FTX fraud, Bitcoin halvings
- Trading: TA, support/resistance, RSI, MACD, whale tracking
- DeFi: Uniswap, Aave, yield farming, rug pulls, audits

DYNAMIC RESPONSE LENGTH (IMPORTANT):
Judge the question complexity and respond accordingly:
• SIMPLE questions ("what is X?", quick facts, definitions) → 600-900 characters
• MEDIUM questions ("how to", "explain", comparisons) → 1000-1400 characters
• COMPLEX questions (strategy, analysis, multi-part, debates) → 1500-2000 characters
• NEVER respond with less than 600 characters - give value always
• If user asks for more detail, give 1800-2200 characters

RESPONSE STYLE:
- BE NATURAL - no rigid templates, vary your style each time
- Use paragraphs with blank lines for readability
- Bold key terms with *asterisks*
- Mix formats: sometimes bullets, sometimes flowing text
- End with an engaging question or thought
- Include NFA somewhere naturally

VARIETY IS KEY - Don't always start the same way. Be conversational, not robotic.

RULES:
1. Never say "buy/sell" directly - use "consider", "look at"
2. Always include NFA (Not Financial Advice)
3. Encourage DYOR
4. Focus on psychology & education`;

// ═══════════════════════════════════════
// AI CHAT FUNCTION
// ═══════════════════════════════════════

export async function chatWithAI(
    context: CryptoContext,
    userMessage: string,
    conversationHistory: Message[] = []
): Promise<AIResponse> {
    if (!API_KEY) {
        console.error('[AI] OpenRouter API key not configured');
        return {
            success: false,
            content: '😰 AI is not configured. Please contact support.',
            error: 'API key missing'
        };
    }

    try {
        // Build the full system prompt with context
        const systemPrompt = `${BASE_SYSTEM_PROMPT}

CURRENT MODE: ${context.emoji} ${context.name}
${context.systemPrompt}

You are now in ${context.name.toUpperCase()} mode. Embody this perspective in your response.`;

        // Prepare messages
        const messages: Message[] = [
            { role: 'system', content: systemPrompt },
            ...conversationHistory.slice(-10), // Last 10 messages for context
            { role: 'user', content: userMessage }
        ];

        console.log(`[AI] Calling OpenRouter with ${context.name} context`);
        console.log(`[AI] Using model: ${MODEL}`);
        console.log(`[AI] System prompt length: ${systemPrompt.length} chars`);

        // Add timeout to prevent hanging
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        try {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://degenmentor.bot',
                    'X-Title': 'Degen Mentor Bot'
                },
                body: JSON.stringify({
                    model: MODEL,
                    messages,
                    temperature: 0.7,
                    max_tokens: 1500,
                    top_p: 0.9
                }),
                signal: controller.signal
            });

            clearTimeout(timeout);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('[AI] API error:', response.status, JSON.stringify(errorData));
                return {
                    success: false,
                    content: `😰 AI returned error ${response.status}. Try again in a moment.`,
                    error: `API error: ${response.status} - ${JSON.stringify(errorData)}`
                };
            }

            const data = await response.json() as OpenRouterResponse;
            const content = data.choices?.[0]?.message?.content;

            if (!content) {
                console.error('[AI] Empty response from API');
                return {
                    success: false,
                    content: '😰 Got an empty response. Try rephrasing your question.',
                    error: 'Empty response'
                };
            }

            // Log usage for cost tracking
            if (data.usage) {
                const tokens = data.usage.total_tokens;
                console.log(`[AI] Used ${tokens} tokens`);
            }

            return {
                success: true,
                content
            };

        } catch (error: any) {
            clearTimeout(timeout);

            // Check if it was a timeout
            if (error.name === 'AbortError') {
                console.error('[AI] Request timed out after 30 seconds');
                return {
                    success: false,
                    content: '😰 AI took too long to respond. Please try again.',
                    error: 'Request timeout'
                };
            }

            console.error('[AI] Request failed:', error.message || error);
            return {
                success: false,
                content: '😰 Something went wrong. Please try again.',
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    } catch (outerError: any) {
        console.error('[AI] Outer error:', outerError.message || outerError);
        return {
            success: false,
            content: '😰 AI service error. Please try again.',
            error: outerError instanceof Error ? outerError.message : 'Unknown outer error'
        };
    }
}

// ═══════════════════════════════════════
// STREAMING AI CHAT FUNCTION
// ═══════════════════════════════════════

export async function streamChatWithAI(
    context: CryptoContext,
    userMessage: string,
    conversationHistory: Message[] = [],
    onChunk: (accumulatedText: string) => Promise<void>
): Promise<AIResponse> {
    if (!API_KEY) {
        console.error('[AI] OpenRouter API key not configured');
        return {
            success: false,
            content: '😰 AI is not configured. Please contact support.',
            error: 'API key missing'
        };
    }

    try {
        // Build the full system prompt with context
        const systemPrompt = `${BASE_SYSTEM_PROMPT}

CURRENT MODE: ${context.emoji} ${context.name}
${context.systemPrompt}

You are now in ${context.name.toUpperCase()} mode. Embody this perspective in your response.`;

        // Prepare messages
        const messages: Message[] = [
            { role: 'system', content: systemPrompt },
            ...conversationHistory.slice(-10),
            { role: 'user', content: userMessage }
        ];

        console.log(`[AI Stream] Calling OpenRouter with ${context.name} context`);

        // Timeout controller
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 90000); // 90 sec for streaming

        try {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://degenmentor.bot',
                    'X-Title': 'Degen Mentor Bot'
                },
                body: JSON.stringify({
                    model: MODEL,
                    messages,
                    temperature: 0.7,
                    max_tokens: 1500,
                    top_p: 0.9,
                    stream: true // Enable streaming
                }),
                signal: controller.signal
            });

            clearTimeout(timeout);

            if (!response.ok) {
                const errorData = await response.text();
                console.error('[AI Stream] API error:', response.status, errorData);
                return {
                    success: false,
                    content: `😰 AI returned error ${response.status}. Try again.`,
                    error: `API error: ${response.status}`
                };
            }

            // Process SSE stream
            const reader = response.body?.getReader();
            if (!reader) {
                return {
                    success: false,
                    content: '😰 Could not read stream.',
                    error: 'No reader'
                };
            }

            const decoder = new TextDecoder();
            let accumulatedContent = '';
            let lastUpdateTime = 0;
            const UPDATE_INTERVAL = 1500; // Update every 1.5 seconds (Telegram rate limit)

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(line => line.trim() !== '');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') continue;

                        try {
                            const parsed = JSON.parse(data);
                            const delta = parsed.choices?.[0]?.delta?.content;
                            if (delta) {
                                accumulatedContent += delta;

                                // Update callback with rate limiting
                                const now = Date.now();
                                if (now - lastUpdateTime > UPDATE_INTERVAL && accumulatedContent.length > 50) {
                                    await onChunk(accumulatedContent);
                                    lastUpdateTime = now;
                                }
                            }
                        } catch (e) {
                            // Skip malformed JSON
                        }
                    }
                }
            }

            // Final update with complete content
            if (accumulatedContent) {
                await onChunk(accumulatedContent);
            }

            if (!accumulatedContent) {
                return {
                    success: false,
                    content: '😰 Got an empty response.',
                    error: 'Empty stream'
                };
            }

            console.log(`[AI Stream] Complete. Length: ${accumulatedContent.length}`);

            return {
                success: true,
                content: accumulatedContent
            };

        } catch (error: any) {
            clearTimeout(timeout);

            if (error.name === 'AbortError') {
                console.error('[AI Stream] Request timed out');
                return {
                    success: false,
                    content: '😰 AI took too long. Please try again.',
                    error: 'Timeout'
                };
            }

            console.error('[AI Stream] Error:', error.message || error);
            return {
                success: false,
                content: '😰 Something went wrong. Please try again.',
                error: error.message || 'Unknown error'
            };
        }
    } catch (outerError: any) {
        console.error('[AI Stream] Outer error:', outerError.message || outerError);
        return {
            success: false,
            content: '😰 AI service error. Please try again.',
            error: outerError.message || 'Unknown outer error'
        };
    }
}

// ═══════════════════════════════════════
// FORMAT RESPONSE
// ═══════════════════════════════════════

export function formatAIResponse(content: string, context: CryptoContext): string {
    // Add context header
    const header = `${context.emoji} *${context.name}*\n\n`;

    // Add disclaimer footer if not already present
    const hasNFA = content.toLowerCase().includes('nfa') || content.toLowerCase().includes('not financial advice');
    const footer = hasNFA ? '' : '\n\n_NFA - Not Financial Advice_';

    return header + content + footer;
}

// ═══════════════════════════════════════
// VISION CHART ANALYSIS
// ═══════════════════════════════════════

export interface VisionResponse {
    success: boolean;
    analysis: string;
    error?: string;
}

export async function analyzeChartImage(imageBase64: string): Promise<VisionResponse> {
    if (!API_KEY) {
        console.error('[Vision] OpenRouter API key not configured');
        return {
            success: false,
            analysis: '',
            error: 'API key missing'
        };
    }

    console.log('[Vision] Analyzing chart image...');

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000); // 60 sec timeout for vision

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://degenmentor.bot',
                'X-Title': 'Degen Mentor Bot'
            },
            body: JSON.stringify({
                model: VISION_MODEL,
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: CHART_ANALYSIS_PROMPT },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:image/jpeg;base64,${imageBase64}`
                            }
                        }
                    ]
                }],
                max_tokens: 300,
                temperature: 0.3 // Lower temperature for more precise analysis
            }),
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
            const errorData = await response.text();
            console.error('[Vision] API error:', response.status, errorData);
            return {
                success: false,
                analysis: '',
                error: `API error: ${response.status}`
            };
        }

        const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
        const analysis = data.choices?.[0]?.message?.content;

        if (!analysis) {
            console.error('[Vision] Empty response from API');
            return {
                success: false,
                analysis: '',
                error: 'Empty response'
            };
        }

        console.log(`[Vision] Analysis complete: ${analysis.slice(0, 100)}...`);

        return {
            success: true,
            analysis
        };

    } catch (error: any) {
        if (error.name === 'AbortError') {
            console.error('[Vision] Request timed out');
            return {
                success: false,
                analysis: '',
                error: 'Timeout'
            };
        }

        console.error('[Vision] Error:', error.message || error);
        return {
            success: false,
            analysis: '',
            error: error.message || 'Unknown error'
        };
    }
}
