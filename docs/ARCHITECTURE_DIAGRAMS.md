# Architecture & Data Flow Diagrams

## 1. Overall Platform Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                   Socsboard AI Learning Platform                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Frontend (Next.js 16 App Router, React 19, Tailwind)      │  │
│  │                                                             │  │
│  │  ┌──────────┐  ┌──────────────┐  ┌────────────────┐       │  │
│  │  │ Landing  │  │ Login/Signup │  │   /notes       │       │  │
│  │  │  Page    │  │   (Auth)     │  │   App          │       │  │
│  │  └──────────┘  └──────────────┘  └────────────────┘       │  │
│  │                                            │                │  │
│  │                                    ┌───────┴────────┐       │  │
│  │                                    ▼                ▼       │  │
│  │                            ┌──────────────┐ ┌────────────┐  │  │
│  │                            │   Sidebar    │ │  Editor    │  │  │
│  │                            │  (File Tree) │ │(Rich Markdown)│ │  │
│  │                            └──────────────┘ └────────────┘  │  │
│  │                                                             │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │  Settings: API Keys (AI + Canvas) - SessionStorage  │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  │                                                             │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                    │
│                              │ HTTPS                              │
│                              ▼                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Backend API (Next.js Server Routes)                       │  │
│  │                                                             │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │  │
│  │  │ /api/auth/* │  │  /api/notes/*│  │  /api/ai/*       │  │  │
│  │  │             │  │              │  │                  │  │  │
│  │  │ JWT,        │  │ CRUD,        │  │ Chat, Summarize, │  │  │
│  │  │ bcrypt,     │  │ S3 proxy,    │  │ Explain (proxy   │  │  │
│  │  │ sessions    │  │ DB queries   │  │ user's API key)  │  │  │
│  │  └─────────────┘  └──────────────┘  └──────────────────┘  │  │
│  │                                                             │  │
│  └────────────────────────────────────────────────────────────┘  │
│                   │              │              │                 │
│                   ▼              ▼              ▼                 │
│  ┌──────────────────────┬──────────────────┬──────────────────┐  │
│  │                      │                  │                  │  │
│  │    PostgreSQL        │   AWS S3/MinIO   │   OpenAI/Cohere  │  │
│  │    (PostgreSQL)      │  (Note Content)  │   (AI Provider)  │  │
│  │                      │                  │                  │  │
│  │  users               │  users/          │  (User's key)    │  │
│  │  notes (metadata)    │    {userId}/     │                  │  │
│  │  note_tags           │    notes/        │                  │  │
│  │  sessions            │      {noteId}.md │                  │  │
│  │                      │                  │                  │  │
│  └──────────────────────┴──────────────────┴──────────────────┘  │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Note Create/Edit/Load Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ CREATE NEW NOTE                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User clicks "+ New Note"                                    │
│     ▼                                                            │
│  2. Editor UI opens (blank)                                     │
│     ▼                                                            │
│  3. User types content in Markdown editor                       │
│     ▼                                                            │
│  4. User presses Ctrl+S or auto-save triggers                   │
│     ▼                                                            │
│  5. POST /api/notes { title, content }                          │
│     ├─ Server validates JWT (from cookie)                       │
│     ├─ Generate noteId = UUID()                                 │
│     ├─ S3 path = "users/{userId}/notes/{noteId}.md"            │
│     ├─ PUT to S3 (content)                                      │
│     ├─ INSERT into PostgreSQL (metadata)                        │
│     └─ Return { noteId, s3_path, created_at }                  │
│     ▼                                                            │
│  6. Response cached in browser                                  │
│     ▼                                                            │
│  7. UI shows "Saved" toast                                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ LOAD EXISTING NOTE                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User clicks note in sidebar file tree                       │
│     ▼                                                            │
│  2. GET /api/notes/{noteId}                                     │
│     ├─ Server validates JWT                                    │
│     ├─ Query PostgreSQL: SELECT title, s3_path, updated_at    │
│     ├─ Verify user owns this note                             │
│     ├─ GET object from S3 (content)                           │
│     └─ Return { id, title, content, updatedAt }               │
│     ▼                                                            │
│  3. Response cached in browser                                  │
│     ▼                                                            │
│  4. Editor loads with content                                   │
│     ▼                                                            │
│  5. User can now edit                                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ UPDATE NOTE                                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User edits content                                          │
│     ▼                                                            │
│  2. Auto-save: PATCH /api/notes/{noteId}                       │
│     ├─ Server validates JWT                                    │
│     ├─ PUT new content to S3 (overwrites)                      │
│     ├─ UPDATE PostgreSQL (title, updated_at)                   │
│     └─ Return updated note                                     │
│     ▼                                                            │
│  3. Status indicator updates ("Saved", "Syncing", etc.)         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. AI Integration: Chat Flow

```
┌──────────────────────────────────────────────────────────────────┐
│ AI CHAT FLOW (BYO API Key Model)                                 │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  SETUP (First time user):                                        │
│  ─────────────────────────────────────────────────────────────  │
│                                                                   │
│  1. User navigates to /settings                                  │
│     ▼                                                             │
│  2. Sees form: [Dropdown: OpenAI/Cohere/Claude] [Key Input]     │
│     ▼                                                             │
│  3. User enters API key (e.g., "sk-...")                        │
│     ▼                                                             │
│  4. JavaScript: setAIKey(provider, key)                         │
│     ├─ Validate key format (basic, e.g., starts with "sk-")    │
│     ├─ Store in sessionStorage (NOT localStorage, NOT DB)      │
│     └─ Show "API key saved" toast                              │
│                                                                   │
│  RUNTIME (User asks AI a question):                             │
│  ──────────────────────────────────────────────────────────────  │
│                                                                   │
│  1. User types message in chat widget (within note or sidebar)  │
│     ▼                                                             │
│  2. JavaScript: getAIKey() → reads from sessionStorage          │
│     ▼                                                             │
│  3. POST /api/ai/chat                                           │
│     Body: { provider: "openai", messages: [...] }              │
│     Header: { x-ai-key: "sk-..." }  ← USER'S KEY IN HEADER    │
│     ▼                                                             │
│  4. Server /api/ai/chat (route.ts):                            │
│     ├─ Extract x-ai-key header                                 │
│     ├─ Validate JWT (user authenticated)                       │
│     ├─ Create Vercel `ai` model instance:                      │
│     │   model = openai('gpt-3.5-turbo', { apiKey: header })   │
│     ├─ Call streamText(..., messages)                          │
│     └─ Stream response back to client                          │
│     ▼                                                             │
│  5. Browser receives SSE (Server-Sent Events) or chunked data  │
│     ▼                                                             │
│  6. UI shows response streaming live                            │
│     ▼                                                             │
│  7. User sees: "..." → "How to..." → "...your learning..."     │
│                                                                   │
│  SECURITY NOTES:                                                │
│  ──────────────────────────────────────────────────────────────  │
│  ✅ Key never persisted server-side                             │
│  ✅ Key sent only as header, used immediately, then discarded   │
│  ✅ No logging of key or full responses                         │
│  ✅ HTTPS required in production                                │
│  ✅ Each user manages their own key/costs                       │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. State Management & Data Caching

```
Browser Session
├─ SessionStorage
│  └─ ai_config: { provider: "openai", apiKey: "sk-..." }
│
├─ localStorage (Optional, disabled for MVP to avoid accidental persist)
│  └─ [empty for security]
│
└─ React State (via unstated-next containers)
   ├─ EditorState
   │  ├─ currentNote: { id, title, content, s3Path }
   │  ├─ isDirty: boolean
   │  └─ isSaving: boolean
   │
   ├─ NoteTreeState
   │  ├─ notes: Note[] (metadata from PostgreSQL)
   │  ├─ expanded: Set<nodeId>
   │  └─ selected: nodeId
   │
   └─ UIState
      ├─ sidebarVisible: boolean
      ├─ editorTheme: 'light' | 'dark'
      └─ split: { sizes: [30, 70] }  // sidebar vs editor

Server (PostgreSQL)
├─ Users table
│  └─ id, email, password_hash, created_at
│
└─ Notes table
   ├─ id, user_id, title, s3_path, created_at, updated_at
   └─ tags, ai_summary (optional, filled by background job)

Cloud Storage (S3/MinIO)
└─ Structure: s3://bucket/users/{userId}/notes/{noteId}.md
   ├─ Content: Markdown text
   └─ Metadata: ContentType, CacheControl, CustomMetadata
```

---

## 5. Database Schema Relationship

```
users (existing)
│
├─ id (PK)
├─ email
├─ password_hash
├─ created_at
└─ updated_at
    │
    │ 1:N
    ▼
notes (NEW)
├─ id (UUID, PK)
├─ user_id (FK → users.id)
├─ title
├─ s3_path (e.g., "users/{userId}/notes/{id}.md")
├─ created_at
├─ updated_at
├─ deleted_at (soft delete)
└─ tags (TEXT[], e.g., "{'math', 'calculus'}")
    │
    │ Optional: 1:N
    ▼
note_tags (Optional, NEW)
├─ id (PK)
├─ note_id (FK → notes.id)
└─ tag (VARCHAR)
```

---

## 6. Component Hierarchy

```
/notes (Layout)
│
├─ Sidebar
│  ├─ SidebarTool (buttons: new, search, settings)
│  ├─ SidebarList (tree of notes)
│  │  └─ TreeNode (recursive, folder/note items)
│  └─ Favorites (pinned notes)
│
├─ MainEditor
│  ├─ EditorHeader (title, breadcrumbs, actions)
│  ├─ Editor (ProseMirror markdown editor)
│  ├─ EditorFooter (status: "Saved", "Syncing", word count)
│  │
│  └─ AIAssistant (Chat widget, optional)
│     ├─ ChatHistory (messages)
│     ├─ ChatInput (text input)
│     └─ ChatResponse (streaming text)
│
└─ Settings (Modal or /settings page)
   ├─ APIKeyForm (Provider dropdown, key input)
   └─ Preferences (Theme, notifications, etc.)
```

---

## 7. API Endpoint Response Examples

### GET /api/notes (List user's notes)

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "title": "Calculus Notes",
      "s3_path": "users/42/notes/550e8400.md",
      "created_at": "2025-02-14T10:00:00Z",
      "updated_at": "2025-02-14T11:30:00Z",
      "tags": ["math", "calculus"]
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440002",
      "title": "Biology Study Guide",
      "s3_path": "users/42/notes/550e8400.md",
      "created_at": "2025-02-13T09:00:00Z",
      "updated_at": "2025-02-14T14:20:00Z",
      "tags": ["biology", "exam-prep"]
    }
  ],
  "total": 2
}
```

### GET /api/notes/{id} (Fetch note content)

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "title": "Calculus Notes",
  "content": "# Calculus\n\n## Derivatives\n\nThe derivative of a function f...",
  "s3_path": "users/42/notes/550e8400.md",
  "created_at": "2025-02-14T10:00:00Z",
  "updated_at": "2025-02-14T11:30:00Z",
  "tags": ["math", "calculus"]
}
```

### POST /api/ai/chat (Stream AI response)

**Request:**
```json
{
  "provider": "openai",
  "messages": [
    { "role": "user", "content": "Explain derivatives in simple terms" }
  ]
}
```

**Response (streamed):**
```
data: Derivatives\n
data: measure\n
data: how\n
data: quickly\n
data: a\n
data: function\n
...
```

---

## 8. Error Handling Flow

```
User Action
│
├─ Network Error
│  ├─ Retry (exponential backoff)
│  ├─ Show toast: "Connection lost. Retrying..."
│  └─ Offline mode (use cached data if available)
│
├─ Validation Error (e.g., missing title)
│  ├─ Highlight invalid field in red
│  ├─ Show error message
│  └─ Prevent submission
│
├─ Auth Error (JWT expired)
│  ├─ Redirect to /login
│  └─ Re-authenticate
│
├─ S3 Error (bucket full, permissions)
│  ├─ Log error (server-side only)
│  ├─ Show user: "Could not save. Try again."
│  └─ Trigger retry
│
├─ AI API Error (Invalid key, rate limit, provider down)
│  ├─ Check if key is invalid: "API key rejected. Check settings."
│  ├─ If rate limited: "Please wait before trying again."
│  └─ If provider down: "AI service unavailable. Try later."
│
└─ Unexpected Error
   ├─ Log to error tracking (Sentry, etc.)
   ├─ Show generic message
   └─ Offer help link
```

---

This should give the team a clear visual understanding of how everything connects. Reference this when implementing routes, components, and data flows.
