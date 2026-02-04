# Quick Start Guide for ct216 Deployment

Follow these steps to get the Dockerized app running on the ct2106 stack in a few minutes.

## 1. Prerequisites

- ct2106 network running (pgAdmin, Redis, Cloudflared)
- Docker + Docker Compose installed
- Tailscale connected so this server can reach `100.118.61.122:2345`

```bash
docker ps                    # should show pgadmin, redis, cloudflared
docker network inspect ct2106
nc -zv 100.118.61.122 2345   # confirm database port is reachable
```

## 2. Verify environment

`.env` already targets the shared `socsboard_user` account.

```bash
cat .env | grep -E "DATABASE|JWT|API"
```

Optional: rotate the JWT secret.

```bash
openssl rand -base64 32
# update JWT_SECRET in .env
```

## 3. Prepare database

Run the login-table migration against ct2106 over Tailscale.

```bash
psql "postgresql://socsboard_user:YL9wpfMiE273Vtn0mEJ1umY64hgh2E5iqgJafjzlwqsQUj6bjM@100.118.61.122:2345/ct2106" -f database/setup.sql
psql "postgresql://socsboard_user:YL9wpfMiE273Vtn0mEJ1umY64hgh2E5iqgJafjzlwqsQUj6bjM@100.118.61.122:2345/ct2106" -c "\\dt login"
```

## 4. Deploy ct216_web

```bash
docker compose up -d

docker ps | grep ct216_web
docker logs -f ct216_web
```

Wait for the build to finish and ensure logs show "Ready".

## 5. Internal verification

```bash
curl http://172.30.10.8:3000/api/health
```

Expected output: `{"status":"ok", ...}`. If it fails, review `docker logs ct216_web`.

## 6. Cloudflare Tunnel

In the Zero Trust dashboard, edit the existing tunnel and add a hostname:

- Subdomain: `ct216`
- Domain: `semyon.ie`
- Type: `HTTP`
- Service: `http://172.30.10.8:3000`

The current tunnel token (for reference) lives in [CLOUDFLARE_TUNNEL.md](./CLOUDFLARE_TUNNEL.md).

## 7. Public verification

```bash
curl https://your-domain.com/api/health
```

Then open the site:

- https://your-domain.com
- https://your-domain.com/register
- https://your-domain.com/login

## 8. Handy commands

```bash
docker logs -f ct216_web
docker compose restart
docker compose up -d --build
docker ps --filter "network=ct2106"
docker exec -it ct216_web sh
```

## 9. Troubleshooting

- **Container won't start**: check `docker logs ct216_web`, ensure `172.30.10.8` is free.
- **Database connection**: verify `pg-db-ct2106` is running and accessible on the ct2106 network:
  ```bash
  docker exec ct216_web ping -c 3 pg-db-ct2106
  docker exec ct216_web nc -zv pg-db-ct2106 5432
  ```
- **Tunnel issues**: `docker ps | grep cloudflare` and follow [CLOUDFLARE_TUNNEL.md](./CLOUDFLARE_TUNNEL.md).

## 10. Network diagram

```
Internet → Cloudflare CDN → Cloudflare Tunnel
    ↓
ct2106 Docker network (172.30.10.0/24)
    ├── 172.30.10.5 → pg-db-ct2106 (PostgreSQL)
    ├── 172.30.10.6 → pgadmin-ct2106
    ├── 172.30.10.7 → redis-ct2106
    └── 172.30.10.8 → ct216_web (Next.js)
```
