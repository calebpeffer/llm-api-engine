import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { validateApiKey, createErrorResponse } from '@/app/lib/auth';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

const MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const MAX_INIT_WAIT = 30000; // 30 seconds maximum wait for initialization

async function waitForInitialization(endpoint: string): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < MAX_INIT_WAIT) {
    const data = await redis.get(endpoint);
    if (!data) return false;
    
    const parsed = JSON.parse(typeof data === 'string' ? data : '{}');
    if (parsed.metadata?.updateStatus !== 'initializing') {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms before checking again
  }
  return false;
}

export async function GET(req: Request, { params }: { params: { endpoint: string } }) {
  try {
    if (!params?.endpoint) {
      return createErrorResponse('Endpoint parameter is required', 400);
    }

    // Validate API key and check rate limit
    const authResult = await validateApiKey(params.endpoint);
    if (!authResult.isAuthenticated) {
      return createErrorResponse(authResult.error || 'Authentication failed', authResult.statusCode || 401);
    }

    const endpoint = `api/results/${params.endpoint}`;
    console.log('Fetching results for endpoint:', endpoint);

    // Get the URL parameters
    const url = new URL(req.url);
    const includeSchema = url.searchParams.get('schema') === 'true';

    // Get cached results
    const results = await redis.get(endpoint);
    if (!results) {
      return createErrorResponse('No results found for this endpoint', 404);
    }

    // Parse the stored results
    let storedData;
    try {
      storedData = typeof results === 'string' ? JSON.parse(results) : results;
    } catch (parseError) {
      console.error('Failed to parse stored data:', parseError);
      return createErrorResponse('Invalid data format in storage', 500);
    }

    // If the endpoint is initializing, wait for it to complete
    if (storedData.metadata?.updateStatus === 'initializing') {
      const initialized = await waitForInitialization(endpoint);
      if (initialized) {
        // Refresh the data after initialization
        const updatedResults = await redis.get(endpoint);
        if (updatedResults) {
          storedData = JSON.parse(typeof updatedResults === 'string' ? updatedResults : '{}');
        }
      } else {
        return createErrorResponse('Endpoint initialization timed out', 504);
      }
    }

    // Check data freshness
    const lastUpdated = new Date(storedData.metadata?.lastUpdated).getTime();
    const age = Date.now() - lastUpdated;
    const isFresh = age < MAX_AGE;

    // Return different response based on schema parameter
    const response: any = {
      success: true,
      data: includeSchema ? storedData : storedData.data,
      lastUpdated: storedData.metadata?.lastUpdated,
      sources: storedData.metadata?.sources,
      isFresh,
      age: Math.round(age / 1000), // age in seconds
      updateStatus: storedData.metadata?.updateStatus
    };

    // Add warning if data is stale
    if (!isFresh) {
      response.warning = 'Data is older than 24 hours';
    }

    // Add error if last update failed
    if (storedData.metadata?.updateStatus === 'failed') {
      response.error = storedData.metadata?.lastError;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error:', error);
    return createErrorResponse('Failed to fetch results', 500);
  }
}
