# OghmaNotes

A full-stack learning workspace for student notes, uploaded files and Canvas LMS material. It separates request-serving work from long-running ingestion and retrieval workloads so imported content can become searchable without blocking the main application.

> **Project provenance:** OghmaNotes began as a University of Galway team project by Samuel Regan, Semyon Fox and Shreyansh Singh. Its editor foundation incorporates MIT-licensed Notea components; see the repository attribution and licence material.

## Engineering highlights

- **Asynchronous ingestion:** a dedicated Node worker processes Canvas imports, file extraction, indexing and vault import/export jobs through Redis and BullMQ.
- **Retrieval architecture:** PostgreSQL holds relational ownership and content metadata; Qdrant stores vectors for scoped semantic search and retrieval-augmented chat.
- **Durable chat delivery:** background generation, persisted conversation state and replayable streamed events support reconnecting clients.
- **Student workflows:** notes, files, Markdown/rich-text editing, semantic search, cited chat, quizzes and FSRS review, assignments and vault import/export.
- **Deployment discipline:** Dockerized application and worker images, Jenkins build/test/migration/health-check stages, and documented development/production environments behind Cloudflare tunnels.
- **Reproducible verification:** unit, integration and Playwright suites; isolated local services and deterministic fake-AI fixtures for development and end-to-end tests.

## Architecture

```text
Browser
  │
  ▼
Next.js application ───────────────► PostgreSQL (ownership, metadata, state)
  │                                  Qdrant (vector retrieval)
  │                                  S3-compatible storage (files)
  ▼
Redis / BullMQ ───► Node worker ───► Canvas, extraction/OCR, AI providers
```

The application owns user-facing requests and durable relational state. The worker handles slow or retryable work; vector retrieval and object storage remain separate from the primary relational model.

## Technology

| Area | Technology |
| --- | --- |
| Application | Next.js, React, TypeScript |
| Data and retrieval | PostgreSQL, Qdrant, pgvector-compatible workflows |
| Async processing | Redis, BullMQ, Node worker |
| Files | S3-compatible object storage |
| AI pipeline | Configurable LLM, embedding, rerank and optional OCR providers |
| Delivery | Docker, Jenkins, Cloudflare Tunnel |
| Validation | Vitest, Playwright, ESLint, GitHub Actions |

## Run locally

The repository supports a disposable local stack with PostgreSQL, Redis, Qdrant, object storage and a deterministic fake AI provider.

```bash
npm install
cp .env.mock.example .env.mock
npm run mock:up
npm run mock:seed
npm run dev:mock
```

See [SETUP.md](./SETUP.md) for provider configuration, worker commands and environment details.

## Validation

```bash
npm run lint
npm run test:ci
npm run test:integration
npm run e2e:smoke
npm run build
```

## Documentation

Start with [docs/README.md](./docs/README.md) for the canonical documentation map. The most relevant technical references are the [architecture](./docs/engineering/architecture.md), [import pipeline](./docs/engineering/import-pipeline.md) and [deployment/operations](./infra/HOMELAB.md) documents.
