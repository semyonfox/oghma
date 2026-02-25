🎯 OghmaNotes in 30 Seconds

What: AI note-taking app with RAG chat
Students save notes → AI auto-generates embeddings → Users chat with their notes → LLM answers questions using their notes as context

---

Current Status
| Component | Status |
|-----------|--------|
| Frontend UI | ✅ 100% Done (VSCode layout, file tree, split editor, chat UI) |
| Database | 🚀 Starting now (RDS PostgreSQL + pgvector) |
| RAG Pipeline | 🚀 Starting now (embeddings → search → chat) |
| Deployment | Planned (AWS Amplify) |

---

What You're Building (Weeks 2-5)
Week 2:  PostgreSQL + Prisma + Auth.js
         └→ Save notes to DB ✅
Week 3:  Embeddings generation
         └→ Auto-embed on save ✅
Week 4:  Chat with RAG
         └→ Search notes + answer questions ✅
Week 5:  Production deployment
         └→ Go live ✅

---

Data Flow: How RAG Works
User saves note → async embedding generation → stored as 1536-dim vector
User asks question in chat:
1. Convert question to vector
2. Find 3 most similar notes (pgvector similarity search)
3. Load those notes as context
4. Send to GPT-4: "Here's the context: notes User asks: question"
5. Stream response back
Result: Chat answers are grounded in the user's own notes

---

Architecture Diagram
Frontend (React)
    ↓
Next.js API Routes (Backend)
    ↓
RDS PostgreSQL + pgvector (Database)
    ↓
OpenAI API (Embeddings + Chat)
