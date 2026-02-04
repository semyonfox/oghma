# Local Development Setup

Use this guide to set up a local development environment.

## Requirements

- Node.js 18+
- PostgreSQL (local or remote). Minimal schema is in `database/setup.sql`.

## Steps

```bash
npm install
cp .env.example .env.local   # adjust DATABASE_URL to point at your DB
npm run dev                  # http://localhost:3000
```

Populate Postgres by running the SQL in `database/setup.sql`. A simple local connection string looks like:

```
postgresql://postgres:postgres@localhost:5432/socsboard
```

Or to connect to your remote Docker databases over Tailscale:

```
postgresql://socsboard_user:YOUR_PASSWORD@100.118.61.122:2345/ct2106
```

## Docker Deployment

For deploying to the `ct2106` Docker network, see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).
