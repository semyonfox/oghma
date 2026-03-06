# LLM Strategy: User-Managed Keys

Users manage their own LLM API keys. Backend never stores or sees them.

## How It Works

1. User opens Settings → AI Provider
2. Selects provider (OpenAI, Anthropic, etc.)
3. Pastes their API key
4. Frontend stores key in browser (encrypted)
5. Frontend calls LLM directly with user's key
6. Backend only coordinates search, never touches the key

## Supported Providers

- OpenAI (GPT-3.5, GPT-4, embeddings)
- Anthropic (Claude)
- Cohere
- LiteLLM Gateway (custom endpoint)
- Local models (your server)

## Benefits

- No backend secrets to manage
- Users pay directly to their provider
- Easy to switch providers
- Better privacy (keys never leave browser)

## Development

Team can use internal Qwen model for free testing:

```
INTERNAL_LLM_GATEWAY=http://your-server:8000
INTERNAL_EMBEDDING_MODEL=qwen
```

Production uses user-provided keys.

## Security

- Keys stored in encrypted browser session
- Never sent to backend
- Never logged or cached
- Cleared on logout

## Implementation

Frontend calls providers directly. Backend coordinates search only:

```javascript
// Frontend handles LLM calls with user's key
const embedding = await getEmbedding(text, userKey)

// Backend returns search results
GET /api/search?q=query  // No key needed
```

## Future

- Provider comparison UI
- Key rotation warnings
- Fallback providers
