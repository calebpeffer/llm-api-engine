import { NextResponse } from 'next/server';
import { initializeServices } from '@/app/lib/init';

// Initialize services when the app starts
let initialized = false;

export async function GET() {
  if (!initialized) {
    try {
      await initializeServices();
      initialized = true;
      return NextResponse.json({ success: true, message: 'Services initialized successfully' });
    } catch (error) {
      console.error('Failed to initialize services:', error);
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to initialize services' 
      }, { status: 500 });
    }
  }
  
  return NextResponse.json({ success: true, message: 'Services already initialized' });
} 