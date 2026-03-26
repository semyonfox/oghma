# OghmaNotes

A note-taking app built for the CT216 software engineering module.

Features:
- Markdown notes with a tree-based folder system
- User auth (register/login/password reset)
- PDF uploads to S3
- Soft delete (notes are recoverable for 7 days)
- JWT-based sessions

Planned:
- Fuzzy search
- AI chat with your notes (RAG)
- Quiz generation

## Quick start

```bash
npm install
cp .env.example .env.local
# fill in S3 credentials in .env.local
docker-compose up
npm run dev
```

Visit `http://localhost:3000`.

## Tech stack

- Next.js 16 (frontend + API routes)
- PostgreSQL with pgvector
- AWS S3 (file storage)
- Zustand (state)
- Lexical (rich text editor)

## Setup

See [SETUP.md](SETUP.md).

## Credits

Based on Notea (MIT licensed).

## Team

- Samuel Regan
- Semyon Fox
- Shreyansh Singh