# Setup

## Requirements

- Node.js 18+
- Docker (for local PostgreSQL)

## Local Development

```bash
# Install deps
npm install

# Copy the env template
cp .env.example .env.local

# Add your S3 credentials to .env.local:
# STORAGE_ACCESS_KEY=your-key
# STORAGE_SECRET_KEY=your-secret
# STORAGE_BUCKET=your-bucket-name

# Start the database (and app if you want)
docker-compose up

# In another terminal
npm run dev
```

App runs at `http://localhost:3000`.

## Production

Production is live on the homelab, not AWS Amplify/RDS.

Running stack:

- `oghma-prod` / `oghma-prod-worker` — production app + BullMQ worker
- `oghma-dev` / `oghma-dev-worker` — dev app + BullMQ worker
- `oghma-postgres` — PostgreSQL 17 + pgvector
- `oghma-redis` — BullMQ/cache/rate-limit Redis
- `oghma-rustfs` — S3-compatible object storage
- `oghma-nginx` + Cloudflare tunnel containers — public routing for `oghmanotes.ie` and `dev.oghmanotes.ie`

### Environment Variables

Runtime env files live on the homelab:

- `/home/semyon/jenkins/env/oghma-prod.env`
- `/home/semyon/jenkins/env/oghma-dev.env`

Important keys:

- `DATABASE_URL` — internal PostgreSQL URL. Include `search_path=app,public` so pgvector casts like `::vector` resolve correctly.
- `MIGRATION_DATABASE_URL` — admin/migrator PostgreSQL URL used by Jenkins before deploy.
- `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_BUCKET` — RustFS/S3-compatible storage.
- `REDIS_HOST`, `REDIS_PORT` — internal Redis.
- `SES_REGION`, `SES_ACCESS_KEY_ID`, `SES_SECRET_ACCESS_KEY`, `SES_FROM_EMAIL` — AWS SES email.
- `JWT_SECRET`, `NEXTAUTH_SECRET`, `SERVER_ENCRYPTION_SECRET` — generate with `openssl rand -base64 32`.
- `NEXT_PUBLIC_APP_URL`, `NEXTAUTH_URL`, `CORS_ORIGINS` — production/dev public URL config.
- `LLM_API_URL`, `LLM_API_KEY`, `LLM_MODEL` — AI chat.
- `EMBEDDING_API_URL`, `EMBEDDING_API_KEY`, `EMBEDDING_MODEL` — embeddings.
- `RERANK_API_URL`, `RERANK_API_KEY`, `RERANK_MODEL` — reranking.
- `MARKER_API_URL` or `DATALAB_API_KEY` — OCR path; if Marker is unset, code falls back to pdf-parse/Datalab-supported paths where available.

### Deploy

```bash
# Push to dev — Jenkins deploys to dev.oghmanotes.ie
git push origin dev

# To deploy to production (oghmanotes.ie), open a PR from dev → main.
# Do not push directly to main.
```

Jenkins builds app and worker images, runs migrations, then replaces the relevant containers.

## Common Issues

**Database won't start?**
- Check `docker-compose ps`
- Verify DATABASE_URL in .env.local

**S3 uploads failing?**
- Bucket exists? Credentials correct?
- IAM needs s3:PutObject, s3:GetObject permissions

**Build errors?**
- Try `npm install` again
- Delete `.next` folder and rebuild

**Production route still looks old?**
- Check the live image tag with `ssh ssh.semyon.ie 'docker ps --filter name=oghma'`
- Confirm the branch commit reached the matching Jenkins job (`dev` for dev, `main` for prod)
- Check container logs with `docker logs oghma-prod --tail 80` or `docker logs oghma-dev --tail 80`

## Commands

```bash
npm run dev      # Dev server
npm run build    # Production build
npm start        # Run built app
npm run lint     # Lint code
```
