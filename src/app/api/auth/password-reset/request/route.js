// src/app/api/auth/password-reset/request/route.js

import crypto from 'crypto';
import sql from '@/database/pgsql.js';
import { sendPasswordResetEmail } from '@/lib/email.js';
import { createErrorResponse, parseJsonBody } from '@/lib/auth.js';
import {optionsHandler} from "@/lib/corsHeaders.js";

const ALLOWED_ORIGINS = [
  'https://oghmanotes.semyon.ie',
  'https://www.oghmanotes.semyon.ie',
  'http://localhost:3000',
];

function addCORSHeaders(response, request) {
  const origin = request?.headers?.get('origin') || 'https://oghmanotes.semyon.ie';
  const isAllowed = ALLOWED_ORIGINS.includes(origin);
  const corsOrigin = isAllowed ? origin : 'https://oghmanotes.semyon.ie';
  
  response.headers.set('Access-Control-Allow-Origin', corsOrigin);
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  return response;
}

export async function OPTIONS(request) {
  return optionsHandler(request);
}

/* Child function for debugging:
export async function GET(request) {
    console.log('Test route hit!');
    return new Response(JSON.stringify({ message: 'Test works!' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
}
*/


export async function POST(request) {
     try {
         const { data: body, error: parseError } = await parseJsonBody(request);
         if (parseError) return addCORSHeaders(parseError, request);

         const { email } = body;

         if (!email) {
             return addCORSHeaders(createErrorResponse('Email is required', 400), request);
         }

         // Find user
         const users = await sql`
       SELECT user_id, email 
       FROM app.login 
       WHERE email = ${email.trim()}
     `;

         // Always return success (security: don't reveal if email exists)
         if (users.length === 0) {
             const response = new Response(
                 JSON.stringify({ message: 'If that email exists, we sent a reset link' }),
                 { status: 200, headers: { 'Content-Type': 'application/json' } }
             );
             return addCORSHeaders(response, request);
         }

         const user = users[0];

         // Generate random token
         const resetToken = crypto.randomBytes(32).toString('hex');

         // Token expires in 1 hour
         const expiresAt = new Date(Date.now() + 3600000);

         // Save token to database
         await sql`
       UPDATE app.login 
       SET reset_token = ${resetToken},
           reset_token_expires = ${expiresAt}
       WHERE user_id = ${user.user_id}
     `;

         // Send email
         await sendPasswordResetEmail(email, resetToken);

         const response = new Response(
             JSON.stringify({ message: 'If that email exists, we sent a reset link' }),
             { status: 200, headers: { 'Content-Type': 'application/json' } }
         );
         return addCORSHeaders(response, request);

     } catch (error) {
         console.error('Password reset request error:', error);
         return addCORSHeaders(createErrorResponse('Failed to send reset email', 500), request);
     }
 }
