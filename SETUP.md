# Setup

Use `npm` for all package and script commands.

## Requirements

- Node.js 18+
- Docker, for local PostgreSQL and supporting services
- A `.env.local` copied from `.env.example`

## Local Development

```bash
npm install
cp .env.example .env.local
docker-compose up
npm run dev
```

The app runs at `http://localhost:3000`.

Fill at least these local values in `.env.local`:

| Area | Keys |
|---|---|
| Database | `DATABASE_URL` |
| Storage | `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_BUCKET` |
| Auth | `JWT_SECRET`, `NEXTAUTH_SECRET`, `AUTH_SECRET`, `SERVER_ENCRYPTION_SECRET` |
| Redis / queues | `REDIS_HOST`, `REDIS_PORT` |
| AI / RAG | `LLM_API_URL`, `LLM_API_KEY`, `LLM_MODEL`, `EMBEDDING_API_URL`, `EMBEDDING_API_KEY`, `EMBEDDING_MODEL`, `RERANK_API_URL`, `RERANK_API_KEY`, `RERANK_MODEL` |
| Email | `SES_REGION`, `SES_ACCESS_KEY_ID`, `SES_SECRET_ACCESS_KEY`, `SES_FROM_EMAIL` |

`MARKER_API_URL` enables Marker OCR. If it is unset, extraction falls back to the configured non-Marker paths where supported.

## Commands

```bash
npm run dev       # local Next.js dev server
npm run worker    # local BullMQ worker
npm run build     # production build
npm start         # run built app
npm run lint      # lint
npm run test:ci   # test suite
npm run migrate   # apply database migrations
```

## Production And Dev Deploys

Production is not on AWS Amplify/RDS. Both live environments run on the homelab Docker/Jenkins stack:

- `dev` branch -> `oghma-dev` Jenkins job -> `dev.oghmanotes.ie`
- `main` branch -> `oghma-prod` Jenkins job -> `oghmanotes.ie`

Deploy flow is `dev` to `main` via PR. Do not push directly to `main`.

Jenkins builds app and worker images, runs `node scripts/prebuild-migrate.mjs` against `MIGRATION_DATABASE_URL`, then replaces the relevant app and worker containers. Runtime env files are on the homelab:

- `/home/semyon/jenkins/env/oghma-dev.env`
- `/home/semyon/jenkins/env/oghma-prod.env`

See [infra/HOMELAB.md](infra/HOMELAB.md) for the running stack and [infra/AWS_INFRASTRUCTURE.md](infra/AWS_INFRASTRUCTURE.md) for the small set of AWS services still in use.

## Common Issues

**Database will not start:** check `docker-compose ps` and confirm `DATABASE_URL`.

**Uploads fail:** confirm the bucket exists, credentials are valid, and path-style settings match the storage provider.

**Worker jobs do not move:** start `npm run worker` locally, then check Redis settings and `app.canvas_import_jobs` rows.

**Production looks stale:** confirm the branch reached the matching Jenkins job, then check the live image/container logs on the homelab.
