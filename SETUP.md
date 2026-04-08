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

### Database (AWS RDS)

```bash
# Create PostgreSQL instance
# Make sure pgvector is installed

psql -h <endpoint> -U <user> -d <database> -c "CREATE EXTENSION vector;"
psql -h <endpoint> -U <user> -d <database> < database/schema.sql
```

### Environment Variables

Set these in AWS Amplify console (see `.env.example` for the full list):
- `DATABASE_URL` - PostgreSQL connection string
- `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_BUCKET` - S3 credentials
- `AWS_SES_REGION`, `AWS_SES_ACCESS_KEY_ID`, `AWS_SES_SECRET_ACCESS_KEY` - Email (SES)
- `JWT_SECRET`, `NEXTAUTH_SECRET`, `AUTH_SECRET`, `SERVER_ENCRYPTION_SECRET` - Generate with `openssl rand -base64 32`
- `NEXT_PUBLIC_APP_URL` - Your domain
- `REDIS_HOST`, `REDIS_PORT` - Redis/ElastiCache
- `SQS_QUEUE_URL` - Canvas import job queue
- `COHERE_API_KEY` - Embeddings + reranking
- `LLM_API_URL`, `LLM_API_KEY` - AI chat
- `MARKER_ASG_NAME`, `MARKER_API_URL` - PDF extraction (GPU worker)

### Deploy

```bash
# Push to dev — Amplify auto-deploys to dev.oghmanotes.ie
git push origin dev

# To deploy to production (oghmanotes.ie), open a PR from dev → main
```

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

## Commands

```bash
npm run dev      # Dev server
npm run build    # Production build
npm start        # Run built app
npm run lint     # Lint code
```