# Local setup

> **Status:** Current developer guide
> **Last reviewed:** 2026-07-11
> **Source of truth for:** Running OghmaNotes locally

Use `npm` for every package and script command.

## Requirements

- Node.js 22
- npm
- Docker with Compose support

## Recommended: disposable mock environment

This path starts PostgreSQL, Redis, Qdrant, MinIO, Mailpit, and a deterministic fake AI provider. It uses synthetic data and does not need production credentials.

```bash
npm install
cp .env.mock.example .env.mock
npm run mock:up
npm run mock:seed
npm run dev:mock
```

Open `http://127.0.0.1:3311/login` and sign in with:

- Email: `student.e2e@example.com`
- Password: `E2ePassword123!`

The seed includes a sample paper and Markdown note. Keyword search works normally; the fake embedding provider returns a constant vector, so semantic-result ordering is intentionally not representative.

When finished, stop the services and delete their disposable volumes:

```bash
npm run mock:down
```

## Develop against your own services

Copy the committed template, then provide services you control:

```bash
cp .env.example .env.local
npm run dev
```

The app runs at `http://localhost:3000`. `.env.example` is the key inventory; keep real values only in ignored environment files or a secret store.

At minimum, configure these groups for the features you exercise:

| Area | Configuration |
|---|---|
| Database | `DATABASE_URL`; use `MIGRATION_DATABASE_URL` only for migrations |
| Vector search | `QDRANT_URL`, `QDRANT_COLLECTION`, and `QDRANT_API_KEY` when required by the provider |
| Object storage | `STORAGE_*` endpoint, bucket, region, credentials, and path-style settings |
| Authentication | App/auth signing secrets, encryption secret, and any enabled OAuth provider |
| Queues | Redis/BullMQ settings for the local worker, or the explicitly selected queue provider |
| AI | LLM, embedding, rerank, and optional OCR/Marker provider settings |
| Email | Cloudflare Email Sending account/token/from-address settings when testing real mail |

Start the background worker in a second terminal when testing imports or vault jobs:

```bash
npm run worker
```

## Common commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the normal development server |
| `npm run dev:mock` | Start the app against `.env.mock` on port 3311 |
| `npm run worker` | Start the background worker |
| `npm run build` | Create a production build |
| `npm run start` | Run the production build |
| `npm run lint` | Run ESLint |
| `npm run test:ci` | Run the test suite once |
| `npm run test:integration` | Run integration tests against configured test services |
| `npm run e2e:smoke` | Run the Playwright smoke suite |
| `npm run migrate` | Apply migrations using the migration connection |

## Troubleshooting

- **Mock services are unhealthy:** run `docker compose -f docker-compose.e2e.yml ps` and inspect the failing service logs.
- **Imports never advance:** make sure `npm run worker` uses the same database, queue prefix, Redis, storage, and Qdrant configuration as the app.
- **Uploads fail:** verify that the bucket exists and that endpoint/path-style settings match the storage provider.
- **Search fails:** verify Qdrant connectivity and that the configured collection matches the environment.
- **Schema errors appear:** apply migrations with the intended migration connection; never point a migration command at an unverified database.

Deployment is intentionally out of scope here. See [infra/HOMELAB.md](infra/HOMELAB.md) for the running environment and [docs/operations/import-worker.md](docs/operations/import-worker.md) for workload-specific operations.
