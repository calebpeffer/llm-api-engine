import { initializeScheduler } from './scheduler';

// Initialize all background services
export async function initializeServices(): Promise<void> {
  console.log('Initializing background services...');
  
  try {
    // Initialize the scheduler
    await initializeScheduler();
    console.log('Scheduler initialized successfully');
  } catch (error) {
    console.error('Failed to initialize services:', error);
  }
} 