// CORS headers for auth endpoints with credentials support
// Uses explicit origin (not *) to allow credentials

const ALLOWED_ORIGINS = [
  'https://oghmanotes.semyon.ie',
  'https://www.oghmanotes.semyon.ie',
  'http://localhost:3000',
];

export function getCORSHeaders(request) {
  const origin = request?.headers?.get('origin') || 'https://oghmanotes.semyon.ie';
  const isAllowed = ALLOWED_ORIGINS.includes(origin);

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : 'https://oghmanotes.semyon.ie',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}

export function withCORS(response, request) {
  const headers = new Headers(response.headers);
  const corsHeaders = getCORSHeaders(request);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function optionsHandler(request) {
  return new Response(null, { headers: getCORSHeaders(request) });
}
