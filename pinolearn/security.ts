/**
 * Security utilities for protecting against malicious content
 */

// Malicious URL patterns
const MALICIOUS_PATTERNS = [
  // Executable files
  /\.(exe|bat|cmd|com|pif|scr|vbs|js|jar|msi|dll|sys|drv)$/i,

  // Suspicious protocols
  /^(javascript|data|vbscript|file|about):/i,

  // Known phishing/malware domains (add more as needed)
  /(bit\.do|tinyurl|goo\.gl|ow\.ly|bit\.ly|t\.co)\/[a-zA-Z0-9]+/i, // URL shorteners (can hide malicious links)

  // Suspicious keywords
  /(malware|virus|trojan|ransomware|phishing|scam)/i,

  // IP addresses (suspicious in many contexts)
  /^https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/,

  // Double extensions (file.pdf.exe)
  /\.[a-z]{2,4}\.(exe|bat|cmd|com|pif|scr|vbs)$/i,
];

// Allowed URL protocols
const ALLOWED_PROTOCOLS = ['http:', 'https:'];

// Maximum URL length to prevent DoS
const MAX_URL_LENGTH = 2048;

/**
 * Validates if a URL is safe
 */
export function validateUrl(urlString: string): { valid: boolean; error?: string } {
  try {
    // Check length
    if (urlString.length > MAX_URL_LENGTH) {
      return { valid: false, error: 'URL is too long' };
    }

    // Parse URL
    const url = new URL(urlString);

    // Check protocol
    if (!ALLOWED_PROTOCOLS.includes(url.protocol)) {
      return {
        valid: false,
        error: `Invalid protocol. Only HTTP and HTTPS are allowed.`,
      };
    }

    // Check for malicious patterns
    for (const pattern of MALICIOUS_PATTERNS) {
      if (pattern.test(urlString)) {
        console.warn(`[SECURITY] Malicious URL pattern detected: ${pattern}`);
        return {
          valid: false,
          error: 'URL contains suspicious content. Please use a different source.',
        };
      }
    }

    // Check for localhost/private IPs in production
    if (process.env.NODE_ENV === 'production') {
      const hostname = url.hostname.toLowerCase();
      if (
        hostname === 'localhost' ||
        hostname.startsWith('127.') ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('172.')
      ) {
        return {
          valid: false,
          error: 'Private/local URLs are not allowed.',
        };
      }
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Sanitizes user input to prevent XSS
 */
export function sanitizeInput(input: string): string {
  if (!input) return '';

  return (
    input
      // Remove HTML tags
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      // Remove dangerous characters
      .replace(/[<>]/g, '')
      // Limit length
      .slice(0, 10000)
      .trim()
  );
}

/**
 * Rate limit check for security (per IP)
 */
export interface SecurityRateLimitOptions {
  maxRequests: number; // Max requests per window
  windowMs: number; // Time window in milliseconds
  identifier: string; // User ID or IP
}

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function checkSecurityRateLimit(options: SecurityRateLimitOptions): {
  allowed: boolean;
  retryAfter?: number;
} {
  const { maxRequests, windowMs, identifier } = options;
  const now = Date.now();

  // Clean up expired entries
  const keysToDelete: string[] = [];
  rateLimitStore.forEach((value, key) => {
    if (value.resetAt < now) {
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach((key) => rateLimitStore.delete(key));

  // Get or create rate limit entry
  const entry = rateLimitStore.get(identifier);

  if (!entry) {
    // First request
    rateLimitStore.set(identifier, {
      count: 1,
      resetAt: now + windowMs,
    });
    return { allowed: true };
  }

  if (entry.resetAt < now) {
    // Window expired, reset
    entry.count = 1;
    entry.resetAt = now + windowMs;
    return { allowed: true };
  }

  if (entry.count >= maxRequests) {
    // Rate limit exceeded
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    console.warn(`[SECURITY] Rate limit exceeded for ${identifier}. Retry after ${retryAfter}s`);
    return { allowed: false, retryAfter };
  }

  // Increment count
  entry.count += 1;
  return { allowed: true };
}

/**
 * Content Security Policy headers
 */
export const CSP_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://challenges.cloudflare.com https://*.clerk.com https://clerk.pinolearn.com https://accounts.pinolearn.com https://*.posthog.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.clerk.com https://*.clerk.accounts.dev https://clerk.pinolearn.com https://accounts.pinolearn.com https://*.supabase.co https://api.openrouter.ai https://*.posthog.com https://us.i.posthog.com https://us.posthog.com https://eu.posthog.com https://app.posthog.com wss://*.supabase.co https://*.lemonsqueezy.com",
    "frame-src 'self' https://challenges.cloudflare.com https://*.clerk.com https://accounts.pinolearn.com https://www.youtube.com https://youtube.com https://www.youtube-nocookie.com https://*.lemonsqueezy.com",
    "manifest-src 'self'",
  ].join('; '),
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

/**
 * Validates PDF file upload
 */
export function validatePdfUpload(file: File): { valid: boolean; error?: string } {
  // Check file type
  if (file.type !== 'application/pdf') {
    return { valid: false, error: 'Only PDF files are allowed' };
  }

  // Check file size (5MB limit)
  const MAX_SIZE = 5 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return { valid: false, error: 'File size must be less than 5MB' };
  }

  // Check file name for suspicious patterns
  const fileName = file.name.toLowerCase();
  if (MALICIOUS_PATTERNS.some((pattern) => pattern.test(fileName))) {
    return { valid: false, error: 'Suspicious file name detected' };
  }

  return { valid: true };
}

/**
 * Detects and blocks SQL injection attempts
 */
export function detectSqlInjection(input: string): boolean {
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
    /(--|;|\/\*|\*\/|xp_|sp_|@@)/gi,
    /(\bUNION\b.*\bSELECT\b)/gi,
  ];

  return sqlPatterns.some((pattern) => pattern.test(input));
}

/**
 * Comprehensive input validation for roadmap creation
 */
export function validateRoadmapInput(input: string): { valid: boolean; error?: string } {
  // Sanitize first
  const sanitized = sanitizeInput(input);

  // Check if it's a URL
  if (sanitized.startsWith('http://') || sanitized.startsWith('https://')) {
    return validateUrl(sanitized);
  }

  // For topics, check length
  if (sanitized.length < 3) {
    return { valid: false, error: 'Input must be at least 3 characters' };
  }

  if (sanitized.length > 500) {
    return { valid: false, error: 'Input must be less than 500 characters' };
  }

  // Check for SQL injection
  if (detectSqlInjection(sanitized)) {
    console.warn('[SECURITY] SQL injection attempt detected');
    return { valid: false, error: 'Invalid input detected' };
  }

  return { valid: true };
}
