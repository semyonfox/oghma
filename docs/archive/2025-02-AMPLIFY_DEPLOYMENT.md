# AWS Amplify Deployment Guide (Primary)

Deploy a pnpm monorepo (Next.js frontend + Python recommender) to AWS Amplify Hosting.

---

## Overview

This project uses a **pnpm workspace monorepo** with multiple apps:

- **Frontend:** `apps/web` (Next.js 16)
- **Recommender API:** `apps/recommender` (Python FastAPI/Flask)
- **Shared packages:** `packages/*` (TypeScript types, utilities)

AWS Amplify is the **recommended deployment target** because it:
- Natively supports pnpm monorepos via `AMPLIFY_MONOREPO_APP_ROOT`
- Hosts Next.js frontend directly with optimized builds
- Integrates with GitHub for automatic CI/CD
- Provides edge caching and CDN for static assets
- Supports environment variables and secrets management

---

## Architecture

### Deployment Strategy

```
┌─────────────────────────────────────────┐
│   AWS Amplify Hosting (Frontend)        │
│   ├─ apps/web (Next.js)                 │
│   └─ Build: pnpm install → pnpm build   │
└──────────────┬──────────────────────────┘
               │ HTTPS (CloudFront CDN)
               ├─ Static assets (JS/CSS/images)
               ├─ Next.js SSR endpoints
               └─ API routes to recommender
               
┌──────────────────────────────────────────┐
│  AWS Lambda / ECS / App Runner           │
│  apps/recommender (Python FastAPI)       │
│  ├─ POST /recommend - Get recommendations│
│  └─ GET /health - Health check           │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│  AWS RDS PostgreSQL (Database)           │
│  ├─ User data (login table)              │
│  └─ Events, societies, recommendations   │
└──────────────────────────────────────────┘
```

### Why Separate the Recommender?

Yes, deploy the **Python recommender separately** for these reasons:

1. **Different runtime:** Python ≠ Node.js (Amplify is optimized for JS/TS)
2. **Different scaling:** ML models need GPU (Lambda doesn't support GPU easily)
3. **Different dependencies:** Python scientific libraries (pandas, sklearn) vs Node.js
4. **Independent updates:** Recommendation algorithms updated without frontend redeploys
5. **Cost optimization:** Pay-per-request (Lambda) vs always-on (Amplify)

---

## Prerequisites

### Local Setup
- Node.js 25.2.1 (via mise)
- pnpm 9+
- Python 3.13+
- Docker (optional, for local testing)

### AWS Account
- AWS Account with **Amplify**, **RDS**, **Lambda** (or ECS), **IAM** services enabled
- GitHub connected to AWS Console
- IAM user/role with appropriate permissions

### Repository
- GitHub repository connected (Amplify will auto-detect pushes)
- `pnpm-workspace.yaml` at root (already exists)
- Branch protection rules optional but recommended

---

## Part 1: Deploy Frontend (Next.js) to Amplify

### Step 1: Create Amplify App

1. **AWS Console** → **Amplify** → **Create new app**
2. **Connect repository:**
   - Repository: Choose your GitHub repo
   - Branch: Select `main` (or your default branch)
   - Click **Next**
3. **Configure build settings:**
   - Build commands: Use defaults or custom (see below)
   - Click **Next**
4. **Review and create** → **Save and deploy**

### Step 2: Configure Amplify Build Settings

Amplify needs to know:
1. This is a **pnpm monorepo**
2. The app root is **`apps/web`**
3. Build command uses **pnpm** (not npm)

**Option A: Via Amplify Console (Recommended)**

1. Go to **Amplify Console** → Your app → **Build settings**
2. Edit `amplify.yml`:

```yaml
version: 1
applications:
  - appRoot: apps/web
    frontend:
      phases:
        preBuild:
          commands:
            - npm install -g pnpm
            - pnpm install --frozen-lockfile
        build:
          commands:
            - pnpm build
      artifacts:
        baseDirectory: .next
        files:
          - '**/*'
      cache:
        paths:
          - node_modules/**/*
          - .next/cache/**/*
    envFile: .env.production
```

**Option B: Commit amplify.yml to repo** (Advanced)

Create `.amplifyrc.yml` or `amplify.yml` at repo root (Amplify auto-detects):

```yaml
version: 1
backend:
  phases:
    build:
      commands:
        - echo "No backend configured for frontend"
frontend:
  phases:
    preBuild:
      commands:
        - npm install -g pnpm
        - pnpm install --frozen-lockfile
    build:
      commands:
        - pnpm build
  artifacts:
    baseDirectory: apps/web/.next
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
      - .next/cache/**/*
```

### Step 3: Set Environment Variables

In **Amplify Console** → **App settings** → **Environment variables:**

Add for all branches (or specific):
```
NEXT_PUBLIC_API_URL=https://your-recommender-api.example.com
DATABASE_URL=<redacted>JWT_SECRET=<redacted>NODE_ENV=production
```

For secrets, use **AWS Secrets Manager** integration (Amplify Gen 2).

### Step 4: Deploy & Verify

1. **Amplify Console** → Your app → **Deployments**
2. Click **Manual deploy** or push to GitHub to trigger auto-deploy
3. Watch build logs in **Build logs** tab
4. Once deployed, your app is live at `https://your-app-id.amplifyapp.com`

---

## Part 2: Deploy Recommender (Python) to AWS Lambda/ECS

The Python recommender **should be deployed separately** because Amplify doesn't natively support Python backends.

### Option 1: AWS Lambda (Recommended for serverless)

**Pros:** Pay per request, auto-scales to zero, easy setup
**Cons:** Cold starts, 15-min timeout, limited to 512 MB storage

#### Step 1: Package the Recommender

```bash
cd apps/recommender

# Install dependencies
pip install -r requirements.txt

# For serverless, use handler format (not FastAPI directly)
# Create handler.py that wraps your API
```

#### Step 2: Create Lambda Function

```bash
# Zip the function
zip -r function.zip .

# Create Lambda function (via AWS CLI)
aws lambda create-function \
  --function-name socsboard-recommender \
  --runtime python3.13 \
  --role arn:aws:iam::ACCOUNT:role/lambda-role \
  --handler handler.lambda_handler \
  --zip-file fileb://function.zip \
  --timeout 30 \
  --memory-size 512 \
  --environment Variables={DATABASE_URL=$DATABASE_URL}
```

#### Step 3: Expose via API Gateway

```bash
# Create REST API
aws apigateway create-rest-api \
  --name socsboard-recommender-api \
  --description "Recommendation engine API"

# Integrate Lambda
# (Use AWS Console for this—it's complex via CLI)
```

**Or use Amplify CLI** (simpler):

```bash
amplify add api
# Choose "REST"
# Configure Lambda integration
amplify push
```

### Option 2: AWS ECS (Recommended for ML models)

**Pros:** Full Python support, containerized, supports GPU, longer timeouts
**Cons:** Always-running costs, more setup

#### Step 1: Create Dockerfile for Recommender

```dockerfile
# apps/recommender/Dockerfile
FROM python:3.13-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

#### Step 2: Push to ECR

```bash
# Create ECR repository
aws ecr create-repository --repository-name socsboard-recommender

# Build and push
docker build -t socsboard-recommender:latest apps/recommender/
docker tag socsboard-recommender:latest \
  123456789.dkr.ecr.us-east-1.amazonaws.com/socsboard-recommender:latest
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/socsboard-recommender:latest
```

#### Step 3: Deploy to ECS / App Runner

**Via AWS App Runner (simplest):**

```bash
aws apprunner create-service \
  --service-name socsboard-recommender \
  --source-configuration \
    ImageRepository={ImageIdentifier=123456789.dkr.ecr.us-east-1.amazonaws.com/socsboard-recommender:latest,ImageRepositoryType=ECR} \
  --instance-configuration Cpu=1024,Memory=2048
```

**Via ECS (more control):**
- Create ECS cluster
- Create task definition (reference ECR image)
- Create service
- Configure Application Load Balancer (ALB)

### Option 3: AWS App Runner (Simplest Container Deployment)

```bash
# No need to manage ECR—App Runner pulls from GitHub directly
aws apprunner create-service \
  --service-name socsboard-recommender \
  --source-configuration \
    CodeRepository={RepositoryUrl=https://github.com/your-user/socsboard,Branch=main,CodeConfiguration={CodeConfigurationValues={BuildCommand='pip install -r requirements.txt',StartCommand='uvicorn main:app --host 0.0.0.0 --port 8080'}}} \
  --instance-configuration Cpu=1024,Memory=2048
```

---

## Part 3: Database Setup (RDS)

### Create RDS PostgreSQL Instance

```bash
aws rds create-db-instance \
  --db-instance-identifier your-bucket-name \
  --engine postgres \
  --engine-version 15.4 \
  --db-instance-class db.t3.micro \
  --allocated-storage 20 \
  --master-username socsboard_user \
  --master-user-password $(openssl rand -base64 32) \
  --database-name socsboard \
  --publicly-accessible false \
  --storage-encrypted \
  --multi-az
```

### Initialize Database Schema

```bash
# From your local machine (requires VPN/Bastion host access)
psql postgresql://<redacted> \
  < database/setup.sql

# Or use AWS Data API (serverless SQL)
```

---

## Part 4: Connect Frontend to Recommender

### Update Next.js API Routes

In `apps/web/src/app/api/recommend/route.js`:

```javascript
export async function POST(req) {
  const { user_id } = await req.json();

  // Call Python recommender API
  const recommenderUrl = process.env.NEXT_PUBLIC_API_URL || 
    'https://socsboard-recommender-xxxxx.us-east-1.apprunner.amazonaws.com';

  const response = await fetch(`${recommenderUrl}/recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id })
  });

  if (!response.ok) {
    throw new Error(`Recommender API failed: ${response.status}`);
  }

  return Response.json(await response.json());
}
```

### Environment Variables in Amplify

Ensure `NEXT_PUBLIC_API_URL` points to your recommender API:

```
NEXT_PUBLIC_API_URL=https://socsboard-recommender-xxxxx.us-east-1.apprunner.amazonaws.com
```

---

## Part 5: CI/CD Pipeline

### GitHub Actions (Optional, Amplify handles this)

Amplify auto-deploys on push to connected branch. For manual control:

```yaml
# .github/workflows/deploy.yml
name: Deploy to AWS

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: 25
          cache: 'pnpm'
      
      - run: pnpm install
      - run: pnpm -C apps/web build
      
      - name: Deploy to Amplify
        run: npx @aws-amplify/cli@latest publish
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

---

## Troubleshooting

### Build Fails with "AMPLIFY_MONOREPO_APP_ROOT not set"

**Solution:** Ensure `amplify.yml` includes:
```yaml
appRoot: apps/web
```

### Next.js Build Fails in Amplify

**Check:**
1. Dependencies installed: `pnpm install --frozen-lockfile`
2. Build command correct: `pnpm build`
3. Environment variables present (check Amplify console)

**Debug:**
```bash
# Build locally to reproduce
pnpm install
pnpm -C apps/web build
```

### Recommender API Returns 502 Gateway Error

**Check:**
1. Lambda/ECS service is running: `aws apprunner list-services`
2. API Gateway is configured correctly
3. Environment variables set (DATABASE_URL, etc.)
4. Security group allows traffic from Amplify

### Database Connection Refused

**Check:**
1. RDS instance is running: `aws rds describe-db-instances`
2. Security group allows inbound on port 5432 from Amplify IP
3. DATABASE_URL format correct
4. RDS is not in private subnet (or use VPC endpoint)

---

## Monitoring & Logs

### Amplify Logs

```bash
# View build logs
aws amplify list-jobs --app-id <app-id> --branch-name main

# View real-time logs
aws logs tail /aws/lambda/socsboard-recommender --follow
```

### CloudWatch

Go to **AWS Console** → **CloudWatch** → **Log Groups:**
- `/aws/amplify/your-app-id`
- `/aws/lambda/socsboard-recommender`
- `/aws/ecs/socsboard-recommender`

---

## Cost Estimation

| Service | Tier | Est. Cost/Month |
|---------|------|-----------------|
| **Amplify Hosting** | 1M requests | $1/month |
| **Lambda** (recommender) | 1M invocations × 1s | $0.20/month |
| **RDS** | db.t3.micro | $9/month |
| **Data transfer** | 1 GB/month | $0.09/month |
| **Total** | | ~$10/month |

---

## Deployment Checklist

### Before Going Live

- [ ] GitHub repo connected to Amplify
- [ ] `pnpm-workspace.yaml` configured correctly
- [ ] `apps/web/package.json` has correct build script
- [ ] Environment variables set in Amplify console
- [ ] RDS instance created and schema initialized
- [ ] Recommender API deployed (Lambda/ECS)
- [ ] API Gateway / App Runner endpoint configured
- [ ] `NEXT_PUBLIC_API_URL` points to recommender
- [ ] CORS enabled on recommender API (if needed)

### Post-Deployment

- [ ] Frontend loads at `amplifyapp.com` domain
- [ ] Health check passes: `GET /api/health`
- [ ] Recommender API responds: `POST /api/recommend`
- [ ] Database queries work
- [ ] Logs are being collected in CloudWatch
- [ ] Alerts configured (optional)

---

## Next Steps

1. **Add custom domain:** Amplify Console → **Domain management** → Add domain
2. **Enable HTTPS:** Automatic via CloudFront (always enabled)
3. **Set up monitoring:** CloudWatch, X-Ray, or Datadog
4. **Add CI/CD:** GitHub Actions for automated testing before deploy
5. **Scale recommender:** Consider SageMaker for ML model hosting

---

## Related Documentation

- [AWS Amplify Hosting Docs](https://docs.aws.amazon.com/amplify/latest/userguide/welcome.html)
- [Monorepo Support](https://docs.aws.amazon.com/amplify/latest/userguide/environment-variables.html#amplify_monorepo_app_root)
- [Next.js on Amplify](https://docs.aws.amazon.com/amplify/latest/userguide/deploy-nextjs.html)
- [Environment Variables & Secrets](https://docs.aws.amazon.com/amplify/latest/userguide/environment-variables.html)
- [Custom Build Settings](https://docs.aws.amazon.com/amplify/latest/userguide/customize-build-settings.html)

---

**Last Updated:** February 11, 2026
**Status:** Primary deployment target
