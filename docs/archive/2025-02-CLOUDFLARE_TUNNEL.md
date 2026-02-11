# Cloudflare Tunnel Configuration for ct216

Your existing Cloudflare tunnel needs to be updated to route traffic to the ct216 web app.

## Current Setup

Your cloudflared container is running with tunnel token:

```
eyJhIjoiMTczNzBkOGM0MjE5MTBjYzJiM2NhNTQ2OTI2NWUzN2QiLCJ0IjoiOWU3M2Y3NmMtMjljOS00YWIwLTgyNDEtMGE2ZDYxYzhlMTdlIiwicyI6Ik5ESTBObUl6WmpBdFpqZ3dOaTAwWVRSakxXSTNNbVF0TURFMU5UTTRaRE0xWmpReiJ9
```

## Required DNS/Routing Updates

You need to configure your Cloudflare Tunnel to route `your-domain.com` to the ct216 web container at
`172.30.10.8:3000`.

### Option 1: Using Cloudflare Dashboard (Recommended)

1. Go to [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)
2. Navigate to **Networks** → **Tunnels**
3. Select your existing tunnel
4. Go to **Public Hostname** tab
5. Click **Add a public hostname**
6. Configure:
    - **Subdomain**: `ct216`
    - **Domain**: `semyon.ie`
    - **Type**: `HTTP`
    - **URL**: `172.30.10.8:3000`
7. Click **Save**

### Option 2: Using cloudflared CLI

If you prefer using configuration files:

1. **Check your current tunnel ID and credentials location:**
   ```bash
   docker exec -it cloudflare/cloudflared cloudflared tunnel info
   ```

2. **Create/update tunnel config** (if using config file method instead of token):

   Create `~/.cloudflared/config.yml` on your host:
   ```yaml
   tunnel: <YOUR_TUNNEL_ID>
   credentials-file: /etc/cloudflared/cred.json

   ingress:
     - hostname: your-domain.com
       service: http://172.30.10.8:3000
     - hostname: pgadmin.semyon.ie  # Optional - if you want to expose pgAdmin
       service: http://172.30.10.6:80
     - service: http_status:404
   ```

3. **If using token-based tunnel (your current setup):**

   You'll need to update the tunnel configuration through the Cloudflare dashboard (Option 1 above).
   Token-based tunnels cannot use config files for ingress rules.

### Option 3: DNS Only (If tunnel already routes wildcard)

If your tunnel is already configured to route `*.semyon.ie` to your server:

1. Ensure DNS record exists:
   ```bash
   # This might already be automatic via tunnel
   # Verify: dig your-domain.com
   ```

2. Add reverse proxy rule if using nginx/traefik on the host

## Verification

After configuration, test the tunnel:

```bash
# From your server
curl http://172.30.10.8:3000/api/health

# From internet
curl https://your-domain.com/api/health
```

Expected response:

```json
{
  "status": "ok",
  "timestamp": "2025-11-20T...",
  "service": "ct216-project"
}
```

## Troubleshooting

### Tunnel shows offline

```bash
# Check cloudflared container logs
docker logs -f $(docker ps -q --filter ancestor=cloudflare/cloudflared:latest)
```

### 502 Bad Gateway

- Verify ct216_web is running: `docker ps | grep ct216`
- Check ct216_web logs: `docker logs -f ct216_web`
- Verify network connectivity: `docker exec ct216_web ping -c 3 172.30.10.5`

### Connection timeout

- Ensure firewall allows traffic on port 3000
- Verify container is listening: `docker exec ct216_web netstat -tlnp | grep 3000`

## Network Topology

```
Internet → Cloudflare CDN
    ↓
Cloudflare Tunnel (Token-based, network_mode: host)
    ↓
Docker Network ct2106 (172.30.10.0/24)
    ├── 172.30.10.5 - pg-db-ct2106 (PostgreSQL)
    ├── 172.30.10.6 - pgadmin-ct2106
    ├── 172.30.10.7 - redis-ct2106
    └── 172.30.10.8 - ct216_web (Next.js) ← NEW
```

## Quick Reference

- **Public URL**: https://your-domain.com
- **Internal IP**: 172.30.10.8
- **Internal Port**: 3000
- **Health Check**: https://your-domain.com/api/health
- **Database**: pg-db-ct2106 (172.30.10.5:5432)

