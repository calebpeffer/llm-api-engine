import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { z } from 'zod';
import crypto from 'crypto';
import { generateApiKey } from '@/app/lib/auth';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

// Encryption helpers
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
  // Ensure key is exactly 32 bytes by hashing it
  return crypto.createHash('sha256').update(key).digest();
}

const IV_LENGTH = 16;

function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', getEncryptionKey(), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(text: string): string {
  const [ivHex, encryptedHex] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', getEncryptionKey(), iv);
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

// Updated validation schema to include new fields
const deployRequestSchema = z.object({
  key: z.string().min(1, "Key is required"),
  data: z.object({
    data: z.record(z.any()),
    metadata: z.object({
      query: z.string(),
      schema: z.object({
        type: z.string(),
        properties: z.record(z.any()),
        required: z.array(z.string()).optional()
      }),
      sources: z.array(z.string()),
      lastUpdated: z.string().optional(),
      // New fields
      firecrawlApiKey: z.string().min(1, "Firecrawl API key is required"),
      updateFrequency: z.string().regex(/^(\*|[0-9]+|\*\/[0-9]+)\s+(\*|[0-9]+|\*\/[0-9]+)\s+(\*|[0-9]+|\*\/[0-9]+)\s+(\*|[0-9]+|\*\/[0-9]+)\s+(\*|[0-9]+|\*\/[0-9]+)$/, 
        "Invalid cron expression")
    })
  }),
  route: z.string().min(1, "Route is required")
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log('Received request body:', body);

    const validatedData = deployRequestSchema.parse(body);
    const { key, data, route } = validatedData;

    // Clean the route string
    const cleanRoute = route
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .trim();
    console.log('Cleaned route:', cleanRoute);

    // Check if route already exists
    const existingRoute = await redis.get(`api/results/${cleanRoute}`);
    if (existingRoute) {
      console.log('Route already exists:', cleanRoute);
      return NextResponse.json({
        success: false,
        error: 'Route already exists'
      }, { status: 409 });
    }

    // Generate API key and encrypt sensitive data
    const apiKey = generateApiKey();
    console.log('Generated API key:', apiKey);
    
    const encryptedFirecrawlKey = encrypt(data.metadata.firecrawlApiKey);
    console.log('Encrypted Firecrawl key:', encryptedFirecrawlKey);
    
    // Prepare data for storage
    const now = new Date().toISOString();
    const storageData = {
      ...data,
      metadata: {
        ...data.metadata,
        firecrawlApiKey: encryptedFirecrawlKey,
        apiKey: apiKey,
        lastUpdated: now,
        createdAt: now,
        lastUpdateAttempt: null,
        lastSuccessfulUpdate: null,
        updateStatus: 'pending'
      }
    };
    console.log('Data to be stored:', JSON.stringify(storageData, null, 2));

    // Store the data in Redis
    await redis.set(`api/results/${cleanRoute}`, JSON.stringify(storageData));
    
    // Verify storage
    const storedData = await redis.get(`api/results/${cleanRoute}`);
    console.log('Verification - data stored in Redis:', storedData);

    const apiRoute = process.env.API_ROUTE || 'http://localhost:3000';
    const fullUrl = `${apiRoute}/api/results/${cleanRoute}`;

    return NextResponse.json({
      success: true,
      message: 'API endpoint deployed successfully',
      route: cleanRoute,
      url: fullUrl,
      apiKey: apiKey,
      curlCommand: `curl -X GET "${fullUrl}" \\\n  -H "Authorization: Bearer ${apiKey}" \\\n  -H "Content-Type: application/json"`
    });
  } catch (error) {
    console.error('Deployment error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Validation error',
        details: error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      }, { status: 400 });
    }

    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}
