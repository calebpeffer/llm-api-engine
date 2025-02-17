'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { classNames } from '@/utils';
// import { CronScheduler } from '@/components/CronScheduler';  // Temporarily disabled
import { z } from "zod";
import { toast } from 'react-hot-toast';
import { ClipboardIcon } from '@heroicons/react/24/outline';
import { v4 as uuidv4 } from 'uuid';

// Types
interface Route {
  route: string;
  created: string;
}

interface RouteConfig {
  urls: string[];
  schema: string;
  prompt: string;
  searchQuery?: string;
  updatedAt: string;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  favicon?: string;
  selected: boolean;
}

interface JsonSchemaProperty {
  type: string;
  description?: string;
}

interface JsonSchema {
  type: string;
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
}

interface ScrapeResult {
  success: boolean;
  data?: any;
  error?: unknown;
}

// Constants
const EXAMPLE_QUERY = "Extract company details from websites";

// Utility functions
const getApiUrl = (path: string) => {
  const apiRoute = process.env.NEXT_PUBLIC_API_ROUTE || 'http://localhost:3000';
  return `${apiRoute}${path}`;
};

const isValidJson = (json: string) => {
  try {
    JSON.parse(json);
    return true;
  } catch (e) {
    return false;
  }
};

const RouteInput = ({ value, onChange, warning }: { value: string; onChange: (value: string) => void; warning: string | null }) => (
  <div className="relative">
    <div className="flex items-center space-x-2">
      <div className="text-white/60">/api/</div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter your API route"
        className="flex-1 bg-white/5 text-white rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
    </div>
    {warning && (
      <div className="mt-2 text-amber-400 text-sm">
        {warning}
      </div>
    )}
  </div>
);

export default function Home() {
  // UI State
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [firecrawlApiKey, setFirecrawlApiKey] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [showApiKeys, setShowApiKeys] = useState<{[key: string]: boolean}>({
    firecrawl: false,
    openai: false
  });

  // Transition state
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionMessage, setTransitionMessage] = useState('');

  // Step State
  const [step, setStep] = useState<'initial' | 'query' | 'schema' | 'sources' | 'extract' | 'deploy'>('initial');
  const [currentStep, setCurrentStep] = useState(1);

  // Data State
  const [query, setQuery] = useState('');
  const [schemaStr, setSchemaStr] = useState('');
  const [proposedSearchQuery, setProposedSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [extractedData, setExtractedData] = useState<any>(null);
  const [routeInput, setRouteInput] = useState('');
  const [deployedRoute, setDeployedRoute] = useState('');
  const [isRouteAvailable, setIsRouteAvailable] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [isDeployed, setIsDeployed] = useState(false);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  // const [showSettings, setShowSettings] = useState(false);  // Temporarily disabled
  // const [cronSchedule, setCronSchedule] = useState('0 5 * * *');  // Temporarily disabled
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Steps configuration
  const steps = [
    { number: 1, title: 'Describe Your API', description: 'Tell us what data you want to extract' },
    { number: 2, title: 'Generate Schema', description: 'Create the data structure' },
    { number: 3, title: 'Configure Sources', description: 'Select data sources' },
    { number: 4, title: 'Extract Data', description: 'Get your data' },
    { number: 5, title: 'Deploy API', description: 'Get your API endpoint' }
  ];

  const getStepFromState = (state: 'initial' | 'query' | 'schema' | 'sources' | 'extract' | 'deploy') => {
    switch (state) {
      case 'initial': return 1;
      case 'query': return 2;
      case 'schema': return 3;
      case 'sources': return 4;
      case 'extract': return 5;
      case 'deploy': return 6;
      default: return 1;
    }
  };

  useEffect(() => {
    setCurrentStep(getStepFromState(step));
  }, [step]);

  // Load saved configurations
  const loadConfigs = async () => {
    try {
      const response = await fetch(getApiUrl('/api/configs'));
      const data = await response.json();
      if (data.success) {
        setRoutes(data.configs);
      }
    } catch (error) {
      console.error('Error loading configs:', error);
    }
  };

  // Save current configuration
  const saveConfig = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(getApiUrl('/api/configs'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: deployedRoute || 'Untitled Configuration',
          query,
          schema: schemaStr,
        })
      });

      const data = await response.json();
      if (data.success) {
        setError(null);
      } else {
        setError(data.error || 'Failed to save configuration');
      }
    } catch (error) {
      console.error('Error saving config:', error);
      setError(error instanceof Error ? error.message : 'Failed to save configuration');
    } finally {
      setLoading(false);
    }
  };

  // Load configs on mount
  useEffect(() => {
    loadConfigs();
  }, []);

  // Update current step when step changes
  useEffect(() => {
    setCurrentStep(getStepFromState(step));
  }, [step]);

  // Handle route management
  const handleUpdateRoute = async (endpoint: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(getApiUrl(`/api/routes/${endpoint}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls: searchResults.filter(r => r.selected).map(r => r.url),
          schema: schemaStr,
          prompt: query,
          searchQuery: proposedSearchQuery,
          updatedAt: new Date().toISOString()
        })
      });

      const data = await response.json();
      if (data.success) {
        await fetchRoutes(); // Refresh routes after update
        setError(null);
      } else {
        setError(data.error || 'Failed to update route');
      }
    } catch (error) {
      console.error('Error updating route:', error);
      setError(error instanceof Error ? error.message : 'Failed to update route');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRoute = async (endpoint: string) => {
    if (!confirm('Are you sure you want to delete this API route?')) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(getApiUrl(`/api/routes/${endpoint}`), {
        method: 'DELETE'
      });

      const data = await response.json();
      if (data.success) {
        await fetchRoutes(); // Refresh routes after delete
        setError(null);
      } else {
        setError(data.error || 'Failed to delete route');
      }
    } catch (error) {
      console.error('Error deleting route:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete route');
    } finally {
      setLoading(false);
    }
  };

  // Fetch routes on mount
  useEffect(() => {
    fetchRoutes();
  }, []);

  const fetchRoutes = async () => {
    try {
      const response = await fetch(getApiUrl('/api/routes'));
      const data = await response.json();
      if (data.success) {
        setRoutes(data.routes);
      }
    } catch (e) {
      console.error('Failed to fetch routes:', e);
    }
  };

  // Handle step submissions
  const handleQuerySubmit = async () => {
    if (!query || loading || !firecrawlApiKey) return;

    setLoading(true);
    setStep('schema');
    setCurrentStep(3);

    // Call API to generate schema with API key
    fetch('/api/generate-schema', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, firecrawlApiKey }),
    })
      .then(res => res.json())
      .then(data => {
        setSchemaStr(JSON.stringify(data.schema, null, 2));
      })
      .catch(error => {
        console.error('Error generating schema:', error);
        setError('Failed to generate schema. Please try again.');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const handleExtractData = async () => {
    if (!searchResults.some(r => r.selected)) {
      setError('Please select at least one source');
      return;
    }

    setLoading(true);
    setError(null);
    setIsTransitioning(true);
    setTransitionMessage('Extracting data from sources...');

    try {
      const selectedUrls = searchResults.filter(r => r.selected).map(r => r.url);
      const schemaRequest = JSON.parse(schemaStr);

      // Validate schema format
      if (!schemaRequest.type || !schemaRequest.properties) {
        throw new Error('Invalid schema format. Schema must include "type" and "properties".');
      }

      // Ensure schema is in correct format
      const formattedSchema = {
        type: 'object',
        properties: schemaRequest.properties,
        required: schemaRequest.required || Object.keys(schemaRequest.properties)
      };

      // Log the request for debugging
      console.log('Sending extraction request:', {
        urls: selectedUrls,
        prompt: query,
        schema: formattedSchema,
        hasApiKey: !!firecrawlApiKey
      });

      // Call our secure API endpoint with firecrawlApiKey
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          urls: selectedUrls,
          prompt: query,
          schema: formattedSchema,
          firecrawlApiKey
        }),
      });

      const result = await response.json();

      // Log the full response for debugging
      console.log('Full API response:', result);

      if (!response.ok) {
        let errorMessage = 'Failed to extract data';
        
        // Try to get detailed error information
        if (result.error) {
          errorMessage = result.error;
        }
        
        // If we have additional details, add them
        if (result.details) {
          console.error('Error details:', result.details);
          if (typeof result.details === 'object') {
            errorMessage += '\n\nDetails: ' + JSON.stringify(result.details, null, 2);
          } else {
            errorMessage += '\n\nDetails: ' + String(result.details);
          }
        }
        
        throw new Error(errorMessage);
      }

      // Check if we have data in the response
      if (result.success && result.data) {
        setExtractedData(result.data);
        setStep('extract');
        setCurrentStep(5);
      } else {
        throw new Error('No data returned from extraction');
      }
    } catch (error) {
      console.error('Full extraction error:', error);
      let errorMessage: string;
      
      if (error && typeof error === 'object' && 'message' in error) {
        errorMessage = (error as { message: string }).message;
      } else if (error && typeof error === 'object') {
        try {
          errorMessage = JSON.stringify(error, null, 2);
        } catch {
          errorMessage = 'Unknown error occurred';
        }
      } else {
        errorMessage = String(error);
      }
      setError(`Extraction failed: ${errorMessage}`);
    } finally {
      setLoading(false);
      setIsTransitioning(false);
    }
  };

  const handleExtract = async () => {
    if (!extractedData) {
      setError('No data to extract');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(getApiUrl('/api/results/' + deployedRoute), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: extractedData
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save extracted data');
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to save extracted data');
      }

      setShowSuccess(true);
    } catch (error) {
      console.error('Error:', error);
      setError(error instanceof Error ? error.message : 'Failed to save extracted data');
    } finally {
      setLoading(false);
    }
  };

  const handleSchemaSubmit = async () => {
    if (!schemaStr || loading) return;

    setLoading(true);
    setError(null);
    setIsTransitioning(true);
    setTransitionMessage('Validating schema...');

    try {
      const parsedSchema = JSON.parse(schemaStr);

      // Use the original query for now
      setProposedSearchQuery(query);
      setStep('sources');
      setCurrentStep(4);
    } catch (error) {
      console.error('Error:', error);
      if (error instanceof SyntaxError) {
        setError('Invalid JSON schema. Please check the format.');
      } else {
        setError(error instanceof Error ? error.message : 'Failed to process schema');
      }
    } finally {
      setLoading(false);
      setIsTransitioning(false);
    }
  };

  const handleNewSearch = async () => {
    setLoading(true);
    setError(null);

    try {
      // Call Serper API
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: proposedSearchQuery }),
      });

      if (!response.ok) {
        throw new Error('Search request failed');
      }

      const data = await response.json();

      if (data.organic && data.organic.length > 0) {
        setSearchResults(data.organic.map((r: any, index: number) => ({
          title: r.title,
          url: r.link,
          snippet: r.snippet,
          favicon: `https://www.google.com/s2/favicons?domain=${new URL(r.link).hostname}`,
          selected: index === 0
        })));
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSourcesSubmit = async () => {
    if (!searchResults.some(r => r.selected)) {
      setError('Please select at least one source');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await handleExtractData();
    } catch (error) {
      console.error('Error:', error);
      setError('Failed to extract data from sources');
    } finally {
      setLoading(false);
      setIsTransitioning(false);
    }
  };

  const toggleResult = (index: number) => {
    setSearchResults(prev =>
      prev.map((result, i) =>
        i === index ? { ...result, selected: !result.selected } : result
      )
    );
  };

  // Add type for mock response
  type MockResponse = {
    success: boolean;
    data?: {
      stockPrice: number;
      volume: number;
      marketCap: number;
      lastUpdated: string;
      source: string;
      metadata: {
        exchange: string;
        symbol: string;
        currency: string;
      };
    };
    error?: string;
  };

  const handleContinue = async () => {
    if (loading) return;

    switch (step) {
      case 'initial':
        setStep('query');
        break;
      case 'query':
        await handleQuerySubmit();
        break;
      case 'schema':
        await handleSchemaSubmit();
        break;
      case 'sources':
        await handleExtractData();
        break;
      case 'extract':
        await handleExtract();
        break;
      case 'deploy':
        await handleDeploy();
        break;
    }
  };

  useEffect(() => {
    if (step === 'sources' && searchResults.length === 0 && query) {
      handleNewSearch();
    }
  }, [step]);

  useEffect(() => {
    if (step === 'sources') {
      handleSearch();
    }
  }, [step]);

  const handleSearch = async () => {
    setIsSearching(true);
    setSearchResults([]);
    setIsTransitioning(true);
    setTransitionMessage('Searching for relevant sources...');

    try {
      // Call Serper API
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: proposedSearchQuery || query }),
      });

      if (!response.ok) {
        throw new Error('Search request failed');
      }

      const data = await response.json();

      if (data.organic && data.organic.length > 0) {
        setSearchResults(data.organic.map((r: any, index: number) => ({
          title: r.title,
          url: r.link,
          snippet: r.snippet,
          favicon: `https://www.google.com/s2/favicons?domain=${new URL(r.link).hostname}`,
          selected: index === 0
        })));
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsSearching(false);
      setIsTransitioning(false);
    }
  };

  // Loading spinner component
  const LoadingSpinner = ({ message }: { message: string }) => (
    <div className="flex flex-col items-center justify-center space-y-4 p-12">
      <div className="relative">
        <div className="w-12 h-12 border-4 border-white/10 rounded-full animate-spin"></div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-t-emerald-500 border-r-emerald-500 border-b-transparent border-l-transparent rounded-full animate-spin"></div>
        </div>
      </div>
      <p className="text-white/60 text-sm">{message}</p>
    </div>
  );

  const getStepStatus = (stepId: number) => {
    if (currentStep === stepId) {
      return 'current';
    }

    return currentStep > stepId ? 'complete' : 'upcoming';
  };

  const checkRouteExists = async (route: string) => {
    try {
      const response = await fetch('/api/routes');
      const data = await response.json();
      if (data.success && data.routes) {
        return data.routes.some((r: any) => r.route === route);
      }
    } catch (e) {
      console.error('Failed to check routes:', e);
    }
    return false;
  };

  // Check if route exists when route input changes
  useEffect(() => {
    const checkRoute = async () => {
      if (!routeInput) {
        setWarning(null);
        return;
      }
      const exists = await checkRouteExists(routeInput);
      if (exists) {
        setWarning('This route already exists and will be overwritten.');
      } else {
        setWarning(null);
      }
    };

    checkRoute();
  }, [routeInput]);

  // Reset deployment state when going back
  useEffect(() => {
    if (step !== 'deploy') {
      setIsDeployed(false);
      setWarning(null);
    }
  }, [step]);

  const handleDeploy = async () => {
    if (!extractedData || loading) return;

    setLoading(true);
    setError(null);
    setIsTransitioning(true);
    setTransitionMessage('Deploying your API...');

    try {
      // Clean the route string and prefix with UUID
      const cleanRoute = routeInput
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .trim();
      
      // Generate UUID prefix for the route
      const uniquePrefix = uuidv4().split('-')[0]; // Use first segment of UUID for brevity
      const uniqueRoute = `${uniquePrefix}-${cleanRoute}`;

      // Format the request body according to our backend API schema
      const requestBody = {
        key: 'test-scheduler',
        data: {
          data: {},
          metadata: {
            query: query,
            schema: JSON.parse(schemaStr),
            sources: searchResults.filter(r => r.selected).map(r => r.url),
            updateFrequency: '*/1 * * * *',
            firecrawlApiKey: firecrawlApiKey
          }
        },
        route: uniqueRoute
      };

      const response = await fetch('/api/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to deploy API');
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to deploy API');
      }

      // Store the API key from the response
      setApiKey(data.apiKey);
      setDeployedRoute(`/api/results/${uniqueRoute}`);
      setIsDeployed(true);
      setStep('deploy');
      setCurrentStep(5);
    } catch (error) {
      console.error('Error:', error);
      setError(error instanceof Error ? error.message : 'Failed to deploy API');
    } finally {
      setLoading(false);
      setIsTransitioning(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800">
      {/* Full-screen loading transition */}
      {isTransitioning && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <LoadingSpinner message={transitionMessage} />
        </div>
      )}

      {/* Progress Steps */}
      {step !== 'initial' && (
        <div className="sticky top-0 z-50 w-full py-6 bg-gray-900/80 backdrop-blur-xl border-b border-white/10">
          <div className="max-w-5xl mx-auto px-6">
            <nav aria-label="Progress">
              <ol role="list" className="flex items-center justify-between">
                {steps.map((stepItem, stepIdx) => (
                  <li key={stepItem.number} className="relative">
                    <div className="flex flex-col items-center">
                      {getStepStatus(stepItem.number) === 'complete' ? (
                        <div className="h-8 w-8 rounded-full bg-emerald-500 flex items-center justify-center">
                          <CheckIcon className="w-5 h-5 text-white" aria-hidden="true" />
                        </div>
                      ) : getStepStatus(stepItem.number) === 'current' ? (
                        <div className="h-8 w-8 rounded-full border-2 border-emerald-500 bg-gray-900 flex items-center justify-center">
                          <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                        </div>
                      ) : (
                        <div className="h-8 w-8 rounded-full border-2 border-gray-700 bg-gray-900 flex items-center justify-center">
                          <div className="h-2.5 w-2.5 rounded-full bg-transparent" />
                        </div>
                      )}
                      <div className="mt-3 flex flex-col items-center">
                        <span className="text-sm font-medium text-white">{stepItem.title}</span>
                        <span className="text-xs text-white/40 mt-1 text-center">{stepItem.description}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </nav>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="relative">
        {/* Full-screen loading transition */}
        <AnimatePresence>
          {isTransitioning && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-gray-900/90 backdrop-blur-sm flex items-center justify-center"
            >
              <div className="text-center">
                <div className="flex items-center justify-center mb-4">
                  <svg className="animate-spin h-8 w-8 text-emerald-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
                <h3 className="text-xl font-medium text-white mb-2">{transitionMessage}</h3>
                <p className="text-white/60">Please wait while we process your request...</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error Toast */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="fixed top-4 right-4 z-50 max-w-md bg-red-500/90 backdrop-blur-sm text-white px-4 py-3 rounded-lg shadow-lg"
            >
              <div className="flex items-center space-x-3">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12" y2="16" />
                </svg>
                <div className="flex-1 text-sm">{error}</div>
                <button
                  onClick={() => setError(null)}
                  className="text-white/60 hover:text-white"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {step === 'initial' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="min-h-screen flex flex-col items-center justify-center p-4 max-w-2xl mx-auto"
            >
              <motion.h1
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-4xl font-bold text-white mb-2"
              >
                LLM API Engine
              </motion.h1>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-white/60 text-lg mb-12 text-center"
              >
                Build and deploy AI-powered APIs in seconds.
              </motion.p>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="w-full space-y-4"
              >
                <div className="relative">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && query && !loading && firecrawlApiKey) {
                        handleQuerySubmit();
                      }
                    }}
                    placeholder={EXAMPLE_QUERY}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
                  />
                  <button
                    onClick={handleQuerySubmit}
                    disabled={!query || !firecrawlApiKey || loading}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading ? (
                      <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    )}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
          {step === 'query' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="max-w-3xl mx-auto p-6"
            >
              <div className="bg-white/5 backdrop-blur-sm rounded-lg p-6 border border-white/10">
                {loading ? (
                  <LoadingSpinner message="Processing your query..." />
                ) : (
                  <div className="space-y-4">
                    <h2 className="text-lg font-medium text-white">Describe Your API</h2>
                    <p className="text-white/60">Tell us what data you want to extract</p>

                    <div className="mt-4">
                      <textarea
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="w-full h-96 bg-gray-900/50 text-white font-mono text-sm rounded-lg border border-white/10 p-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                        placeholder="Enter your query here..."
                      />
                    </div>

                    <div className="flex justify-between items-center pt-4">
                      <button
                        onClick={() => setStep('initial')}
                        className="px-4 py-2 text-white/60 hover:text-white transition-colors"
                      >
                        Back
                      </button>
                      <button
                        onClick={handleQuerySubmit}
                        disabled={!query || loading}
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Continue
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
          {step === 'schema' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="max-w-3xl mx-auto p-6"
            >
              <div className="bg-white/5 backdrop-blur-sm rounded-lg p-6 border border-white/10">
                {loading ? (
                  <LoadingSpinner message="Generating schema..." />
                ) : (
                  <div className="space-y-4">
                    <h2 className="text-lg font-medium text-white">Generate Schema</h2>
                    <p className="text-white/60">Review and edit the generated schema for your data extraction</p>

                    <div className="mt-4">
                      <textarea
                        value={schemaStr}
                        onChange={(e) => setSchemaStr(e.target.value)}
                        className="w-full h-96 bg-gray-900/50 text-white font-mono text-sm rounded-lg border border-white/10 p-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                        placeholder="Enter your JSON schema here..."
                      />
                    </div>

                    <div className="flex justify-between items-center pt-4">
                      <button
                        onClick={() => setStep('query')}
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-medium text-white"
                      >
                        Back
                      </button>
                      <button
                        onClick={handleSchemaSubmit}
                        disabled={!schemaStr || loading}
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Continue
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
          {step === 'sources' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="max-w-5xl mx-auto space-y-6"
            >
              {/* Search bar */}
              <div className="sticky top-[104px] z-40 bg-gray-900/80 backdrop-blur-xl border-b border-white/10 px-6 py-4">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search for additional sources..."
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  />
                  <button
                    onClick={handleSearch}
                    disabled={!searchQuery || loading}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 bg-white/5 hover:bg-white/10 rounded-md text-white/60"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Search results */}
              <div className="px-6 pb-6">
                <div className="bg-white/5 backdrop-blur-sm rounded-lg p-6 border border-white/10">
                  {isTransitioning ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <div className="flex items-center justify-center mb-4">
                        <svg className="animate-spin h-8 w-8 text-emerald-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      </div>
                      <h3 className="text-xl font-medium text-white mb-2">{transitionMessage}</h3>
                      <p className="text-white/60">Please wait while we process your request...</p>
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="text-white/60 text-center py-8">
                      <p className="text-sm">No search results found. Please try a different query.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {searchResults.map((result, index) => (
                        <div
                          key={index}
                          className={`bg-white/5 hover:bg-white/10 rounded-lg p-4 cursor-pointer transition-all ${result.selected ? 'ring-2 ring-emerald-500' : ''
                            }`}
                          onClick={() => toggleResult(index)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 mr-4">
                              <h4 className="font-medium text-white">{result.title}</h4>
                              <p className="mt-1 text-sm text-white/60">{result.snippet}</p>
                              <p className="mt-2 text-xs text-white/40">{result.url}</p>
                            </div>
                            <div className="flex items-center space-x-2">
                              <div className={`p-1.5 rounded-md ${result.selected
                                ? 'bg-emerald-500 text-white'
                                : 'bg-white/5 hover:bg-white/10 text-white/60'
                                }`}>
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  {result.selected ? (
                                    <path d="M5 13l4 4L19 7" />
                                  ) : (
                                    <path d="M12 4v16m8-8H4" />
                                  )}
                                </svg>
                              </div>
                              <a
                                href={result.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 bg-white/5 hover:bg-white/10 text-white/60 rounded-md"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </a>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-4">
                    <button
                      onClick={() => setStep('schema')}
                      className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-medium text-white"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleSourcesSubmit}
                      disabled={!searchResults.some(r => r.selected) || isTransitioning}
                      className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
          {step === 'extract' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="max-w-3xl mx-auto p-6"
            >
              <div className="bg-white/5 backdrop-blur-sm rounded-lg p-6 border border-white/10">
                {loading ? (
                  <LoadingSpinner message="Extracting data from sources..." />
                ) : (
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-white">Extracted Data</h3>
                    <div className="space-y-4">
                      {extractedData && (
                        <pre className="w-full h-96 bg-gray-900/50 p-4 rounded-lg font-mono text-sm text-white overflow-auto">
                          {JSON.stringify(extractedData, null, 2)}
                        </pre>
                      )}
                    </div>
                    <div className="flex justify-between items-center">
                      <button
                        onClick={() => setStep('sources')}
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-medium text-white"
                      >
                        Back
                      </button>
                      <button
                        onClick={() => {
                          setStep('deploy');
                          setRouteInput(query.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''));
                        }}
                        disabled={!extractedData || loading}
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Deploy API
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
          {step === 'deploy' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="max-w-3xl mx-auto p-6 space-y-8"
            >
              <div className="bg-white/5 backdrop-blur-sm rounded-lg p-6 border border-white/10">
                {loading ? (
                  <LoadingSpinner message="Deploying your API..." />
                ) : (
                  <div>
                    <h3 className="text-lg font-medium text-white mb-4">Deploy Your API</h3>

                    <div className="space-y-6">
                      {!isDeployed ? (
                        <div className="space-y-6">
                          <div className="space-y-2">
                            <label className="block text-sm text-white/60">
                              Endpoint Name
                            </label>
                            <RouteInput
                              value={routeInput}
                              onChange={setRouteInput}
                              warning={warning}
                            />
                          </div>

                          <div className="flex justify-between items-center pt-4">
                            <button
                              onClick={() => setStep('extract')}
                              className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-medium text-white"
                            >
                              Back
                            </button>
                            <button
                              onClick={handleDeploy}
                              disabled={!routeInput || loading}
                              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Deploy API
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          <div className="p-4 bg-emerald-500/20 border border-emerald-500/30 rounded-lg">
                            <div className="flex items-center space-x-2 text-emerald-500">
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              <span className="font-medium">API Successfully Deployed!</span>
                            </div>
                          </div>

                          <div className="mt-4 space-y-2">
                            <p className="text-sm text-white/60">Your API is ready! Here's your endpoint:</p>
                            <div className="p-4 bg-white/5 rounded-lg">
                              <div className="flex items-center justify-between">
                                <code className="text-sm text-emerald-500">{getApiUrl(deployedRoute)}</code>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(getApiUrl(deployedRoute));
                                    toast.success('Endpoint URL copied to clipboard!');
                                  }}
                                  className="p-2 text-white/60 hover:text-white"
                                >
                                  <ClipboardIcon className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            <div className="mt-6 space-y-2">
                              <p className="text-sm text-white/60">Here's your API key:</p>
                              <div className="p-4 bg-white/5 rounded-lg">
                                <div className="flex items-center justify-between">
                                  <code className="text-sm text-emerald-500">{apiKey}</code>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(apiKey);
                                      toast.success('API key copied to clipboard!');
                                    }}
                                    className="p-2 text-white/60 hover:text-white"
                                  >
                                    <ClipboardIcon className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            </div>

                            <div className="mt-6 space-y-2">
                              <p className="text-sm text-white/60">Test your API with this cURL command:</p>
                              <div className="p-4 bg-white/5 rounded-lg">
                                <div className="flex items-center justify-between">
                                  <code className="text-sm text-emerald-500 whitespace-pre-wrap">
                                    {`curl -X GET "${getApiUrl(deployedRoute)}" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json"`}
                                  </code>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(
                                        `curl -X GET "${getApiUrl(deployedRoute)}" -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json"`
                                      );
                                      toast.success('cURL command copied to clipboard!');
                                    }}
                                    className="p-2 text-white/60 hover:text-white"
                                  >
                                    <ClipboardIcon className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* API Keys Input Section */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col space-y-2">
        <div className="bg-white/5 backdrop-blur-sm rounded-lg p-4 border border-white/10 shadow-lg space-y-3">
          {/* Firecrawl API Key */}
          <div className="flex items-center space-x-2">
            <div className="relative flex-1">
              <div className="text-xs text-white/40 mb-1">Firecrawl API Key</div>
              <div className="relative">
                <input
                  type={showApiKeys.firecrawl ? "text" : "password"}
                  value={firecrawlApiKey}
                  onChange={(e) => setFirecrawlApiKey(e.target.value)}
                  placeholder="Enter Firecrawl key"
                  className="w-full pr-24 pl-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
                <div className="absolute inset-y-0 right-2 flex items-center space-x-2">
                  <button
                    onClick={() => setShowApiKeys(prev => ({ ...prev, firecrawl: !prev.firecrawl }))}
                    className="p-1.5 text-white/60 hover:text-white rounded-md hover:bg-white/5"
                    title={showApiKeys.firecrawl ? "Hide API Key" : "Show API Key"}
                  >
                    {showApiKeys.firecrawl ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                  <a
                    href="https://firecrawl.dev"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-500 hover:text-emerald-400 text-sm"
                  >
                    Get Key
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* OpenAI API Key */}
          <div className="flex items-center space-x-2">
            <div className="relative flex-1">
              <div className="text-xs text-white/40 mb-1">OpenAI API Key</div>
              <div className="relative">
                <input
                  type={showApiKeys.openai ? "text" : "password"}
                  value={openaiApiKey}
                  onChange={(e) => setOpenaiApiKey(e.target.value)}
                  placeholder="Enter OpenAI key"
                  className="w-full pr-24 pl-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
                <div className="absolute inset-y-0 right-2 flex items-center space-x-2">
                  <button
                    onClick={() => setShowApiKeys(prev => ({ ...prev, openai: !prev.openai }))}
                    className="p-1.5 text-white/60 hover:text-white rounded-md hover:bg-white/5"
                    title={showApiKeys.openai ? "Hide API Key" : "Show API Key"}
                  >
                    {showApiKeys.openai ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-500 hover:text-emerald-400 text-sm"
                  >
                    Get Key
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {step === 'deploy' && (
        <div className="flex justify-between items-center pt-6 mt-6 border-t border-white/10">
        </div>
      )}
    </div>
  );
}
