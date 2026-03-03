# OghmaNotes Documentation

## Overview
OghmaNotes is an AI-assisted note-taking app focused on semantic search, RAG chat, and structured study workflows. This documentation set consolidates setup, architecture, and development guidance.

## Quick Start (Local)
1. Install dependencies: `npm install`
2. Configure environment: copy `.env.example` to `.env.local` and fill values
3. Start dev server: `npm run dev`

## Authentication & Database Setup
Authentication is a custom JWT + HTTP-only cookie flow backed by PostgreSQL.

### Requirements
- PostgreSQL running locally (or via Docker)
- `DATABASE_URL` and `JWT_SECRET` set in `.env.local`

### Docker Setup (Recommended)
```bash
docker run -d --name oghmanotes-db \
  -e POSTGRES_USER=notes_user \
  -e POSTGRES_PASSWORD=notes_password \
  -e POSTGRES_DB=oghmanotes \
  -p 5432:5432 \
  postgres:16-alpine

psql postgresql://notes_user:notes_password@localhost:5432/oghmanotes < database/schema.sql
```

### Environment Variables (Local)
```env
DATABASE_URL=postgresql://notes_user:notes_password@localhost:5432/oghmanotes
JWT_SECRET=<32-character-hex>
NODE_ENV=development
NEXT_PUBLIC_API_URL=http://localhost:3000
```

Generate a secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Verify Auth
```bash
curl -i http://localhost:3000/notes
```
Expected: redirect to `/login` when not authenticated.

## Data Storage
Notes and tree data are stored in S3-compatible storage via `src/lib/storage`. Configure the S3/MinIO settings in `.env.local`:

```env
STORAGE_BUCKET=your-bucket-name
STORAGE_ACCESS_KEY=your-access-key
STORAGE_SECRET_KEY=your-secret-key
STORAGE_REGION=us-east-1
STORAGE_ENDPOINT=https://s3.amazonaws.com
STORAGE_PATH_STYLE=false
STORAGE_PREFIX=oghma
```

## API Overview
Core endpoints:
- `GET /api/notes` list notes
- `GET /api/notes/:id` note details
- `POST /api/notes` create note
- `PUT /api/notes/:id` update note
- `DELETE /api/notes/:id` delete note
- `GET /api/tree` note tree
- `POST /api/tree` mutate tree
- `GET /api/settings` user settings
- `POST /api/settings` update settings

## Architecture Summary
- Next.js App Router for frontend + API routes
- PostgreSQL for auth and user data
- S3-compatible storage for notes and assets
- JWT authentication with HTTP-only cookies

## Development Notes
- API auth routes live in `src/app/api/auth/*`
- Database connection via `src/database/pgsql.js`
- Notes storage adapters in `src/lib/notes/storage/`

## Attribution
This project integrates components and patterns from Notea (MIT License). See `docs/ATTRIBUTION.md` for details.
