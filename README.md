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

## Prerequisites

- Node.js 22+
- npm
- Docker Engine with Docker Compose for mock and integration services
- For browser tests, Playwright Chromium and its OS dependencies

Use **npm** for this repository.

## Quick start: disposable mock environment

This path starts local PostgreSQL, Redis, Qdrant, MinIO, Mailpit and a deterministic fake-AI provider. It is intended for development, not representative AI quality.

```bash
npm ci
cp .env.mock.example .env.mock
npm run mock:up
npm run mock:seed
npm run dev:mock
```

Open http://127.0.0.1:3311/login and sign in with:

```text
student.e2e@example.com
E2ePassword123!
```

The mock stack does not automatically start the background worker. Start it only when exercising imports, indexing or other queued work:

```bash
# Second terminal
node scripts/dev/run-mock.mjs npm run worker

# Verify its queue dependencies
node scripts/dev/run-mock.mjs npm run worker:healthcheck
```

Stop and remove the disposable stack when finished:

```bash
npm run mock:down
```

## Development with your own services

Copy `.env.example` to `.env.local` and configure PostgreSQL, Redis, Qdrant, S3-compatible storage, auth secrets and the providers you control:

```bash
cp .env.example .env.local
npm run dev
```

The worker does not load `.env.local` automatically. In a second POSIX shell, explicitly load the same environment before starting it:

```bash
set -a
. ./.env.local
set +a
npm run worker
```

App and worker must use matching database, Redis/queue, Qdrant, storage and provider configuration.

## Validate

```bash
npm run lint
npm run test:ci
npm run build
```

For isolated integration services, use a disposable database only—`e2e:reset` intentionally resets it:

```bash
cp .env.e2e.example .env.e2e
npm run e2e:services:up
npm run e2e:reset
npm run test:integration
npm run e2e:services:down
```

Install Chromium without OS packages when they are already available:

```bash
npm exec playwright install chromium
npm run e2e:smoke -- --workers=1
```

The smoke suite is available for local verification; check its current result rather than assuming every browser/platform combination is green.

## Container images

The application and worker images are independently buildable:

```bash
docker build -t oghma:local .
docker build -f Dockerfile.worker -t oghma-worker:local .
```

The root Compose file is a homelab/Jenkins convenience configuration, not a fresh-clone production deployment. A real deployment needs private environment configuration plus PostgreSQL, Redis/BullMQ, Qdrant, S3-compatible storage, auth and provider services. Follow [infra/HOMELAB.md](./infra/HOMELAB.md), [the worker runbook](./docs/operations/import-worker.md) and the `Jenkinsfile` rather than copying private operator paths.

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

## Documentation

Start with [docs/README.md](./docs/README.md) for the canonical documentation map. The most relevant technical references are the [architecture](./docs/engineering/architecture.md), [import pipeline](./docs/engineering/import-pipeline.md) and [deployment/operations](./infra/HOMELAB.md) documents.
