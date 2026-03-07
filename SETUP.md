# Setup

## Local Development

**Requirements:** Node.js 18+, Docker

### Quick Start

```bash
npm install
cp .env.example .env.local
docker-compose up  # Terminal 1
npm run dev        # Terminal 2
```

App at `http://localhost:3000`

### Setup Details

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env.local
   # Add AWS S3 credentials (optional for local dev):
   # STORAGE_ACCESS_KEY=...
   # STORAGE_SECRET_KEY=...
   # STORAGE_BUCKET=...
   ```

3. **Start database**
   ```bash
   docker-compose up
   ```
   
   PostgreSQL runs on `localhost:5432`, database `oghmanotes`. Schema applied automatically.

4. **Start dev server** (new terminal)
   ```bash
   npm run dev
   ```
   
   Hot-reload on port 3000.

## Production

### Database (AWS RDS)

```bash
# Create PostgreSQL 12+ instance with pgvector extension
psql -h <endpoint> -U <user> -d <database> -c "CREATE EXTENSION vector;"
psql -h <endpoint> -U <user> -d <database> < database/schema.sql
```

### Environment (AWS Amplify)

- `DATABASE_URL`: PostgreSQL connection
- `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_BUCKET`: S3
- `AWS_SES_REGION`, `AWS_SES_ACCESS_KEY_ID`, `AWS_SES_SECRET_ACCESS_KEY`: Email
- `JWT_SECRET`: `openssl rand -base64 32`
- `NEXT_PUBLIC_APP_URL`: Your domain

### Deploy

```bash
git push origin prod
```

Auto-deploys from `prod` branch.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Database fails | Check `docker-compose ps`, verify DATABASE_URL |
| S3 upload fails | Verify bucket exists, IAM has s3:PutObject, s3:GetObject |
| Build fails | Run `npm install` again, remove `.next` folder |

## Commands

```bash
npm run dev      # Development
npm run build    # Production build
npm start        # Run built app
npm run lint     # Lint code
```
