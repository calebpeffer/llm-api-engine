import { Redis } from '@upstash/redis';
import cronParser from 'cron-parser';
import { extractAndUpdateData } from './extract';
import { decrypt } from '@/app/lib/crypto';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

// Store scheduled jobs in memory (will reset on server restart)
const scheduledJobs = new Map<string, NodeJS.Timeout>();

interface EndpointConfig {
  endpoint: string;
  query: string;
  schema: any;
  sources: string[];
  firecrawlApiKey: string;
  updateFrequency: string;
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

export async function scheduleEndpoint(endpoint: string): Promise<boolean> {
  try {
    console.log(`Scheduling updates for endpoint: ${endpoint}`);
    
    // Get endpoint data
    const storedData = await redis.get(`api/results/${endpoint}`) as StoredData;
    if (!storedData) {
      console.error(`No data found for endpoint: ${endpoint}`);
      return false;
    }

    console.log('Stored data for scheduling:', storedData);
    const metadata = storedData.metadata;

    // Validate required metadata fields
    const requiredFields = ['query', 'schema', 'sources', 'updateFrequency', 'firecrawlApiKey'] as const;
    const missingFields = requiredFields.filter(field => !metadata[field]);
    
    if (missingFields.length > 0) {
      console.error(`Missing required metadata fields for endpoint ${endpoint}:`, missingFields);
      return false;
    }

    // Type assertion since we've validated the fields exist
    const query = metadata.query as string;
    const schema = metadata.schema;
    const sources = metadata.sources as string[];
    const updateFrequency = metadata.updateFrequency as string;
    const firecrawlApiKey = metadata.firecrawlApiKey as string;

    // Decrypt Firecrawl API key
    const decryptedKey = decrypt(firecrawlApiKey);

    // Parse cron expression
    const interval = cronParser.parseExpression(updateFrequency);
    const nextRun = interval.next().getTime();
    const now = Date.now();
    const delay = nextRun - now;

    // Clear existing job if any
    if (scheduledJobs.has(endpoint)) {
      clearTimeout(scheduledJobs.get(endpoint));
      scheduledJobs.delete(endpoint);
    }

    // Schedule next update
    const config: EndpointConfig = {
      endpoint,
      query,
      schema,
      sources,
      firecrawlApiKey: decryptedKey,
      updateFrequency
    };

    const timeoutId = setTimeout(() => runUpdate(config), delay);
    scheduledJobs.set(endpoint, timeoutId);

    console.log(`Scheduled next update for ${endpoint} in ${Math.round(delay / 1000)} seconds`);
    return true;
  } catch (error) {
    console.error(`Failed to schedule endpoint ${endpoint}:`, error);
    return false;
  }
}

async function runUpdate(config: EndpointConfig): Promise<void> {
  try {
    console.log(`Running scheduled update for endpoint: ${config.endpoint}`);
    
    // Perform extraction
    await extractAndUpdateData(
      config.endpoint,
      config.query,
      config.schema,
      config.sources,
      config.firecrawlApiKey
    );

    // Schedule next update
    await scheduleEndpoint(config.endpoint);
  } catch (error) {
    console.error(`Update failed for endpoint ${config.endpoint}:`, error);
    // Still try to schedule next update even if this one failed
    await scheduleEndpoint(config.endpoint);
  }
}

// Function to initialize scheduling for all existing endpoints
export async function initializeScheduler(): Promise<void> {
  try {
    console.log('Initializing scheduler for all endpoints...');
    
    // Get all endpoint keys from Redis
    const keys = await redis.keys('api/results/*');
    
    // Schedule each endpoint
    for (const key of keys) {
      const endpoint = key.replace('api/results/', '');
      await scheduleEndpoint(endpoint);
    }
    
    console.log(`Initialized scheduler for ${keys.length} endpoints`);
  } catch (error) {
    console.error('Failed to initialize scheduler:', error);
  }
} 