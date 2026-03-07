# LLM Strategy: User-Managed Keys

Users manage their own LLM API keys. Backend never stores them.

## How It Works

1. User → Settings → AI Provider
2. Paste API key
3. Frontend stores encrypted in browser
4. Frontend calls LLM directly
5. Backend coordinates search only

## Providers

OpenAI, Anthropic, Cohere, LiteLLM Gateway, local models

## Benefits

- No backend secrets
- Users pay directly
- Easy provider switching
- Privacy (keys stay in browser)

## Security

- Keys encrypted in browser session
- Never sent to backend
- Cleared on logout

## Implementation

```javascript
// Frontend: LLM calls with user's key
const embedding = await getEmbedding(text, userKey)

// Backend: search coordination only
GET /api/search?q=query
```

## Development

Test with internal Qwen model:
```
INTERNAL_LLM_GATEWAY=http://your-server:8000
INTERNAL_EMBEDDING_MODEL=qwen
```
