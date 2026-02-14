# AI Key Proxy & BYO Key Model

## Overview

Users bring their own API keys (OpenAI, Cohere, etc.). Keys are stored **client-side only** (never persisted server-side), forwarded via request headers to server-side proxy routes, and never logged or stored.

This doc covers the architecture and implementation.

---

## Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────┐
│ Browser (Client)                                    │
│ ┌─────────────────────────────────────────────────┐ │
│ │ SessionStorage: { provider: "openai", key: "sk-..." } │
│ └─────────────────────────────────────────────────┘ │
└──────────┬──────────────────────────────────────────┘
           │ Request Header: Authorization: Bearer sk-...
           ▼
┌─────────────────────────────────────────────────────┐
│ Next.js Server (API Route)                          │
│ ┌─────────────────────────────────────────────────┐ │
│ │ /api/ai/chat (or /api/ai/summarize, etc.)      │ │
│ │ 1. Extract key from header                      │ │
│ │ 2. Validate key format (basic)                  │ │
│ │ 3. Pass to Vercel `ai` package                  │ │
│ │ 4. Stream response back to client               │ │
│ │ 5. Never store key in logs/database             │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

---

## Client-Side: SessionStorage

### Store API Key

**Location**: `apps/web/src/lib/ai/client.ts`

```typescript
// Store key in sessionStorage (cleared on tab close)
export function setAIKey(provider: string, apiKey: string) {
  sessionStorage.setItem(
    'ai_config',
    JSON.stringify({ provider, apiKey })
  );
}

// Retrieve key
export function getAIKey() {
  const config = sessionStorage.getItem('ai_config');
  if (!config) return null;
  return JSON.parse(config);
}

// Clear (optional; on logout)
export function clearAIKey() {
  sessionStorage.removeItem('ai_config');
}
```

### UI: Key Input Form

**Location**: `apps/web/src/components/ai/api-key-form.tsx`

```typescript
import { useState } from 'react';
import { setAIKey } from '@/lib/ai/client';

export default function APIKeyForm() {
  const [provider, setProvider] = useState('openai');
  const [key, setKey] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setAIKey(provider, key);
    setKey(''); // Clear input for UX
    // Show confirmation toast
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="provider">AI Provider</label>
        <select
          id="provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="w-full px-3 py-2 border rounded"
        >
          <option value="openai">OpenAI (ChatGPT)</option>
          <option value="cohere">Cohere</option>
          <option value="anthropic">Anthropic (Claude)</option>
        </select>
      </div>

      <div>
        <label htmlFor="key">API Key</label>
        <input
          id="key"
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-... or cohere_api_key_..."
          className="w-full px-3 py-2 border rounded font-mono"
        />
        <p className="text-xs text-gray-500 mt-1">
          Never shared with our servers; stored in your browser session only.
        </p>
      </div>

      <button
        type="submit"
        className="w-full px-4 py-2 bg-blue-500 text-white rounded"
      >
        Set API Key
      </button>
    </form>
  );
}
```

---

## Server-Side: Proxy Routes

### 1. Chat/Completion Route

**Location**: `apps/web/src/app/api/ai/chat/route.ts`

```typescript
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { cohere } from '@ai-sdk/cohere';
import { anthropic } from '@ai-sdk/anthropic';
import { NextRequest, NextResponse } from 'next/server';

// Middleware to verify user is authenticated
async function verifyAuth(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value;
  if (!token) {
    throw new Error('Unauthorized');
  }
  // Decode JWT, extract userId (or throw if invalid)
  return token;
}

export async function POST(req: NextRequest) {
  try {
    // 1. Verify user is authenticated
    const token = await verifyAuth(req);

    // 2. Extract API key from request header
    const apiKey = req.headers.get('x-ai-key');
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key not provided' },
        { status: 400 }
      );
    }

    // 3. Get provider from request body or header
    const { provider, messages } = await req.json();
    if (!provider || !messages) {
      return NextResponse.json(
        { error: 'Missing provider or messages' },
        { status: 400 }
      );
    }

    // 4. Create model instance with user's API key
    let model;
    switch (provider) {
      case 'openai':
        model = openai('gpt-3.5-turbo', {
          apiKey: apiKey
        });
        break;
      case 'cohere':
        model = cohere('command-r', {
          apiKey: apiKey
        });
        break;
      case 'anthropic':
        model = anthropic('claude-3-haiku', {
          apiKey: apiKey
        });
        break;
      default:
        return NextResponse.json(
          { error: 'Unknown provider' },
          { status: 400 }
        );
    }

    // 5. Stream text response
    const result = await streamText({
      model,
      messages,
      system: 'You are a helpful study assistant. Help the user understand concepts, answer questions about their notes, and provide learning advice.',
    });

    // 6. Return stream to client
    return result.toAIStreamResponse();

  } catch (error) {
    console.error('AI chat error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### 2. Summarize Route

**Location**: `apps/web/src/app/api/ai/summarize/route.ts`

```typescript
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get('x-ai-key');
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key not provided' },
        { status: 400 }
      );
    }

    const { text, provider = 'openai' } = await req.json();
    if (!text) {
      return NextResponse.json(
        { error: 'No text provided' },
        { status: 400 }
      );
    }

    const model = openai('gpt-3.5-turbo', { apiKey });

    const { text: summary } = await generateText({
      model,
      prompt: `Summarize the following text in 2-3 sentences for a student:\n\n${text}`,
    });

    return NextResponse.json({ summary });

  } catch (error) {
    console.error('Summarize error:', error);
    return NextResponse.json(
      { error: 'Failed to summarize' },
      { status: 500 }
    );
  }
}
```

---

## Client Integration: Using the AI Proxy

### Hook for Chat

**Location**: `apps/web/src/lib/ai/use-chat.ts`

```typescript
import { useCallback, useState } from 'react';
import { getAIKey } from './client';

export function useAIChat() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(async (messages: any[]) => {
    const config = getAIKey();
    if (!config) {
      setError('API key not configured');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ai-key': config.apiKey, // User's key, sent via header
        },
        body: JSON.stringify({
          provider: config.provider,
          messages,
        }),
      });

      if (!response.ok) {
        throw new Error(`Chat failed: ${response.statusText}`);
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let text = '';

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;
        text += decoder.decode(value);
        // Yield chunks for real-time UI updates
      }

      return text;

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { sendMessage, loading, error };
}
```

---

## Environment Setup

### Dependencies

Add to `apps/web/package.json`:

```json
"dependencies": {
  "ai": "^3.1.0",
  "@ai-sdk/openai": "^0.0.53",
  "@ai-sdk/cohere": "^0.0.12",
  "@ai-sdk/anthropic": "^0.0.30"
}
```

### Environment Variables

**`.env.local` or `.env.production`**:

```
# No server-side keys stored! User provides them at runtime.
# These are just feature flags:
NEXT_PUBLIC_AI_ENABLED=true
NEXT_PUBLIC_AI_PROVIDERS=openai,cohere,anthropic
```

---

## Security Considerations

✅ **Good**:
- Keys live only in browser `sessionStorage` (cleared on tab close)
- Keys never sent to our backend as stored data
- Keys sent only as request headers (in-transit for immediate use)
- No logging of keys or responses
- Each proxy route validates authentication (JWT from cookie)

⚠️ **Be careful**:
- Do NOT log request bodies/headers (they may contain keys if error happens)
- Do NOT store keys in cookies, localStorage, or database
- Do NOT send keys in response bodies
- Ensure HTTPS in production (keys sent over network)
- Rate-limit proxy routes to prevent abuse (user's key could be rate-limited by AI provider)

---

## Testing

### Manual Test: OpenAI

1. Open browser DevTools (F12 → Application → Session Storage)
2. Navigate to `/settings` (or wherever we put the key form)
3. Enter OpenAI API key
4. Open note with AI assistant widget
5. Send a message → should appear in response

### Unit Tests (TODO)

```typescript
// apps/web/src/app/api/ai/chat/__tests__/route.test.ts
describe('POST /api/ai/chat', () => {
  it('should reject request without API key', async () => {
    // ...
  });

  it('should stream response with valid key', async () => {
    // ...
  });

  it('should handle unknown provider', async () => {
    // ...
  });
});
```

---

## Future: Canvas API Integration

Placeholder for Canvas API key storage + note auto-sync:

```typescript
// apps/web/src/lib/ai/canvas.ts
export function setCanvasKey(apiKey: string, domain: string) {
  sessionStorage.setItem(
    'canvas_config',
    JSON.stringify({ apiKey, domain })
  );
}

// Later: sync notes ↔ Canvas lectures
```

---

## Decision Log

- **Why not persist keys server-side?** Increases security risk; user owns keys, not platform
- **Why sessionStorage?** Clears on tab close; safer than localStorage; sufficient for MVP
- **Why header-based auth?** Avoids embedding key in request body (reduces logging accidents)
- **Why Vercel `ai` package?** Unified API for multiple providers; minimal setup; well-maintained
