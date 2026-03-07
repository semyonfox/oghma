# OghmaNotes SRS Analysis

**Project:** OghmaNotes (CT216 Software Engineering)  
**Team:** Samuel Regan, Semyon Fox, Shreyansh Singh  
**Status:** Complete (v2.1)

## Overview

Web-based learning platform for students to:
- Create Markdown notes with offline support (PWA)
- Upload and search PDFs (50MB each, 5GB total)
- Intelligent search (fuzzy + semantic)
- Ask questions answered by own materials (RAG)
- Generate quizzes, flashcards, and analytics

## Key Features

**Core (Complete):**
- Authentication (register, login, password reset)
- Markdown notes with offline sync
- PDF upload and annotation
- Folder organization

**Phase 1 (In Progress):**
- Fuzzy + semantic search (Cmd+K overlay)
- Tree sorting and filtering

**Phase 2-3 (Planned):**
- RAG chat with citations
- Quiz generation and flashcards
- Canvas LMS integration
- Analytics dashboard

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16, React 19, TypeScript |
| Database | PostgreSQL 12+ with pgvector |
| Auth | JWT + bcryptjs |
| Storage | AWS S3 |
| Deployment | AWS Amplify |
| Editor | Lexical |
| State | Zustand |

## Database Schema

**Tables:** `app.login` (users), `app.notes`, `app.documents`, `app.chunks` (embeddings)

**Search:**
- Full-text index on extracted text
- Vector index (ivfflat) on embeddings (1536-dim)

**IDs:** UUID v7 (cryptographically secure, sortable)

## References

- **Full Spec:** [docs/SRS.tex](docs/SRS.tex) and [docs/SRS.pdf](docs/SRS.pdf)
- **Architecture:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Phase 1 Details:** [SEARCH_ARCHITECTURE_PLAN.md](SEARCH_ARCHITECTURE_PLAN.md)
- **LLM Strategy:** [docs/LLM_STRATEGY.md](docs/LLM_STRATEGY.md)
- **Status:** [PROGRESS.md](PROGRESS.md)
