# OghmaNotes

A note-taking app that started as a CT216 assignment and somehow became slightly more ambitious than intended. 

Features:
- Markdown notes with a tree-based folder system
- User auth (register/login/password reset)
- PDF uploads to S3
- Soft delete (your data isn't truly gone for 7 days, so don't panic)
- JWT-based sessions

What's coming eventually:
- Fuzzy search (you can actually find your notes)
- AI chat with your notes (RAG-powered, because of course)
- Quiz generation (because suffering is mandatory)

## Quick Start

```bash
npm install
cp .env.example .env.local
# Add your S3 credentials to .env.local
docker-compose up
npm run dev
```

Visit `http://localhost:3000`. 

## Tech Stack

- Next.js 16 (frontend + API)
- PostgreSQL with pgvector (for when we eventually do semantic search)
- AWS S3 (file storage)
- Zustand (state management - simpler than Redux, fight me)
- Lexical editor (rich text, not markdown-only)

## Setup

See [SETUP.md](SETUP.md) for details. It's not complicated.

## Credits

Based on Notea (MIT licensed). See [docs/ATTRIBUTION.md](docs/ATTRIBUTION.md) for the full legalese.

## Team

- Samuel Regan
- Semyon Fox  
- Shreyansh Singh