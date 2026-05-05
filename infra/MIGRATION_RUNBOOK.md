# migration runbook: AWS Amplify → homelab

near-zero downtime cutover for oghmanotes.ie and dev.oghmanotes.ie.
the "downtime" is ~1 second during DNS propagation (Cloudflare is near-instant).

---

## what stays on AWS (free forever)

| service | why |
|---|---|
| chat Lambda | 7 invocations/month, free tier is 1M/month |
| S3 bucket | $0.03/month, not worth migrating |
| SQS queues | always free tier |
| IAM users | always free |
| ECR (2 images) | under 500MB free tier after cleanup |

## what moves to homelab

| service | homelab replacement |
|---|---|
| Amplify WEB_COMPUTE | Docker container, CF tunnel |
| RDS PostgreSQL | pgvector/pgvector:pg17 Docker container |
| ElastiCache | deleted (code has in-memory fallback) |
| NAT Gateway | deleted (nothing needed it) |
| Secrets Manager | env files on server |

---

## prerequisites

- [ ] homelab stack set up: `cd ~/server-stacks/oghma && bash setup.sh`
- [ ] CF tunnel created, credentials filled in (`cloudflared-credentials.json`, `cloudflared-config.yml`)
- [ ] oghma_app password set in `init-db.sql`, `.env.prod`, `.env.dev`
- [ ] `POSTGRES_ADMIN_PASSWORD` set in `.env`
- [ ] postgres healthy: `docker inspect oghma-postgres --format='{{.State.Health.Status}}'`
- [ ] Jenkins pipeline configured (see below)
- [ ] first Docker image built and deployed to `oghma-prod` and `oghma-dev`

---

## phase 1 — set up parallel environment (do this first, ~30 min)

### 1.1 create CF tunnel

1. go to https://one.dash.cloudflare.com → Zero Trust → Networks → Tunnels
2. create tunnel → name: `oghma-homelab` → connector: cloudflared
3. copy the tunnel UUID → paste into `cloudflared-config.yml` (replace `REPLACE_WITH_TUNNEL_UUID`)
4. download credentials JSON → save as `~/server-stacks/oghma/cloudflared-credentials.json`
5. in the tunnel → Public Hostnames tab, verify these are set (or cloudflared-config.yml handles it):
   - `oghmanotes.ie` → `http://oghma-prod:3000`
   - `dev.oghmanotes.ie` → `http://oghma-dev:3000`

### 1.2 set up Jenkins pipeline

at https://jenkins.semyon.ie:

1. New Item → Pipeline → name: `oghma-prod`
   - Build Triggers: ✓ GitHub hook trigger
   - Pipeline → Definition: Pipeline script from SCM
   - SCM: Git, repo URL, credentials, branch: `*/main`
   - Script Path: `Jenkinsfile`
2. New Item → Pipeline → name: `oghma-dev`
   - same, but branch: `*/dev`
3. in GitHub repo settings → Webhooks:
   - URL: `https://jenkins.semyon.ie/github-webhook/`
   - Content type: `application/json`
   - Events: push

### 1.3 first build

in Jenkins, trigger `oghma-prod` and `oghma-dev` manually.
this builds images and starts containers on the `oghma` network.

verify:
```bash
ssh semyon@server
docker ps --filter name=oghma
docker logs oghma-prod --tail 20
docker logs oghma-dev --tail 20
```

---

## phase 2 — migrate database (~5-15 min depending on data size)

> the app is still on AWS Amplify during this phase. users see no downtime.

### 2.1 data migration

```bash
# from your laptop, in the oghma repo:
bash scripts/migrate-rds-to-homelab.sh
```

this will:
- prompt for RDS oghma_admin password (get it from `~/server-stacks/oghma/.env.prod` → MIGRATION_DATABASE_URL, or RDS Secrets Manager)
- pg_dump the full RDS (3.2 GB, expect 2-5 minutes)
- restore to oghma-postgres container
- re-grant oghma_app permissions

### 2.2 verify data

```bash
ssh semyon@server
docker exec -it oghma-postgres psql -U oghma_admin oghma -c "SELECT COUNT(*) FROM app.users;"
docker exec -it oghma-postgres psql -U oghma_admin oghma -c "SELECT COUNT(*) FROM app.notes;"
```

compare counts with RDS (connect directly: `psql -h oghma.c9sac6iec8m8.eu-west-1.rds.amazonaws.com -U oghma_admin oghma`).

### 2.3 restart app containers with homelab DB

the `.env.prod` already points DATABASE_URL to `oghma-postgres` (not RDS).
when Jenkins ran the first build, it deployed against homelab DB.

if you want to verify manually:
```bash
ssh semyon@server
# restart prod so it picks up the DB (it should already be on homelab DB from first build)
docker restart oghma-prod
sleep 5
curl -s http://localhost:3100/api/health  # if you exposed a port
# or just check logs:
docker logs oghma-prod --tail 30
```

---

## phase 3 — DNS cutover (the near-zero downtime moment, ~30 seconds)

> **do this at a low-traffic time** (e.g. 03:00 IST)
> actual downtime: ~0-2 seconds (Cloudflare DNS propagation + CF tunnel retry)

### 3.1 lower DNS TTL (optional, do 5 min before)

in Cloudflare dashboard → DNS → records for `oghmanotes.ie` and `dev.oghmanotes.ie`:
- set TTL to 60 seconds (or leave as Auto — Cloudflare proxied records propagate instantly regardless)

### 3.2 take a final data snapshot

```bash
# on the AWS side: grab any writes in the last few minutes
PGPASSWORD='<rds_admin_pass>' pg_dump \
  --no-owner --no-acl --data-only \
  -h oghma.c9sac6iec8m8.eu-west-1.rds.amazonaws.com \
  -U oghma_admin oghma \
  -f /tmp/oghma-final-delta.dump

# restore to homelab (fast, data-only)
docker cp /tmp/oghma-final-delta.dump oghma-postgres:/tmp/delta.dump
docker exec oghma-postgres pg_restore --no-owner --no-acl \
  -U oghma_admin -d oghma --data-only --single-transaction \
  /tmp/delta.dump 2>/dev/null || true
docker exec oghma-postgres rm /tmp/delta.dump
```

### 3.3 start cloudflared

```bash
ssh semyon@server
cd ~/server-stacks/oghma
docker compose up -d cloudflared
docker logs oghma-cloudflared --tail 20
# should show: "Registered tunnel connection"
```

### 3.4 switch DNS

in Cloudflare dashboard → DNS:

| hostname | old value | new value |
|---|---|---|
| `oghmanotes.ie` | Amplify CNAME (e.g. `d3nmhn9o8j3uf3.cloudfront.net`) | your tunnel CNAME (e.g. `<uuid>.cfargotunnel.com`) |
| `dev.oghmanotes.ie` | Amplify CNAME | same tunnel CNAME |

click Save. Cloudflare propagates in <5 seconds (it's proxied).

### 3.5 verify

```bash
curl -I https://oghmanotes.ie/api/health
curl -I https://dev.oghmanotes.ie/api/health
# expect: HTTP/2 200
```

also open in browser and log in.

---

## phase 4 — AWS cleanup (after 24h of confirmed stability)

```bash
# snapshot RDS before deleting
aws rds create-db-snapshot \
  --db-instance-identifier oghma \
  --db-snapshot-identifier oghma-final-$(date +%Y%m%d)

# wait for snapshot to complete
aws rds wait db-snapshot-completed \
  --db-snapshot-identifier oghma-final-$(date +%Y%m%d)

# delete RDS (~$17/month saved)
aws rds delete-db-instance \
  --db-instance-identifier oghma \
  --skip-final-snapshot  # we already made one above

# delete Amplify app (~$5/month saved)
aws amplify delete-app --app-id d3nmhn9o8j3uf3

# delete Secrets Manager secrets (~$0.60/month saved)
aws secretsmanager delete-secret --secret-id oghmanotes/database --force-delete-without-recovery
aws secretsmanager delete-secret --secret-id oghmanotes/app-secrets --force-delete-without-recovery
aws secretsmanager delete-secret --secret-id oghmanotes/migrator --force-delete-without-recovery

# clean ECR to latest 2 images (stay under free tier)
# (run scripts/clean-ecr.sh or do manually via console)
```

---

## reverting to AWS (if something goes wrong)

in Cloudflare dashboard → DNS: point records back to Amplify CNAME.
propagates instantly. app is back on AWS within seconds.

---

## going back to full AWS scale

when ready to scale:

1. restore from snapshot:
   ```bash
   aws rds restore-db-instance-from-db-snapshot \
     --db-instance-identifier oghma \
     --db-snapshot-identifier oghma-final-<date> \
     --db-instance-class db.t3.micro
   ```
2. redeploy Amplify: `git push origin main` (Amplify app may need recreating — all config is in repo)
3. switch DNS back

---

## what you're learning here

**near-zero downtime** = decouple the data migration from the DNS switch.

the technique:
1. set up the new environment **completely** before touching DNS
2. migrate data **before** the switch (accept a small window of missed writes, or use replication)
3. switch DNS atomically (Cloudflare makes this near-instant)
4. the rollback path is DNS → old environment (also instant)

the key insight: DNS is the on/off switch. everything else is preparation.
