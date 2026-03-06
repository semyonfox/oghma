# OghmaNotes LLM Strategy

**Document Status:** Design phase  
**Last Updated:** 2025-03-06

---

## Overview

OghmaNotes uses a **flexible, user-managed LLM provider model** that eliminates backend secret management and licensing complexity. Users choose their preferred AI provider and supply their own API keys.

### Key Principles

1. **User-Managed Keys:** Users provide API keys; backend doesn't store secrets
2. **Provider Flexibility:** Support OpenAI, Anthropic, local models, custom servers
3. **Cost Control:** Teams use internal models during development (cost-free)
4. **No Vendor Lock-in:** Switch providers without app changes
5. **Team Testing:** Use internal Qwen embedding model + LLM runner on dev server

---

## Architecture

### Request Flow

```
User in Browser
    ↓
    │ (has LLM provider config + key in localStorage)
    ↓
OghmaNotes Frontend (React)
    ↓
    │ Option A: Frontend → User's LLM Provider (OpenAI, etc.)
    │ Option B: Frontend → LiteLLM Gateway → Provider
    │ Option C: Frontend → Internal Server (Qwen for testing)
    ↓
RAG Response with Citations
    ↓
User sees answer

---

**Backend (Next.js API):**
- Does NOT handle LLM requests directly
- Provides RAG pipeline coordination (search, chunking)
- Frontend calls LLM independently with user's key
```

### Benefits

| Aspect | Traditional | OghmaNotes Model |
|--------|-------------|-----------------|
| **Key Management** | Backend stores secrets | User provides key |
| **Cost Responsibility** | App developer pays | Each user pays their own |
| **Provider Lock-in** | Hard to switch | Easy to switch |
| **Deployment Complexity** | Manage multiple API credentials | Just environment variables |
| **Development Cost** | High (OpenAI credits) | Low (internal models) |
| **User Privacy** | Keys visible to backend | Keys never leave browser |

---

## Supported Providers

### Production (User-Managed)

#### OpenAI
```yaml
Provider: OpenAI
Models:
  - Embedding: text-embedding-3-small (1536 dims)
  - Chat: gpt-3.5-turbo or gpt-4
User Flow:
  1. User creates OpenAI API key (platform.openai.com)
  2. User enters key in OghmaNotes Settings → AI Provider
  3. Frontend stores key in secure session/localStorage
  4. Frontend makes requests to OpenAI directly
  5. User pays OpenAI bills (separate account)
```

#### Anthropic Claude
```yaml
Provider: Anthropic
Models:
  - Chat: Claude 3 Opus / Sonnet / Haiku
  - Embedding: Via third party (nomic-embed-text)
User Flow:
  1. User creates Anthropic API key
  2. Sets as preferred provider in OghmaNotes
  3. Frontend routes RAG requests to Claude
```

#### Custom/Self-Hosted via LiteLLM
```yaml
Provider: LiteLLM Gateway
URL: https://your-llm-gateway.com
Models: Any LiteLLM-supported provider
User Flow:
  1. User configures custom gateway URL + API key
  2. OghmaNotes routes requests through gateway
  3. Gateway handles provider routing internally
```

### Development/Testing (Team-Internal)

#### Qwen Embedding Model (Your Server)
```yaml
Purpose: Free embeddings during development
Location: Your server (embeddings runner)
Integration:
  1. Team sets INTERNAL_EMBEDDING_MODEL env var
  2. Frontend can use team's embeddings for free testing
  3. In prod, users override with their own providers
Usage:
  - Quiz generation (no user's API key needed)
  - Text analysis
  - Semantic chunking
```

#### Qwen LLM (Your Server)
```yaml
Purpose: Free chat/completion during development
Location: Your server (Qwen runner)
Integration:
  1. Team sets INTERNAL_LLM_GATEWAY for testing
  2. Developers can test RAG without OpenAI costs
  3. Users can optionally use team's gateway in prod
Usage:
  - Rapid iteration
  - Cost-free development
  - Testing expensive operations (e.g., quiz generation)
```

---

## Implementation Details

### Frontend (User-Facing)

**Settings Page: AI Provider Configuration**

```tsx
// src/app/(app)/settings/ai-provider.tsx

interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'custom' | 'internal'
  apiKey: string  // Stored in secure localStorage/IndexedDB
  modelEmbedding?: string
  modelChat?: string
  customEndpoint?: string
}

// User selects provider and enters key
// Frontend stores securely (never sent to backend)
// Subsequent requests use this config
```

**RAG Chat Component**

```tsx
// src/components/rag/chat.tsx

async function askQuestion(question: string) {
  // 1. Get user's LLM config from localStorage
  const config = getLLMConfig()
  
  // 2. Search for relevant chunks (backend API)
  const chunks = await fetch('/api/rag/search', { query: question })
  
  // 3. Send to LLM with user's key (frontend → LLM directly)
  const response = await streamLLMResponse(question, chunks, config)
  
  // 4. Display answer with citations
  displayAnswer(response)
}
```

### Backend (Coordination, Not LLM Calls)

**What the backend does:**
- ✅ Vector search (pgvector)
- ✅ Text chunking
- ✅ Metadata retrieval
- ❌ Make LLM calls (that's the frontend's job)

**API Endpoints**

```yaml
GET /api/rag/search:
  Input: query string
  Output: Top 5 chunks with metadata (no LLM call)
  
POST /api/rag/index:
  Input: PDF file
  Process: Extract text → Chunking → User embeddings
  Output: Indexed chunks in pgvector

GET /api/rag/embeddings:
  Input: text
  Output: Embedding vector (1536 dims)
  Notes: Routes to user's provider or team's internal model
```

---

## Configuration by Environment

### Local Development

```yaml
# .env.local

# Use team's internal models (free, fast iteration)
INTERNAL_LLM_GATEWAY=http://localhost:8000  # Qwen LLM runner
INTERNAL_EMBEDDING_MODEL=qwen-embedding     # Your embedding model
NEXT_PUBLIC_RAG_ENABLED=true

# Users can still override with their own keys in Settings
```

**Setup:**
```bash
# Run Qwen LLM server on your machine
# Team members can use it while developing
python -m llmserver --model qwen --port 8000
```

### Staging / Production

```yaml
# .env.production

# No internal models in staging/prod
# Users must provide their own keys

INTERNAL_LLM_GATEWAY=       # Empty - not available
INTERNAL_EMBEDDING_MODEL=   # Empty - not available
NEXT_PUBLIC_RAG_ENABLED=true
```

---

## User Experience Flow

### First-Time RAG Setup (User)

```
1. User clicks "Ask a Question" in RAG Chat
   ↓
2. Popup: "Configure LLM Provider"
   ├─ OpenAI (free trial available)
   ├─ Anthropic (Claude)
   ├─ Custom Gateway
   └─ Use Team Internal (if available)
   ↓
3. User selects provider
   ↓
4. User enters API key (secure input, client-only)
   ↓
5. Frontend validates key works (test request)
   ↓
6. Config saved to browser (localStorage with encryption)
   ↓
7. User can now ask questions (frontend uses stored key)
```

### Daily Usage

```
1. User asks: "What are vectors in linear algebra?"
   ↓
2. Frontend retrieves stored LLM config from browser
   ↓
3. Backend searches for relevant PDF chunks
   ↓
4. Frontend sends chunks + question to user's LLM provider
   ↓
5. LLM generates answer
   ↓
6. Frontend displays answer with citations
   ↓
7. User sees "Powered by OpenAI" / "Powered by Claude" footer
```

---

## Special Case: Team Internal Models

### For Testing (Development)

The team can use internal Qwen models to iterate without OpenAI costs:

```bash
# On team server (or local machine during dev)
# Start Qwen embedding service
python -m models.embedding.qwen --port 5000

# Start Qwen LLM service
python -m models.llm.qwen --port 8000
```

**In development:**
```yaml
INTERNAL_LLM_GATEWAY=http://your-server:8000
INTERNAL_EMBEDDING_MODEL=qwen
```

**Frontend behavior:**
- Dev team: Uses internal models automatically
- External users: Must provide own keys (can't access team's server)

---

## Provider-Specific Examples

### Example: Using OpenAI

**User Setup:**
1. Go to https://platform.openai.com/account/api-keys
2. Create API key
3. In OghmaNotes Settings → AI Provider → Select "OpenAI"
4. Paste key

**Frontend Flow:**
```typescript
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${userApiKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: 'You are a helpful tutor.' },
      { role: 'user', content: question },
      { role: 'assistant', content: retrievedChunks }
    ],
    stream: true
  })
})
```

### Example: Using LiteLLM Gateway

**Company Setup:**
```bash
# Deploy LiteLLM proxy that handles provider routing
docker run -p 8000:8000 ghcr.io/bestpractices/litellm \
  --config config.yaml \
  --api_base http://0.0.0.0:8000
```

**User Setup:**
1. Get API key from LiteLLM admin
2. In OghmaNotes Settings → AI Provider → Select "Custom Gateway"
3. Enter gateway URL: `https://company-llm-gateway.com`
4. Paste API key

**Benefits:**
- Company controls which models are available
- Single point for cost tracking
- Easy to switch underlying providers (OpenAI → Anthropic → local)
- Users don't need separate accounts

---

## Security Considerations

### Key Storage

**Frontend (Browser):**
- ✅ Keys stored in `localStorage` or `IndexedDB`
- ✅ Encrypted if using IndexedDB with encryption library
- ✅ Cleared on logout
- ✅ Never sent to OghmaNotes backend

**Backend (Never):**
- ❌ Do NOT store user API keys on server
- ❌ Do NOT log API keys
- ❌ Do NOT cache API keys in memory
- ❌ If backend needs to make LLM calls, use internal models only

### CORS & Preflight

Some LLM providers may have CORS restrictions:

**Solution 1: Use a Proxy**
```
Frontend → LiteLLM Proxy → OpenAI
```

**Solution 2: Enable CORS in Backend (Temporary)**
```typescript
// src/app/api/rag/proxy/route.ts
// Only for testing; remove in production
async function POST(req: Request) {
  const userKey = req.headers.get('x-llm-key')  // User's key
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    headers: { Authorization: `Bearer ${userKey}` },
    ...req
  })
  return response
}
```

---

## Implementation Roadmap

### Phase 2 (RAG Pipeline - Weeks 3-4)
- [ ] Design LLM provider UI (Settings page)
- [ ] Implement key storage (secure localStorage)
- [ ] Build RAG search endpoint `/api/rag/search`
- [ ] Test with OpenAI API (user-provided key)
- [ ] Test with team's internal Qwen

### Phase 3 (Features - Weeks 5-6)
- [ ] Add LiteLLM support for custom gateways
- [ ] Implement provider validation (test API key works)
- [ ] Add provider footer badges ("Powered by OpenAI")
- [ ] Build Anthropic provider support
- [ ] Error handling for rate limits & invalid keys

### Post-MVP (Nice to Have)
- [ ] Provider comparison UI (cost, speed, quality)
- [ ] Credential encryption at rest
- [ ] Multi-provider fallback (use Anthropic if OpenAI fails)
- [ ] Key rotation / expiration warnings
- [ ] Usage analytics (tokens used, cost estimate)

---

## FAQ

**Q: What if a user loses their API key?**  
A: They can re-enter it in Settings. The app doesn't store it on the backend, so there's no account recovery needed.

**Q: What if OpenAI goes down?**  
A: Users can switch to Anthropic or another provider in Settings without any app changes.

**Q: What about GDPR / data privacy?**  
A: OghmaNotes doesn't see the API key or any requests to the LLM. Users are directly interacting with the provider. This is better for privacy than a traditional backend.

**Q: Can we use the team's internal models in production?**  
A: Not recommended. Team models are for development only. In production, users should use their own provider accounts for reliability and scalability.

**Q: What if a user enters a wrong API key?**  
A: The frontend validates the key on entry (test request). If it fails, user is notified immediately and can correct it.

**Q: How do we monetize if users bring their own keys?**  
A: OghmaNotes is the value add (RAG pipeline, search, quiz gen, flashcards). Users pay for the LLM directly based on their usage.

---

## Resources

- **OpenAI API:** https://platform.openai.com/docs/
- **Anthropic API:** https://docs.anthropic.com/
- **LiteLLM:** https://github.com/BerriAI/litellm
- **Qwen Models:** https://huggingface.co/Qwen/
- **pgvector Embeddings:** https://github.com/ankane/pgvector

---

## References in Codebase

Once implemented, these will be the key files:

```
src/
├── app/
│   ├── (app)/
│   │   └── settings/
│   │       └── ai-provider.tsx    # LLM provider config UI
│   └── api/
│       └── rag/
│           ├── search.ts          # Vector search (no LLM call)
│           ├── index.ts           # PDF indexing
│           └── proxy.ts           # Optional: CORS proxy
├── lib/
│   ├── llm/
│   │   ├── providers.ts           # Provider definitions
│   │   ├── openai.ts              # OpenAI specific logic
│   │   ├── anthropic.ts           # Anthropic specific logic
│   │   └── litellm.ts             # LiteLLM gateway
│   └── storage/
│       └── keys.ts                # Secure key storage utils
└── components/
    ├── rag/
    │   ├── chat.tsx               # Main RAG interface
    │   └── provider-selector.tsx   # Provider choice UI
```

---

**Last Updated:** 2025-03-06  
**Next Review:** After RAG pipeline implementation
