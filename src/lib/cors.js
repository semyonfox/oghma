import { NextResponse } from 'next/server';

const ALLOWED_ORIGINS = [
  'https://oghmanotes.semyon.ie',
  'https://www.oghmanotes.semyon.ie',
  'http://localhost:3000',
];

export function getCORSHeaders(request) {
  const origin = request?.headers?.get('origin') || '';
  const isAllowed = ALLOWED_ORIGINS.includes(origin);

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}

export function handleCORSPreflight(request) {
  return new NextResponse(null, {
    status: 204,
    headers: getCORSHeaders(request),
  });
}

export function addCORSHeaders(response, request) {
  const corsHeaders = getCORSHeaders(request);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}
