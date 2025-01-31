import { NextResponse } from 'next/server';
import FirecrawlApp from "@mendable/firecrawl-js";

// Validate JSON Schema format
function isValidJsonSchema(schema: any): boolean {
  return (
    typeof schema === 'object' &&
    schema !== null &&
    schema.type === 'object' &&
    typeof schema.properties === 'object' &&
    Object.keys(schema.properties).length > 0
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { urls, prompt, schema, firecrawlApiKey } = body;

    // Debug logging
    console.log('Received schema:', JSON.stringify(schema, null, 2));

    // Validate inputs
    if (!urls || !Array.isArray(urls) || !prompt || !schema || !firecrawlApiKey) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid request parameters' 
      }, { status: 400 });
    }

    // Initialize Firecrawl with provided API key
    const firecrawl = new FirecrawlApp({
      apiKey: firecrawlApiKey
    });

    // Validate schema format
    if (!isValidJsonSchema(schema)) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid JSON schema format. Schema must be an object with "type" and "properties".' 
      }, { status: 400 });
    }

    // Ensure schema matches expected format
    const formattedSchema = {
      type: 'object',
      properties: schema.properties,
      required: schema.required || Object.keys(schema.properties)
    };

    // Call Firecrawl API with the formatted schema
    const result = await firecrawl.extract(urls, {
      prompt,
      schema: formattedSchema
    });

    if ('error' in result) {
      throw new Error(result.error);
    }

    return NextResponse.json({ 
      success: true, 
      data: result.data 
    });
  } catch (error) {
    console.error('Extraction error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to extract data' 
    }, { status: 500 });
  }
}
