# Docker Deployment Guide (DEPRECATED)

> **⚠️ DEPRECATED:** This guide is for **local development only**. 
> 
> For **production AWS deployment**, see **[AMPLIFY_DEPLOYMENT.md](AMPLIFY_DEPLOYMENT.md)** instead.
>
> This Docker setup is maintained for:
> - Local testing with Docker Compose
> - Development environments
> - Cloudflare Tunnel access during development
>
> For AWS production, use AWS Amplify Hosting for the frontend and separate AWS services (Lambda/ECS) for the Python recommender.

## 1. Topology & Assumptions

- App runs as container `ct216_web` on the `ct2106` Docker network
- Database is **PostgreSQL container** (`pg-db-ct2106`) on the same network at `172.30.10.5:5432`
- Database user is **`socsboard_user`** on database **`ct2106`**
- Public URL is **https://ct216.semyon.ie** via Cloudflare Tunnel

## 2. Important files

- `Dockerfile` – multi-stage production build
- `docker-compose.yml` – runs `ct216_web` on the `ct2106` network
- `.env` – runtime configuration (DB, JWT, URL)
- `database/setup.sql` – creates `login` table
- `deploy.sh` – helper script to build & restart the app
- `src/app/api/health/route.js` – health endpoint used for checks

## 3. Environment variables (.env)

The `.env` used for local network deployment should look like:

```bash
# Database (PostgreSQL container on ct2106 network)
DATABASE_URL=postgresql://socsboard_user:YOUR_PASSWORD@pg-db-ct2106:5432/ct2106
DATABASE_HOST=pg-db-ct2106
DATABASE_PORT=5432
DATABASE_USER=socsboard_user
DATABASE_PASSWORD=YOUR_PASSWORD
DATABASE_NAME=ct2106

# Public API URL (through Cloudflare)
NEXT_PUBLIC_API_URL=https://ct216.semyon.ie

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

Run the migration to create the `login` table:

```bash
# Using docker exec (recommended)
docker exec -i pg-db-ct2106 psql -U socsboard_user -d ct2106 < database/setup.sql

# Verify table created
docker exec -i pg-db-ct2106 psql -U socsboard_user -d ct2106 -c "\\dt login"
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
curl https://ct216.semyon.ie/api/health
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

## 10. Deployment Checklist

Use this checklist when deploying to ensure all steps are completed:

### Pre-Deployment

- [ ] Docker and Docker Compose installed on server
- [ ] ct2106 network is up: `docker network inspect ct2106`
- [ ] All prerequisites services running (PostgreSQL, Redis, Cloudflare Tunnel)
- [ ] IP `172.30.10.8` is free on `ct2106`

### Step 1: Prepare Environment

- [ ] `.env` exists and contains:
    - [ ] `DATABASE_URL` using `socsboard_user@pg-db-ct2106:5432/ct2106`
    - [ ] `NEXT_PUBLIC_API_URL=https://ct216.semyon.ie`
    - [ ] `JWT_SECRET` set to a strong random value (`openssl rand -base64 32`)
- [ ] `.env` is not committed to git

### Step 2: Database Setup

- [ ] Run migration: `docker exec -i pg-db-ct2106 psql -U socsboard_user -d ct2106 < database/setup.sql`
- [ ] Verify table: `docker exec -i pg-db-ct2106 psql -U socsboard_user -d ct2106 -c "\\dt login"`

### Step 3: Build and Deploy

- [ ] In project root, run: `docker compose up -d --build`
- [ ] Confirm container: `docker ps | grep ct216_web`
- [ ] Tail logs and wait for Ready: `docker logs -f ct216_web`

### Step 4: Verify Internal Access

- [ ] Health check OK: `curl http://172.30.10.8:3000/api/health`
- [ ] Homepage loads: `curl http://172.30.10.8:3000`

### Step 5: Configure Cloudflare Tunnel

- [ ] In Zero Trust dashboard:
    - [ ] Networks → Tunnels → select existing tunnel
    - [ ] Add hostname:
        - [ ] Subdomain: `ct216`
        - [ ] Domain: `semyon.ie`
        - [ ] Type: `HTTP`
        - [ ] URL: `http://172.30.10.8:3000`
- [ ] Wait 30–60 seconds for DNS/tunnel to settle

### Step 6: Verify Public Access

- [ ] Health check via domain: `curl https://ct216.semyon.ie/api/health`
- [ ] Homepage via browser: `https://ct216.semyon.ie`
- [ ] `/register` and `/login` load correctly

### Step 7: Functional Testing

- [ ] Create a test account via `/register`
- [ ] Verify row appears in `login` table
- [ ] Log in with that account
- [ ] JWT cookie present and app behaves as logged-in

### Step 8: Monitoring & Backup

- [ ] Uptime check for `https://ct216.semyon.ie/api/health`
- [ ] Log monitoring wired to `docker logs ct216_web`
- [ ] DB backup strategy in place for `ct2106`
- [ ] `.env` permissions tightened: `chmod 600 .env`

### Step 9: Post-Deployment Verification

- [ ] App is accessible via HTTPS at `https://ct216.semyon.ie`
- [ ] Health endpoint returns `200 OK`
- [ ] Login and registration both work
- [ ] No obvious errors in browser console
- [ ] Container marked `Up` with restart policy `unless-stopped`

## 11. Rollback & Troubleshooting

**Container won't start**
```bash
docker logs ct216_web
docker network inspect ct2106 | grep 172.30.10.8
```

**Database connection errors**
```bash
# Verify database container running
docker ps | grep pg-db-ct2106

# Check network connectivity from ct216_web
docker exec ct216_web ping -c 3 pg-db-ct2106
docker exec ct216_web nc -zv pg-db-ct2106 5432
```

**Tunnel issues / 502 errors**
```bash
# Verify app is healthy first
curl http://172.30.10.8:3000/api/health

# Check cloudflared container
docker ps | grep cloudflare
docker logs $(docker ps -q --filter ancestor=cloudflare/cloudflared:latest)
```

**Quick recovery**
```bash
docker compose restart        # Restart container
docker compose down && docker compose up -d --build  # Full rebuild
```

## 12. Security Checklist

- [ ] `JWT_SECRET` is long and random (≥ 32 bytes)
- [ ] `.env` is not committed to git
- [ ] Database password is stored only in `.env` and password manager
- [ ] Database access restricted to containers on `ct2106` network only
- [ ] Cloudflare HTTPS enforced for `ct216.semyon.ie`
- [ ] Secrets cleared from git history: `git log --all --full-history -- .env`

## 13. Where to look next

- High-level overview: `README.md`
- Local development setup: `SETUP.md`
- One-page quick reference: `docs/QUICKSTART.md`
- Tunnel configuration: `docs/CLOUDFLARE_TUNNEL.md`
