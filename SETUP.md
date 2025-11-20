# Setup

Use this guide when you want to work locally or run the production Docker image.

## 1. Local development

### Requirements

- Node.js 18+
- PostgreSQL (local or remote). Minimal schema is in `database/setup.sql`.

### Steps

```bash
npm install
cp .env.example .env.local   # adjust DATABASE_URL to point at your DB
npm run dev                  # http://localhost:3000
```

Populate Postgres by running the SQL in `database/setup.sql`. A simple local connection string looks like
`postgresql://postgres:postgres@localhost:5432/socsboard`.

## 2. Docker-based deployment (ct2106 stack)

### Prerequisites

- Docker + Docker Compose installed
- ct2106 Docker stack already running (PostgreSQL, pgAdmin, Redis, Cloudflare Tunnel)
- All containers on the same `ct2106` Docker network

### Environment configuration

The shared `.env` file already contains the correct database connection for the `socsboard_user` account:

```
DATABASE_URL=postgresql://socsboard_user:...@pg-db-ct2106:5432/ct2106
NEXT_PUBLIC_API_URL=https://your-domain.com
JWT_SECRET=... (replace with a strong value before going live)
```

If you need to regenerate the secret:

```bash
openssl rand -base64 32
```

### Database prep

Create the `login` table in ct2106:

```bash
# Using docker exec (recommended)
docker exec -i pg-db-ct2106 psql -U socsboard_user -d ct2106 < database/setup.sql
```

### Deploy the app

```bash
docker compose up -d              # build + start ct216_web
docker compose logs -f web        # follow logs
curl http://172.30.10.8:3000/...  # internal health check
./deploy.sh                      # optional helper script
```

### Cloudflare Tunnel

Point `your-domain.com` at `http://172.30.10.8:3000` using the existing tunnel. Full instructions live in [
`docs/CLOUDFLARE_TUNNEL.md`](docs/CLOUDFLARE_TUNNEL.md).

### Verification

```bash
docker ps -f name=ct216_web
curl http://172.30.10.8:3000/api/health
curl https://your-domain.com/api/health
```

Expected JSON:

```json
{
  "status": "ok",
  "timestamp": "...",
  "service": "ct216-project"
}
```

### Network map

```
ct2106 Docker network (172.30.10.0/24)
├── 172.30.10.5 → pg-db-ct2106 (PostgreSQL)
├── 172.30.10.6 → pgadmin-ct2106
├── 172.30.10.7 → redis-ct2106
└── 172.30.10.8 → ct216_web (Next.js)
```

### Updating / maintenance

```bash
git pull
docker compose down && docker compose up -d --build
docker logs -f ct216_web
```

If something breaks:

- Database issues: verify `pg-db-ct2106` is running: `docker ps | grep pg-db`
- Network issues: `docker network inspect ct2106`
- Tunnel issues: see [`docs/CLOUDFLARE_TUNNEL.md`](docs/CLOUDFLARE_TUNNEL.md)
- Container conflicts: ensure `172.30.10.8` isn't allocated elsewhere
- Still stuck? `docker compose restart`

- Database issues: verify Tailscale connectivity to `100.118.61.122:2345`
- Network issues: `docker network inspect ct2106`
- Tunnel issues: see [`docs/CLOUDFLARE_TUNNEL.md`](docs/CLOUDFLARE_TUNNEL.md)
- Container conflicts: ensure `172.30.10.8` isn’t allocated elsewhere
- Still stuck? `docker compose restart`
