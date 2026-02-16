# Local Development Setup

Use this guide to set up a local development environment.

## Requirements

- Node.js 18+
- **MariaDB 11+** (local or remote) - Native vector support for AI features
  - Minimal schema is in `database/setup.sql`
  - See `docs/MARIADB_MIGRATION.md` for migration from PostgreSQL

## Steps

```bash
npm install
cp .env.example .env.local   # adjust DATABASE_URL to point at your MariaDB
npm run dev                  # http://localhost:3000
```

Populate MariaDB by running the SQL in `database/setup.sql`. A simple local connection string looks like:

```
mysql://<redacted>
```

Or to connect to your remote Docker databases over Tailscale:

```
mysql://<redacted>
```

## Why MariaDB?

**Migrating from PostgreSQL to MariaDB for:**
- Native vector operations (better AI/ML support)
- Superior performance for vector embeddings
- Stores relational data just like PostgreSQL
- Better integration with AI recommendation systems

See `docs/MARIADB_MIGRATION.md` for detailed migration guide.

## Docker Deployment

For deploying to the `ct2106` Docker network, see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).
