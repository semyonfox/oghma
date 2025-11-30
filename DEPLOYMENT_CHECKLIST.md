# 🚀 Deployment Checklist

Use this checklist when deploying ct216 to your ct2106 stack.

## Pre-Deployment

- [ ] Docker and Docker Compose installed on server
- [ ] ct2106 network is up: `docker network inspect ct2106`
- [ ] Tailscale is connected and can reach `100.118.61.122:2345`
- [ ] IP `172.30.10.8` is free on `ct2106`

## Step 1: Prepare Environment

- [ ] `.env` exists and contains:
    - [ ] `DATABASE_URL` using `socsboard_user@100.118.61.122:2345/ct2106`
    - [ ] `NEXT_PUBLIC_API_URL=https://your-domain.com`
    - [ ] `JWT_SECRET` set to a strong random value (`openssl rand -base64 32`)
- [ ] `.env` is not committed to git

## Step 2: Database Setup

- [ ] Run migration:
    - [ ] `psql "postgresql://<redacted>" -f database/setup.sql`
- [ ] Verify table:
    - [ ] `psql "postgresql://<redacted>" -c "\\dt login"`

## Step 3: Build and Deploy

- [ ] In project root, run:
    - [ ] `docker compose build`
    - [ ] `docker compose up -d`
- [ ] Confirm container:
    - [ ] `docker ps | grep ct216_web`
- [ ] Tail logs and wait for Ready:
    - [ ] `docker logs -f ct216_web`

## Step 4: Verify Internal Access

- [ ] Health check OK:
    - [ ] `curl http://172.30.10.8:3000/api/health`
- [ ] Homepage loads:
    - [ ] `curl http://172.30.10.8:3000`

## Step 5: Configure Cloudflare Tunnel

- [ ] In Zero Trust dashboard:
    - [ ] Networks → Tunnels → select existing tunnel
    - [ ] Add hostname:
        - [ ] Subdomain: `ct216`
        - [ ] Domain: `semyon.ie`
        - [ ] Type: `HTTP`
        - [ ] URL: `http://172.30.10.8:3000`
- [ ] Wait 30–60 seconds for DNS/tunnel to settle

## Step 6: Verify Public Access

- [ ] Health check via domain: `curl https://your-domain.com/api/health`
- [ ] Homepage via browser: `https://your-domain.com`
- [ ] `/register` and `/login` load correctly

## Step 7: Functional Testing

- [ ] Create a test account via `/register`
- [ ] Verify row appears in `login` table
- [ ] Log in with that account
- [ ] JWT cookie present and app behaves as logged-in

## Step 8: Monitoring Setup

- [ ] Uptime check for `https://your-domain.com/api/health`
- [ ] Log monitoring wired to `docker logs ct216_web`
- [ ] Alerts on container restarts or frequent errors

## Step 9: Documentation & Handover

- [ ] Document final `.env` layout (without real secrets)
- [ ] Record deployment commands used
- [ ] Update team docs with URL + basic troubleshooting

## Step 10: Backup & Security

- [ ] DB backup strategy agreed for `ct2106`
- [ ] Secrets stored in password manager
- [ ] `.env` permissions tightened: `chmod 600 .env`
- [ ] Quick grep for secrets in git history completed

## Post-Deployment Verification

- [ ] App is accessible via HTTPS at `https://your-domain.com`
- [ ] Health endpoint returns `200 OK`
- [ ] Login and registration both work
- [ ] No obvious errors in browser console
- [ ] Container marked `Up` with restart policy `unless-stopped`

## Troubleshooting Commands

```bash
# Container status
docker ps -a | grep ct216

# Logs (last 100 lines)
docker logs --tail 100 ct216_web

# Restart container
docker compose restart

# Hard rebuild
docker compose down
docker compose build --no-cache
docker compose up -d

# Network connectivity (check database)
docker ps | grep pg-db-ct2106
docker exec ct216_web ping -c 3 pg-db-ct2106
docker exec ct216_web nc -zv pg-db-ct2106 5432

# Inspect ct2106 network
docker network inspect ct2106

# Verify tunnel container running
docker ps | grep cloudflare
```

## Rollback Plan

1. `docker compose down` to stop ct216_web
2. Inspect logs and fix the issue
3. Rebuild: `docker compose build`
4. Redeploy: `docker compose up -d`

## Success Criteria

- [x] All checklist items above completed
- [x] Users can register and log in
- [x] Monitoring and backups in place

## References

- Quick Start: `docs/QUICKSTART.md`
- Setup: `SETUP.md`
- Deployment guide: `docs/DEPLOYMENT.md`
- Cloudflare Tunnel: `docs/CLOUDFLARE_TUNNEL.md`

