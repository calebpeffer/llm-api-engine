import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import crypto from 'crypto';

// Initialize Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

// Constants
const API_KEY_PREFIX = 'sk_';
const API_KEY_LENGTH = 24; // Length in bytes, will result in 48 hex chars
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 60; // 60 requests per minute

interface AuthResult {
  isAuthenticated: boolean;
  error?: string;
  statusCode?: number;
  metadata?: any;
}

// Generate a new API key
export function generateApiKey(): string {
  return `${API_KEY_PREFIX}${crypto.randomBytes(API_KEY_LENGTH).toString('hex')}`;
}

// Get API key from request headers
export function getApiKey(): string | null {
  const headersList = headers();
  const authHeader = headersList.get('authorization');
  
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.split(' ')[1];
}

// Check rate limit for an API key
async function checkRateLimit(apiKey: string): Promise<{ allowed: boolean; error?: string }> {
  const rateKey = `rate_limit:${apiKey}`;
  const currentTime = Date.now();
  const windowStart = currentTime - RATE_LIMIT_WINDOW;

  // Get requests in current window
  const requests = await redis.zrange(rateKey, windowStart, currentTime, {
    byScore: true
  });

  if (requests.length >= RATE_LIMIT_MAX) {
    return {
      allowed: false,
      error: 'Rate limit exceeded'
    };
  }

  // Add current request to rate limiting
  await redis.zadd(rateKey, {
    score: currentTime,
    member: currentTime.toString()
  });

  // Remove old requests and set expiry
  await redis.zremrangebyscore(rateKey, 0, windowStart);
  await redis.expire(rateKey, 60);

  return { allowed: true };
}

// Validate API key and check rate limit
export async function validateApiKey(endpoint: string): Promise<AuthResult> {
  try {
    console.log('Validating API key for endpoint:', endpoint);
    
    const apiKey = getApiKey();
    console.log('Extracted API key:', apiKey);
    
    if (!apiKey) {
      console.log('No API key found in headers');
      return {
        isAuthenticated: false,
        error: 'Missing or invalid Authorization header',
        statusCode: 401
      };
    }

    // Get endpoint data
    const storedData = await redis.get(`api/results/${endpoint}`);
    console.log('Raw stored data type:', typeof storedData);
    console.log('Raw stored data:', storedData);
    
    if (!storedData) {
      console.log('No data found for endpoint:', endpoint);
      return {
        isAuthenticated: false,
        error: 'Endpoint not found',
        statusCode: 404
      };
    }

    // Parse the data, ensuring we handle both string and object cases
    let data;
    try {
      data = typeof storedData === 'string' ? JSON.parse(storedData) : storedData;
      
      // Handle case where Redis returns an object that needs stringifying and parsing
      if (typeof data === 'object' && data !== null) {
        data = JSON.parse(JSON.stringify(data));
      }
    } catch (parseError) {
      console.error('Failed to parse stored data:', parseError);
      return {
        isAuthenticated: false,
        error: 'Invalid data format',
        statusCode: 500
      };
    }

    console.log('Parsed data:', data);
    console.log('Parsed data metadata:', {
      storedApiKey: data?.metadata?.apiKey,
      providedApiKey: apiKey,
      match: data?.metadata?.apiKey === apiKey
    });
    
    if (!data?.metadata?.apiKey || data.metadata.apiKey !== apiKey) {
      console.log('API key mismatch or missing');
      return {
        isAuthenticated: false,
        error: 'Invalid API key',
        statusCode: 401
      };
    }

    // Check rate limit
    const rateLimitResult = await checkRateLimit(apiKey);
    if (!rateLimitResult.allowed) {
      return {
        isAuthenticated: false,
        error: rateLimitResult.error,
        statusCode: 429
      };
    }

    return {
      isAuthenticated: true,
      metadata: data.metadata
    };
  } catch (error) {
    console.error('Detailed auth error:', error);
    return {
      isAuthenticated: false,
      error: 'Authentication failed',
      statusCode: 500
    };
  }
}

// Middleware to validate API key
export async function withApiKeyAuth(handler: Function) {
  return async (req: Request, ...args: any[]) => {
    // Extract endpoint from URL path
    const path = new URL(req.url).pathname;
    const endpoint = path.split('/').pop() || '';

    const authResult = await validateApiKey(endpoint);
    if (!authResult.isAuthenticated) {
      return createErrorResponse(authResult.error || 'Authentication failed', authResult.statusCode || 401);
    }

    return handler(req, ...args);
  };
}

export function createErrorResponse(error: string, status: number): NextResponse {
  return NextResponse.json({
    success: false,
    error
  }, { status });
} 