import { getServerSession } from 'next-auth';
import { authConfig } from './auth.config';

// Auth.js doesn't properly export handlers for App Router in v4
// So we'll use getServerSession for middleware/server components
export async function auth() {
  return await getServerSession(authConfig);
}

// Export these for compatibility with middleware
export const signIn = undefined;
export const signOut = undefined;
