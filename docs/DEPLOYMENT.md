# Deployment Guide

**Production deployment to AWS Amplify + Lambda**

This guide covers deploying SocsBoard to production on AWS.

Last Updated: February 12, 2026

---

## Technical Notes

**Package Manager:** This project uses npm (not pnpm) for AWS Amplify compatibility and deployment simplicity. While pnpm is faster, npm provides better native support in Amplify and requires simpler build configuration.

---

## Overview

### Production Architecture

```
┌─────────────────────────────────────────┐
│  AWS Amplify Hosting                     │
│  ├── Next.js Frontend (SSR)             │
│  ├── API Routes                          │
│  ├── CDN (CloudFront)                   │
│  └── CI/CD (GitHub integration)         │
└─────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────┐
│  AWS Lambda                              │
│  └── Python Recommendation Service      │
└─────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────┐
│  AWS RDS PostgreSQL                      │
│  ├── Production database                │
│  ├── Automated backups                  │
│  └── Multi-AZ (optional)                │
└─────────────────────────────────────────┘
            +
┌─────────────────────────────────────────┐
│  ElastiCache Redis                       │
│  └── Session and query caching          │
└─────────────────────────────────────────┘
```

### Why This Architecture?

**AWS Amplify for Next.js:**
- Native Next.js SSR support
- Automatic deployments from GitHub
- Global CDN for fast page loads
- Environment variable management
- Free SSL certificates

**Lambda for Python Service:**
- Separate runtime (Python vs Node.js)
- Independent scaling
- Pay-per-invocation (cost-effective)
- No server management

**RDS for PostgreSQL:**
- Managed service (automated backups, patches)
- High availability options
- Scalable storage and compute
- Connection pooling

**ElastiCache for Redis:**
- Managed Redis cluster
- Automatic failover
- Compatible with existing code
- Sub-millisecond latency

---

## Prerequisites

### Required Accounts

1. **AWS Account**
   - Sign up at https://aws.amazon.com
   - Student credits available: https://aws.amazon.com/education/awseducate/
   - Free tier covers most services for 12 months

2. **GitHub Repository**
   - Code must be in GitHub for Amplify auto-deploy
   - Private or public repository works

### Required Tools

```bash
# AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Configure AWS CLI
aws configure
# Enter: Access Key, Secret Key, Region (e.g., eu-west-1), Output (json)

# Amplify CLI (optional, for advanced config)
npm install -g @aws-amplify/cli
```

### Environment Variables

Prepare these values before deployment:

```
# Database
DATABASE_URL=<redacted>
# Authentication
JWT_SECRET=<redacted>JWT_EXPIRES_IN=1h

# Redis
REDIS_URL=<redacted>
# Python Service
RECOMMENDER_API_URL=https://lambda-function-url.amazonaws.com

# Node Environment
NODE_ENV=production
```

---

## Part 1: Deploy Frontend to AWS Amplify

### Step 1: Create Amplify App

1. **Open AWS Amplify Console**
   - Navigate to https://console.aws.amazon.com/amplify
   - Click "New app" → "Host web app"

2. **Connect GitHub**
   - Select GitHub as source
   - Authorize AWS Amplify
   - Select repository: `socsboard`
   - Select branch: `main`

3. **Configure Build Settings**

Amplify auto-detects Next.js. Verify build settings:

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: .next
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
```

4. **Add Environment Variables**

In Amplify Console → App Settings → Environment Variables:

```
DATABASE_URL=<redacted>JWT_SECRET=<redacted>JWT_EXPIRES_IN=1h
REDIS_URL=<redacted>RECOMMENDER_API_URL=<LAMBDA_URL>
NODE_ENV=production
```

Generate JWT secret:
```bash
openssl rand -base64 32
```

5. **Deploy**
   - Click "Save and deploy"
   - Amplify builds and deploys automatically
   - Takes 5-10 minutes for first deploy
   - URL provided: `https://main.xxxxxx.amplifyapp.com`

### Step 2: Configure Custom Domain (Optional)

1. **In Amplify Console** → Domain management
2. **Add domain:** `yourdomain.com`
3. **Add DNS records** (Amplify provides values)
4. **Wait for SSL certificate** (auto-provisioned via ACM)
5. **Domain active** in 15-30 minutes

### Step 3: Set Up CI/CD

Automatic deployments already configured:

- **Push to main** → Auto-deploy to production
- **Pull request** → Preview deployment created
- **Build fails** → Deployment blocked, previous version remains live

Monitor builds: Amplify Console → Deployments

---

## Part 2: Deploy Python Recommender to AWS Lambda

### Step 1: Prepare Lambda Function

**Project structure:**
```
lambda_recommender/
├── handler.py           # Lambda entry point
├── recommender.py       # Recommendation logic
├── requirements.txt     # Dependencies
└── deploy.sh           # Deployment script
```

**handler.py:**
```python
import json
import os
import psycopg2
from recommender import generate_recommendations

def lambda_handler(event, context):
    """
    Lambda entry point
    Expects: { "user_id": "uuid", "limit": 10 }
    Returns: [{ "event_id": "uuid", "score": 0.85, "reason": "..." }]
    """
    try:
        body = json.loads(event.get('body', '{}'))
        user_id = body.get('user_id')
        limit = body.get('limit', 10)
        
        if not user_id:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'user_id required'})
            }
        
        # Connect to RDS
        conn = psycopg2.connect(os.environ['DATABASE_URL'])
        
        # Generate recommendations
        recommendations = generate_recommendations(conn, user_id, limit)
        
        conn.close()
        
        return {
            'statusCode': 200,
            'body': json.dumps(recommendations)
        }
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }
```

**requirements.txt:**
```
psycopg2-binary
```

### Step 2: Create Lambda Function

**Via AWS Console:**

1. **Open Lambda Console** → https://console.aws.amazon.com/lambda
2. **Create function**
   - Name: `socsboard-recommender`
   - Runtime: Python 3.11
   - Architecture: x86_64
   - Permissions: Create new role with basic Lambda permissions

3. **Upload code**
   ```bash
   # Package dependencies
   pip install -r requirements.txt -t .
   zip -r function.zip .
   
   # Upload via console or CLI
   aws lambda update-function-code \
     --function-name socsboard-recommender \
     --zip-file fileb://function.zip
   ```

4. **Configure environment variables**
   - Configuration → Environment variables
   - Add: `DATABASE_URL=postgresql://<redacted>

5. **Adjust timeout and memory**
   - Configuration → General configuration
   - Timeout: 30 seconds (recommendations can be compute-heavy)
   - Memory: 512 MB

### Step 3: Create Function URL

1. **Configuration → Function URL**
2. **Create function URL**
   - Auth type: `NONE` (we'll add auth in Next.js)
   - CORS: Enable, allow origin `https://main.xxxxxx.amplifyapp.com`
3. **Copy function URL:** `https://abc123.lambda-url.eu-west-1.on.aws/`
4. **Add to Amplify environment variables** as `RECOMMENDER_API_URL`

### Step 4: Call from Next.js

**In Next.js API route:**
```javascript
// app/api/recommendations/route.js
export async function GET(request) {
  const userId = request.headers.get('x-user-id');
  
  const response = await fetch(process.env.RECOMMENDER_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, limit: 10 })
  });
  
  const recommendations = await response.json();
  return Response.json(recommendations);
}
```

---

## Part 3: Set Up Database (RDS PostgreSQL)

### Step 1: Create RDS Instance

1. **Open RDS Console** → https://console.aws.amazon.com/rds
2. **Create database**
   - Engine: PostgreSQL 15.x
   - Template: Free tier (dev) or Production (high availability)
   - DB instance identifier: `socsboard-db`
   - Master username: `socsboard_admin`
   - Master password: (generate strong password)

3. **Instance configuration**
   - Free tier: db.t3.micro (1 vCPU, 1 GB RAM)
   - Production: db.t3.small or larger

4. **Storage**
   - Allocated: 20 GB (min)
   - Enable autoscaling: Yes, max 100 GB

5. **Connectivity**
   - VPC: Default VPC
   - Public access: Yes (for initial setup, restrict later)
   - Security group: Create new → `socsboard-db-sg`

6. **Database authentication**
   - Password authentication (for simplicity)
   - IAM database authentication: Optional for enhanced security

7. **Create database**
   - Takes 5-10 minutes to provision

### Step 2: Configure Security Group

1. **EC2 Console → Security Groups**
2. **Find** `socsboard-db-sg`
3. **Edit inbound rules**
   - Type: PostgreSQL
   - Port: 5432
   - Source: Custom → Your IP (for setup) + Lambda security group

**Production:** Restrict to VPC only, remove public access after setup.

### Step 3: Run Database Migrations

**Get connection string:**
```
postgresql://<redacted>
```

**Run schema:**
```bash
# Connect to RDS
psql postgresql://<redacted>

# Create database
CREATE DATABASE socsboard;
\c socsboard

# Run migrations
\i database/setup.sql
```

**Or use migration script:**
```bash
DATABASE_URL=<redacted>```

### Step 4: Update Amplify Environment Variables

Add RDS connection string to Amplify:
```
DATABASE_URL=<redacted>```

---

## Part 4: Set Up Redis (ElastiCache)

### Step 1: Create ElastiCache Cluster

1. **Open ElastiCache Console** → https://console.aws.amazon.com/elasticache
2. **Create Redis cluster**
   - Cluster mode: Disabled (simple setup)
   - Name: `socsboard-redis`
   - Engine version: 7.x
   - Node type: cache.t3.micro (free tier eligible)
   - Number of replicas: 0 (dev) or 1+ (production)

3. **Network settings**
   - VPC: Same as RDS
   - Security group: Create new → `socsboard-redis-sg`

4. **Create cluster**
   - Takes 5-10 minutes

### Step 2: Configure Security Group

1. **Edit** `socsboard-redis-sg` **inbound rules**
   - Type: Custom TCP
   - Port: 6379
   - Source: Lambda security group + Amplify (if applicable)

### Step 3: Get Connection String

**Primary endpoint:**
```
socsboard-redis.abc123.0001.euw1.cache.amazonaws.com:6379
```

**Connection string:**
```
redis://<redacted>
```

### Step 4: Update Environment Variables

Add to Amplify and Lambda:
```
REDIS_URL=<redacted>```

---

## Part 5: Monitoring and Logs

### CloudWatch Logs

**Amplify logs:**
- Amplify Console → Monitoring → Logs
- Shows build logs and runtime errors

**Lambda logs:**
- CloudWatch Console → Log groups → `/aws/lambda/socsboard-recommender`
- Shows function invocations and errors

**RDS logs:**
- RDS Console → Databases → socsboard-db → Logs & events
- Shows slow queries and errors

### CloudWatch Metrics

**Set up alarms:**
1. **Lambda errors** > 5 per hour → Send SNS alert
2. **RDS CPU** > 80% for 5 minutes → Send SNS alert
3. **ElastiCache memory** > 90% → Send SNS alert

**Create alarm:**
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name lambda-errors \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 3600 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions arn:aws:sns:REGION:ACCOUNT:alerts
```

### Cost Monitoring

**Enable Cost Explorer:**
1. AWS Console → Billing → Cost Explorer
2. Set budget alert (e.g., $20/month)
3. Receive email when 80% of budget reached

**Estimated costs (free tier):**
- Amplify: Free for first year (build minutes limited)
- Lambda: Free for 1M requests/month
- RDS: Free tier db.t3.micro for 12 months
- ElastiCache: Free tier cache.t3.micro for 12 months

**After free tier:**
- Amplify: ~$0.01 per build minute
- Lambda: ~$0.20 per 1M requests
- RDS t3.small: ~$25/month
- ElastiCache t3.micro: ~$12/month

---

## Part 6: Deployment Workflow

### Continuous Deployment

**Automatic on every push to main:**
```bash
git add .
git commit -m "feature: add event filtering"
git push origin main
```

Amplify automatically:
1. Pulls latest code
2. Installs dependencies
3. Runs build
4. Deploys to production
5. Invalidates CDN cache

**Monitor deployment:**
- Amplify Console → Deployments
- Build takes 5-10 minutes
- Preview URL available immediately

### Manual Lambda Update

**When updating recommender logic:**
```bash
cd lambda_recommender
pip install -r requirements.txt -t .
zip -r function.zip .

aws lambda update-function-code \
  --function-name socsboard-recommender \
  --zip-file fileb://function.zip
```

**Or use deployment script:**
```bash
./deploy.sh
```

### Database Migrations

**For schema changes:**
```bash
# Write migration file
# database/migrations/002_add_categories.sql

# Apply migration
psql $DATABASE_URL < database/migrations/002_add_categories.sql
```

**Production safety:**
1. Test migration on staging database first
2. Backup production database before applying
3. Run during low-traffic window
4. Monitor for errors after deployment

---

## Part 7: Rollback and Recovery

### Rollback Deployment

**If deployment breaks production:**

1. **Amplify Console → Deployments**
2. **Find last working deployment**
3. **Click "Redeploy this version"**
4. **Confirm rollback**

Previous version restored in 5 minutes.

### Database Backup and Restore

**Manual backup:**
```bash
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql
```

**Restore from backup:**
```bash
psql $DATABASE_URL < backup_20260211.sql
```

**RDS automated backups:**
- Retention: 7 days (default)
- Restore: RDS Console → Snapshots → Restore

### Lambda Rollback

**Revert to previous version:**
```bash
aws lambda update-function-code \
  --function-name socsboard-recommender \
  --zip-file fileb://previous_function.zip
```

---

## Troubleshooting

### Common Issues

**1. Build fails on Amplify**
- Check build logs in Amplify Console
- Verify `package.json` scripts are correct
- Ensure environment variables are set

**1a. Environment variables not accessible during build**

**Error:** `!Failed to set up process.env.secrets` during Amplify build

**Cause:** Environment variables not configured in AWS Amplify Console

**Solution:**
1. Go to AWS Amplify Console → Your App
2. Navigate to App Settings → Environment Variables
3. Add all required variables:
   ```
   DATABASE_URL=postgresql://<redacted>
   JWT_SECRET=<redacted> with: openssl rand -base64 32>
   JWT_EXPIRES_IN=1h
   NODE_ENV=production
   ```
4. Click "Save"
5. Trigger new deployment: Amplify Console → Deployments → Redeploy

**Note:** Environment variables must be set before build, not after. Variables marked as "Secret" are encrypted at rest.

**2. Database connection errors**
- Verify security group allows connections
- Check DATABASE_URL format
- Test connection: `psql $DATABASE_URL`

**3. Lambda timeout**
- Increase timeout: Configuration → General → Timeout (max 15 minutes)
- Optimize queries (add indexes)
- Consider caching results in Redis

**4. High costs**
- Check Cost Explorer for unexpected charges
- Review CloudWatch metrics for usage spikes
- Scale down instances if over-provisioned

### Getting Help

**AWS Support:**
- Free tier: Community forums
- Paid plans: Technical support available

**Documentation:**
- Amplify: https://docs.amplify.aws/
- Lambda: https://docs.aws.amazon.com/lambda/
- RDS: https://docs.aws.amazon.com/rds/

---

## Local Development

**Quick start:**
```bash
cp .env.example .env.local
npm install
npm run dev
```

---



**Last Updated:** February 11, 2026
**Maintained by:** Semyon (Tech Lead)
