import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { z } from 'zod';
import { generateApiKey } from '@/app/lib/auth';
import { extractAndUpdateData } from '@/app/lib/extract';
import { encrypt } from '@/app/lib/crypto';
import { scheduleEndpoint } from '@/app/lib/scheduler';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

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
    
    // Prepare initial data for storage
    const now = new Date().toISOString();
    const initialData = {
      data: {},  // Empty data initially
      metadata: {
        query: data.metadata.query,
        schema: data.metadata.schema,
        sources: data.metadata.sources,
        updateFrequency: data.metadata.updateFrequency,
        firecrawlApiKey: encryptedFirecrawlKey,
        apiKey: apiKey,
        lastUpdated: now,
        createdAt: now,
        lastUpdateAttempt: null,
        lastSuccessfulUpdate: null,
        updateStatus: 'initializing'
      }
    };

    // Store initial data
    await redis.set(`api/results/${cleanRoute}`, JSON.stringify(initialData));
    
    // Perform initial extraction
    console.log('Starting initial extraction with:', {
      endpoint: cleanRoute,
      query: data.metadata.query,
      schema: data.metadata.schema,
      sources: data.metadata.sources
    });
    
    const extractionResult = await extractAndUpdateData(
      cleanRoute,
      data.metadata.query,
      data.metadata.schema,
      data.metadata.sources,
      data.metadata.firecrawlApiKey
    );

    console.log('Extraction result:', extractionResult);

    if (!extractionResult.success) {
      console.error('Initial extraction failed:', extractionResult.error);
    } else {
      // Schedule updates only if initial extraction succeeded
      console.log('Initial extraction succeeded, scheduling updates');
      const scheduled = await scheduleEndpoint(cleanRoute);
      console.log(`Scheduling status for ${cleanRoute}:`, scheduled ? 'success' : 'failed');
    }

    const apiRoute = process.env.API_ROUTE || 'http://localhost:3000';
    const fullUrl = `${apiRoute}/api/results/${cleanRoute}`;

    return NextResponse.json({
      success: true,
      message: 'API endpoint deployed successfully',
      route: cleanRoute,
      url: fullUrl,
      apiKey: apiKey,
      extractionStatus: extractionResult.success ? 'success' : 'failed',
      extractionError: extractionResult.error,
      updateScheduled: extractionResult.success,
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
