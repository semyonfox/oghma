# Setup

## Local Development

Requirements: Node.js 18+, Docker

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Add AWS S3 credentials to .env.local
# STORAGE_ACCESS_KEY=...
# STORAGE_SECRET_KEY=...
# STORAGE_BUCKET=your-bucket-name

# Start PostgreSQL + app
docker-compose up

# In another terminal
npm run dev
```

App runs at `http://localhost:3000`

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
