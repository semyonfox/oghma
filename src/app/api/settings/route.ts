import { NextResponse } from 'next/server';
import { DEFAULT_SETTINGS } from '@/lib/notes/types/settings';

// Mock settings storage
let settings = { ...DEFAULT_SETTINGS };

export async function GET() {
  return NextResponse.json(settings);
}

export async function POST(request: Request) {
  const body = await request.json();
  
  // Merge with existing settings
  settings = { ...settings, ...body };
  
  return NextResponse.json(settings);
}
