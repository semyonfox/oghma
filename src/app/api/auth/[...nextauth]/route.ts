import NextAuth from 'next-auth';
import { authConfig } from '@/auth.config';
import type { NextRequest } from 'next/server';

// Create a handler function for the route
const handler = NextAuth(authConfig);

// Export for App Router
export const GET = handler;
export const POST = handler;
