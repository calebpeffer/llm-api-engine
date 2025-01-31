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

    // Detailed request logging
    console.log('Full request body:', JSON.stringify({
      urls,
      prompt,
      schema,
      hasApiKey: !!firecrawlApiKey // Don't log the actual key
    }, null, 2));

    // Validate inputs
    // Validate required fields and ensure urls is an array
    console.log('Validating request parameters:', {
      hasUrls: !!urls,
      isUrlsArray: Array.isArray(urls), 
      hasPrompt: !!prompt,
      hasSchema: !!schema,
      hasApiKey: !!firecrawlApiKey
    });

    if (!urls || !Array.isArray(urls) || !prompt || !schema) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid request parameters: missing urls, prompt, or schema' 
      }, { status: 400 });
    }

    if (!firecrawlApiKey) {
      return NextResponse.json({ 
        success: false, 
        error: 'Firecrawl API key is required' 
      }, { status: 400 });
    }

    // Initialize Firecrawl with provided API key
    const firecrawl = new FirecrawlApp({
      apiKey: firecrawlApiKey
    });

    // Validate schema format
    if (!isValidJsonSchema(schema)) {
      console.log('Invalid schema format:', JSON.stringify(schema, null, 2));
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

    // Log full extraction inputs
    console.log('Full extraction inputs:', JSON.stringify({
      urls,
      prompt,
      schema: formattedSchema
    }, null, 2));

    // Call Firecrawl API with the formatted schema
    try {
      const result = await firecrawl.extract(urls, {
        prompt,
        schema: formattedSchema
      });

      console.log('Firecrawl API response:', JSON.stringify(result, null, 2));

      // Only throw if there's an explicit error
      if ('error' in result && result.error) {
        throw new Error(result.error);
      }

      // If we have data, consider it a success even if some fields are empty
      if ('data' in result) {
        return NextResponse.json({ 
          success: true, 
          data: result.data 
        });
      }

      // If we have neither error nor data, something went wrong
      throw new Error('Invalid response format from Firecrawl API');
    } catch (extractError) {
      console.error('Firecrawl extraction error:', {
        error: extractError,
        message: extractError instanceof Error ? extractError.message : 'Unknown error',
        stack: extractError instanceof Error ? extractError.stack : undefined,
        fullError: JSON.stringify(extractError, null, 2)
      });
      throw extractError; // Re-throw to be caught by outer catch
    }
  } catch (error) {
    console.error('Full error details:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      fullError: JSON.stringify(error, null, 2)
    });
    
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to extract data',
      details: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error
    }, { status: 500 });
  }
}
