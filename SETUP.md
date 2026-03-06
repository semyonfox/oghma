# Setup Guide for OghmaNotes

Complete guide to get OghmaNotes running locally or in production.

## Prerequisites

### Local Development
- **Node.js** 18+ (recommended 20+)
- **Docker** & **Docker Compose** (easiest for full stack)
- **Git**

### Production (AWS)
- AWS account with permissions for:
  - RDS PostgreSQL
  - S3
  - ElastiCache (optional, for future job queues)
  - SES (email)
  - Amplify
- `aws` CLI configured

---

## Quick Start (Docker Compose)

This runs everything locally: PostgreSQL and the Next.js app. File uploads use AWS S3 (configured in `.env.local`).

```bash
# 1. Clone and install
git clone <repo>
cd oghmanotes
npm install

# 2. Create local env
cp .env.example .env.local

# 3. Configure AWS S3 credentials in .env.local
# Fill in:
# - STORAGE_ACCESS_KEY=your-aws-access-key
# - STORAGE_SECRET_KEY=your-aws-secret-key
# - STORAGE_BUCKET=your-local-bucket-name

# 4. Start the database
docker-compose up

# 5. In another terminal, run dev server
npm run dev
```

**Access points:**
- App: http://localhost:3000
- Database: postgres://oghmanotes:dev-password-change-in-prod@localhost:5432/oghmanotes
- S3: AWS S3 (credentials from .env.local)

---

## Manual Local Setup (Without Docker)

If you prefer to manage services manually:

```bash
# 1. Install & start PostgreSQL
# On macOS: brew install postgresql
# On Linux: apt-get install postgresql postgresql-contrib
# On Windows: Download installer

# 2. Enable pgvector extension
createdb oghmanotes
psql oghmanotes < database/schema.sql

# 3. Create .env.local
cp .env.example .env.local

# 4. Update DATABASE_URL & S3 credentials
# Database:
DATABASE_URL=postgresql://YOUR_USERNAME:YOUR_PASSWORD@localhost:5432/oghmanotes

# S3 (use same AWS credentials as production, or a test bucket):
STORAGE_ACCESS_KEY=your-aws-access-key
STORAGE_SECRET_KEY=your-aws-secret-key
STORAGE_BUCKET=your-local-dev-bucket

# 5. Install deps & start dev
npm install
npm run dev
```

**File Storage:**
- Uses AWS S3 for all file uploads (no separate local storage)
- Create a test S3 bucket for development
- Use same AWS IAM credentials as production, just different bucket name

---

## Production Setup (AWS)

### 1. Create PostgreSQL Database (RDS)

```bash
# Create RDS PostgreSQL instance
aws rds create-db-instance \
  --db-instance-identifier oghmanotes-prod \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --master-username admin \
  --master-user-password <SECURE_PASSWORD> \
  --allocated-storage 20 \
  --publicly-accessible false
```

**After creation:**
```bash
# Install pgvector extension in the database
psql -h <RDS_ENDPOINT> -U admin -d postgres -c "CREATE EXTENSION vector;"
psql -h <RDS_ENDPOINT> -U admin -d oghmanotes < database/schema.sql
```

### 2. Create S3 Bucket

```bash
aws s3 mb s3://oghmanotes-prod --region us-east-1

# Enable versioning for safety
aws s3api put-bucket-versioning \
  --bucket oghmanotes-prod \
  --versioning-configuration Status=Enabled
```

### 3. Configure AWS SES

```bash
# Verify your email domain
aws ses verify-domain-identity --domain oghmanotes.example.com

# Create IAM user for SES
aws iam create-user --user-name oghmanotes-app
aws iam attach-user-policy --user-name oghmanotes-app \
  --policy-arn arn:aws:iam::aws:policy/AmazonSESFullAccess
```

### 4. Set Up Environment Variables (Amplify)

In AWS Amplify console for your app:
- `DATABASE_URL`: `postgresql://admin:PASSWORD@rds-endpoint:5432/oghmanotes`
- `STORAGE_ENDPOINT`: `https://s3.amazonaws.com`
- `STORAGE_BUCKET`: `oghmanotes-prod`
- `STORAGE_ACCESS_KEY`: IAM access key
- `STORAGE_SECRET_KEY`: IAM secret
- `AWS_SES_ACCESS_KEY_ID`: SES IAM access key
- `AWS_SES_SECRET_ACCESS_KEY`: SES IAM secret
- `JWT_SECRET`: Generate with `openssl rand -base64 32`
- `NEXT_PUBLIC_APP_URL`: `https://your-domain.com`
- `NEXT_PUBLIC_API_URL`: `https://your-domain.com`

### 5. Configure Amplify Auto-Deploy

```bash
# Connect your repo to Amplify
# In AWS console: Create Amplify app > Connect repo > GitHub > Select oghmanotes

# Set up deployment branches:
# - dev branch → Preview deploys (optional)
# - prod branch → Auto-deploy to production
```

### 6. Deploy

```bash
# Push to prod branch (auto-triggers Amplify build)
git push origin feature-branch
# Create PR, review, merge to dev
git push origin dev
# Promote to prod when ready
git push origin prod
```

---

## Verifying Installation

### Local (Docker Compose)

```bash
# 1. Check services are running
docker-compose ps

# 2. Verify database
psql postgresql://oghmanotes:dev-password-change-in-prod@localhost:5432/oghmanotes -c "SELECT * FROM app.login;"

# 3. Check app is running
curl http://localhost:3000

# 4. Test registration
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!"}'

# 5. Verify S3 bucket is accessible
# Try uploading a test file via the UI after logging in
# Check AWS S3 console to see if file appears in your bucket
```

### Production (Amplify)

```bash
# Check Amplify deployment status
aws amplify list-apps --query "apps[?name=='OghmaNotes'].status"

# View logs
aws amplify get-backend-for-amplify-app --app-id <APP_ID>
```

---

## Common Issues

### "pgvector extension not found"
```bash
# Install pgvector in RDS
psql -h <RDS_ENDPOINT> -U admin -d postgres
CREATE EXTENSION IF NOT EXISTS vector;
```

### "Cannot connect to database"
- Verify DATABASE_URL is correct
- Check security group allows inbound on port 5432
- Ensure database exists: `psql ... -c "CREATE DATABASE oghmanotes;"`

### "S3 upload fails"
- Verify S3 bucket exists in correct AWS region
- Check IAM credentials have these permissions:
  - `s3:PutObject`
  - `s3:GetObject`
  - `s3:DeleteObject`
  - `s3:ListBucket`
- Verify bucket name and credentials in .env.local
- Check CloudWatch logs in AWS console for error details

### "Email not sending"
- Verify domain is verified in SES console
- Check SES is not in sandbox (request production access)
- Verify IAM user has SES:SendEmail permission

---

## Development Commands

```bash
npm run dev              # Start dev server (localhost:3000)
npm run build            # Build for production
npm start                # Run production build
npm run lint             # Check code with ESLint
npm run db:migrate       # Run migrations (future use)
npm run db:reset         # Wipe and reinit DB (dev only!)
```

---

## Database Migrations (Future)

Once you have a large schema, use proper migrations:

```bash
# Create a new migration
npm run db:migrate -- --name add_new_feature

# Apply pending migrations
npm run db:migrate:deploy

# Reset to clean state (dev only)
npm run db:reset
```

---

## Useful Links

- **PostgreSQL + pgvector:** https://ankane.org/pgvector
- **AWS RDS:** https://docs.aws.amazon.com/rds/
- **AWS Amplify:** https://docs.aws.amazon.com/amplify/
- **Next.js Deployment:** https://nextjs.org/docs/deployment

---

## Getting Help

- Check logs: `docker-compose logs -f web`
- Review errors in browser console (F12)
- Check Amplify build logs in AWS console
- Ask team on Slack/Discord

