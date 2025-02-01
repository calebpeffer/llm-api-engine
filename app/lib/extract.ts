import FirecrawlApp from "@mendable/firecrawl-js";
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

interface ExtractionResult {
  success: boolean;
  data?: any;
  error?: string;
}

interface StoredData {
  data: Record<string, any>;
  metadata: {
    apiKey?: string;
    firecrawlApiKey?: string;
    query?: string;
    schema?: any;
    sources?: string[];
    lastUpdated?: string;
    createdAt?: string;
    lastUpdateAttempt?: string | null;
    lastSuccessfulUpdate?: string | null;
    updateStatus?: string;
    updateFrequency?: string;
    lastError?: string;
  };
}

export async function extractAndUpdateData(
  endpoint: string,
  query: string,
  schema: any,
  sources: string[],
  firecrawlApiKey: string
): Promise<ExtractionResult> {
  try {
    console.log(`Starting extraction for endpoint: ${endpoint}`, {
      query,
      schema,
      sources
    });
    
    // Initialize Firecrawl
    console.log('Initializing Firecrawl with key:', firecrawlApiKey.substring(0, 10) + '...');
    
    if (!firecrawlApiKey) {
      throw new Error('Firecrawl API key is required');
    }
    
    const firecrawl = new FirecrawlApp({
      apiKey: firecrawlApiKey
    });

    // Format schema
    if (!schema || !schema.properties) {
      throw new Error('Invalid schema format');
    }
    
    const formattedSchema = {
      type: 'object',
      properties: schema.properties,
      required: schema.required || Object.keys(schema.properties)
    };

    // Validate sources
    if (!sources || !Array.isArray(sources) || sources.length === 0) {
      throw new Error('At least one source URL is required');
    }

    // Extract data
    console.log('Calling Firecrawl with:', {
      sources,
      prompt: query,
      schema: formattedSchema
    });

    const result = await firecrawl.extract(sources, {
      prompt: query,
      schema: formattedSchema
    });

    console.log('Firecrawl response:', result);

    if ('error' in result && result.error) {
      throw new Error(result.error);
    }

    if (!('data' in result)) {
      throw new Error('Invalid response format from Firecrawl API');
    }

    // Get current stored data
    const storedData = await redis.get(`api/results/${endpoint}`) as StoredData;
    if (!storedData) {
      throw new Error('Endpoint data not found');
    }

    console.log('Raw stored data from Redis:', storedData);
    
    // No need to parse, Redis client already returns an object
    console.log('Stored metadata:', storedData.metadata);
    
    // Update the stored data with new extraction results
    const now = new Date().toISOString();
    const updatedData: StoredData = {
      data: result.data,
      metadata: {
        ...storedData.metadata,  // Keep ALL existing metadata
        // Only update the fields that should change
        lastUpdated: now,
        lastUpdateAttempt: now,
        lastSuccessfulUpdate: now,
        updateStatus: 'success'
      }
    };

    console.log('Storing updated data:', JSON.stringify(updatedData, null, 2));
    await redis.set(`api/results/${endpoint}`, updatedData);  // Redis client will handle JSON conversion

    return {
      success: true,
      data: result.data
    };
  } catch (error) {
    console.error('Extraction error:', error);

    // Update status in Redis if possible
    try {
      const storedData = await redis.get(`api/results/${endpoint}`) as StoredData;
      if (storedData) {
        const updatedData: StoredData = {
          data: storedData.data || {},
          metadata: {
            ...storedData.metadata,  // Keep ALL existing metadata
            // Only update status fields
            lastUpdateAttempt: new Date().toISOString(),
            updateStatus: 'failed',
            lastError: error instanceof Error ? error.message : 'Unknown error'
          }
        };

        console.log('Storing error status:', JSON.stringify(updatedData, null, 2));
        await redis.set(`api/results/${endpoint}`, updatedData);  // Redis client will handle JSON conversion
      }
    } catch (redisError) {
      console.error('Failed to update error status:', redisError);
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to extract data'
    };
  }
} 