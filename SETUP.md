# Setup

## Local Development

**Requirements:** Node.js 18+, Docker

### Quick Start

```bash
npm install
cp .env.example .env.local
docker-compose up         # Terminal 1: PostgreSQL
npm run dev              # Terminal 2: Next.js dev server
```

App runs at `http://localhost:3000`

### Setup Details

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env.local
   # Add AWS S3 credentials:
   # STORAGE_ACCESS_KEY=...
   # STORAGE_SECRET_KEY=...
   # STORAGE_BUCKET=your-bucket-name
   ```

3. **Start database**
   ```bash
   docker-compose up
   # Postgres runs on localhost:5432
   # Database: oghmanotes
   ```

4. **Start dev server** (new terminal)
   ```bash
   npm run dev
   # Hot-reload enabled on port 3000
   ```

**Note:** Database schema with UUID v7 is already applied via docker-compose init. No migrations needed for local dev.

## Production

### Database (AWS RDS)

```bash
# Create PostgreSQL instance
# Ensure pgvector extension is installed

psql -h <endpoint> -U <user> -d <database> -c "CREATE EXTENSION vector;"
psql -h <endpoint> -U <user> -d <database> < database/schema.sql
```

### Environment

Set in AWS Amplify console:
- `DATABASE_URL`: PostgreSQL connection
- `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_BUCKET`: S3
- `AWS_SES_REGION`, `AWS_SES_ACCESS_KEY_ID`, `AWS_SES_SECRET_ACCESS_KEY`: Email
- `JWT_SECRET`: Generate with `openssl rand -base64 32`
- `NEXT_PUBLIC_APP_URL`: Your domain

### Deploy

```bash
git push origin prod
```

Amplify auto-deploys from `prod` branch.

## Troubleshooting

**Database fails**
- Check `docker-compose ps`
- Verify DATABASE_URL in .env.local

**S3 upload fails**
- Verify bucket exists, credentials correct
- Check IAM has s3:PutObject, s3:GetObject

**Build fails**
- Run `npm install` again
- Remove `.next` folder

## Commands

```bash
npm run dev      # Development
npm run build    # Production build
npm start        # Run build
npm run lint     # Lint code
```
