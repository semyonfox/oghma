# Docker Deployment Guide (Canonical)

This is the main reference for deploying the ct216 app to your ct2106 stack with Docker and Cloudflare Tunnel.

## 1. Topology & Assumptions

- App runs as container `ct216_web` on the existing `ct2106` Docker network
- Database is **external PostgreSQL** reachable at `100.118.61.122:2345`
- Database user is **`socsboard_user`** on database **`ct2106`**
- Public URL is **https://your-domain.com** via Cloudflare Tunnel

## 2. Important files

- `Dockerfile` – multi-stage production build
- `docker-compose.yml` – runs `ct216_web` on the `ct2106` network
- `.env` – runtime configuration (DB, JWT, URL)
- `database/setup.sql` – creates `login` table
- `deploy.sh` – helper script to build & restart the app
- `src/app/api/health/route.js` – health endpoint used for checks

## 3. Environment variables (.env)

The `.env` used in production should look like:

```bash
# Database (shared socsboard account over Tailscale)
DATABASE_URL=postgresql://socsboard_user:YOUR_PASSWORD@100.118.61.122:2345/ct2106
DATABASE_HOST=100.118.61.122
DATABASE_PORT=2345
DATABASE_USER=socsboard_user
DATABASE_PASSWORD=YOUR_PASSWORD
DATABASE_NAME=ct2106

# Public API URL (through Cloudflare)
NEXT_PUBLIC_API_URL=https://your-domain.com

# Authentication
JWT_SECRET=your-long-random-secret

# Runtime
NODE_ENV=production
PORT=3000
```

For examples/templates see:

- `.env.example` – annotated example
- `.env.production.template` – copy/paste starting point

## 4. Database preparation

Run the migration once to create the `login` table:

```bash
psql "postgresql://socsboard_user:YOUR_PASSWORD@100.118.61.122:2345/ct2106" \
  -f database/setup.sql

# Optional: verify
psql "postgresql://socsboard_user:YOUR_PASSWORD@100.118.61.122:2345/ct2106" \
  -c "\\dt login"
```

## 5. Build & run with Docker Compose

From the project root:

```bash
# Build image and start ct216_web
docker compose up -d

# Or with a clean rebuild
docker compose down
docker compose up -d --build

# Check status
docker ps | grep ct216_web

# Tail logs
docker logs -f ct216_web
```

The `docker-compose.yml` wires the container into the `ct2106` network and assigns IP `172.30.10.8`.

## 6. Health checks

Internal health endpoint:

```bash
curl http://172.30.10.8:3000/api/health
```

Expected JSON:

```json
{"status":"ok","timestamp":"...","service":"ct216-project"}
```

## 7. Cloudflare Tunnel configuration

Use the existing token-based tunnel (see `docs/CLOUDFLARE_TUNNEL.md` for the exact token). In the Zero Trust dashboard:

1. Go to **Networks → Tunnels**
2. Select your tunnel
3. Add a **Public hostname**:
    - Subdomain: `ct216`
    - Domain: `semyon.ie`
    - Type: `HTTP`
    - URL: `http://172.30.10.8:3000`

After saving, test:

```bash
curl https://your-domain.com/api/health
```

## 8. Common operations

```bash
# Restart container
docker compose restart

# View logs
docker logs -f ct216_web

# Exec into container shell
docker exec -it ct216_web sh

# See all containers on ct2106 network
docker ps --filter "network=ct2106"
```

## 9. Troubleshooting

**Container won’t start**

```bash
docker logs ct216_web
docker network inspect ct2106 | grep 172.30.10.8
```

**Database connection errors**

```bash
# From host
nc -zv 100.118.61.122 2345

# From container
docker exec ct216_web nc -zv 100.118.61.122 2345
```

**Tunnel issues / 502s**

```bash
# Verify app is healthy first
curl http://172.30.10.8:3000/api/health

# Check cloudflared container
docker ps | grep cloudflare
```

## 10. Security checklist

- [ ] `JWT_SECRET` is long and random (≥ 32 bytes)
- [ ] `.env` is not committed to git
- [ ] Database password is stored only in `.env` and password manager
- [ ] Database access restricted to containers on `ct2106` network only
- [ ] Cloudflare HTTPS enforced for `your-domain.com`

## 11. Where to look next

- High-level overview: `README.md`
- Local/dev vs prod split: `SETUP.md`
- One-page deployment flow: `docs/QUICKSTART.md`
- Step-by-step sign-off: `DEPLOYMENT_CHECKLIST.md`
- Tunnel specifics: `docs/CLOUDFLARE_TUNNEL.md`
