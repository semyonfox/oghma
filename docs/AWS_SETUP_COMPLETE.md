# 🚀 SocsBoard AWS Setup Guide

**Complete setup for team of 3 - All services in one place**

---

## 📋 Quick Summary

Your team needs to set up **3 AWS services** and share credentials:

| Service | What | Owner Setup | Team Setup |
|---------|------|-----------|-----------|
| **RDS MariaDB** | Database | 1 person | Copy credentials |
| **ElastiCache Redis** | Cache | 1 person | Copy credentials |
| **S3 Bucket** | File storage | 1 person | Copy credentials |

**Total setup time:** ~30 minutes for setup person, ~5 minutes per team member

---

## 👤 For the Setup Person (Do This Once)

Choose one team member to do all the AWS setup. This section is for them.

### Step 1: Create RDS MariaDB Database

**In AWS Console:**

1. Go to **RDS** → Databases → "Create database"
2. Configuration:
   - **Engine**: MariaDB (latest)
   - **Instance identifier**: `socsboard-db`
   - **Master username**: `socsboard_user`
   - **Master password**: Generate a strong password (save this!)
   - **DB instance class**: `db.t3.micro` (free tier eligible)
   - **Storage**: 20 GB (default)
   - **Publicly accessible**: Yes (for dev - change to No in production)
3. Click "Create database" and wait ~5 minutes

**After creation, find these in RDS Console:**

| Variable | Where | Example |
|----------|-------|---------|
| `DATABASE_HOST` | Connectivity & security → Endpoint | `socsboard-db.xxxxx.us-east-1.rds.amazonaws.com` |
| `DATABASE_PORT` | Usually 3306 (shown on same page) | `3306` |
| `DATABASE_USER` | Master username you chose | `socsboard_user` |
| `DATABASE_PASSWORD` | Password you set | `YourStrongPassword123!` |
| `DATABASE_NAME` | Create manually below | `socsboard_prod` |

**Create the database schema:**

```bash
# Connect to your new RDS instance
mysql -h socsboard-db.xxxxx.us-east-1.rds.amazonaws.com \
      -u socsboard_user \
      -p

# Create database
CREATE DATABASE socsboard_prod CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE socsboard_prod;

# Create tables (from database/schema.sql in your repo)
-- Paste contents of database/schema.sql here
```

**Share with team:**
- DATABASE_HOST
- DATABASE_PORT (usually 3306)
- DATABASE_USER
- DATABASE_PASSWORD
- DATABASE_NAME (`socsboard_prod`)

---

### Step 2: Create ElastiCache Redis Cluster

**In AWS Console:**

1. Go to **ElastiCache** → Clusters → "Create cluster"
2. Configuration:
   - **Cluster mode**: Disabled
   - **Engine**: Redis (latest)
   - **Node type**: `cache.t3.micro` (free tier eligible)
   - **Number of nodes**: 1
   - **Cluster identifier**: `socsboard-redis`
   - **Port**: 6379 (default)
   - **Parameter group**: default
   - **Subnet group**: Create new or select existing
   - **Security group**: Create new or select
3. Click "Create" and wait ~5 minutes

**After creation, find these in ElastiCache Console:**

| Variable | Where | Example |
|----------|-------|---------|
| `REDIS_HOST` | Cluster details → Primary endpoint (hostname only) | `socsboard-redis.xxxxx.ng.0001.use1.cache.amazonaws.com` |
| `REDIS_PORT` | Cluster details → Port | `6379` |
| `REDIS_URL` | Build from above | `redis://socsboard-redis.xxxxx.ng.0001.use1.cache.amazonaws.com:6379` |

**Configure Security Group:**
- ElastiCache security group should allow inbound on port 6379 from:
  - Your app security group (if running on EC2)
  - Your IP (for local dev, only if public)

**Share with team:**
- REDIS_HOST
- REDIS_PORT
- REDIS_URL

---

### Step 3: Create S3 Bucket

**In AWS Console:**

1. Go to **S3** → "Create bucket"
2. Configuration:
   - **Bucket name**: `your-bucket-name-files` (must be globally unique)
   - **Region**: Same as RDS/ElastiCache (e.g., `us-east-1`)
   - **Block public access**: ✅ YES (keep private)
   - **Versioning**: Enable (for future version control)
   - **Encryption**: Enable AES-256
3. Click "Create bucket"

**Create IAM User for App Access:**

1. Go to **IAM** → Users → "Create user"
2. Configuration:
   - **Username**: `socsboard-app-user`
   - Skip group assignment
   - Click "Create user"

3. Create access keys:
   - Click the new user
   - Security credentials tab → "Create access key"
   - Select "Application running outside AWS"
   - Copy both keys immediately (won't see secret again!)

**Attach bucket permissions to IAM user:**

1. Still in user details, go to "Permissions" tab
2. Click "Add permissions" → "Attach policies directly"
3. Search and attach: `AmazonS3FullAccess`
   - (Or create custom policy below for tighter security)

**Custom S3 Policy (More Secure):**

Go to IAM → Policies → "Create policy" → JSON tab:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::your-bucket-name-files",
        "arn:aws:s3:::your-bucket-name-files/*"
      ]
    }
  ]
}
```

**Set Bucket CORS:**

In S3 bucket → Permissions → CORS configuration:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://your-domain.com"
    ],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3000
  }
]
```

**Share with team:**
- STORAGE_BUCKET: `your-bucket-name-files`
- STORAGE_ACCESS_KEY: (from IAM user access key)
- STORAGE_SECRET_KEY: (from IAM user secret key)
- STORAGE_REGION: `us-east-1` (or your region)

---

### 📋 Summary for Setup Person

You now have **9 credentials to share** with your 2 teammates:

**RDS (3):**
- DATABASE_HOST
- DATABASE_USER
- DATABASE_PASSWORD

**Redis (2):**
- REDIS_HOST
- REDIS_URL (or PORT)

**S3 (3):**
- STORAGE_BUCKET
- STORAGE_ACCESS_KEY
- STORAGE_SECRET_KEY

**Send via secure channel** (encrypted message, not Slack chat, not email)

---

## 👥 For Team Members (Everyone)

You receive 9 values from setup person. Do this:

### Step 1: Create `.env.local`

In the project root:

```bash
cp .env.example .env.local
```

### Step 2: Fill in all variables

Open `.env.local` and fill in the values you received. Template:

```bash
# Database
DATABASE_URL=mysql://socsboard_user:PASSWORD@DATABASE_HOST:3306/socsboard_prod
DATABASE_HOST=socsboard-db.xxxxx.us-east-1.rds.amazonaws.com
DATABASE_PORT=3306
DATABASE_USER=socsboard_user
DATABASE_PASSWORD=PASTE_HERE
DATABASE_NAME=socsboard_prod

# Redis Cache
REDIS_URL=redis://REDIS_HOST:6379
REDIS_HOST=socsboard-redis.xxxxx.ng.0001.use1.cache.amazonaws.com
REDIS_PORT=6379

# S3 Storage
STORAGE_BUCKET=your-bucket-name-files
STORAGE_ACCESS_KEY=PASTE_HERE
STORAGE_SECRET_KEY=PASTE_HERE
STORAGE_REGION=us-east-1
STORAGE_ENDPOINT=https://s3.amazonaws.com
STORAGE_PATH_STYLE=false
STORAGE_PREFIX=socsboard

# App Config
NEXT_PUBLIC_API_URL=https://your-domain.com
JWT_SECRET=replace-me-with-openssl-rand-base64-32
PORT=3000
NODE_ENV=development
```

### Step 3: Verify it's ignored by Git

```bash
git status
# Should NOT show .env.local
```

If it does:
```bash
git rm --cached .env.local
git commit -m "Remove .env.local from tracking"
```

### Step 4: Start development

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`

---

## 🔐 Security Checklist

### Do NOT ❌
- Commit `.env.local` to Git
- Share credentials in Slack/public channels
- Use AWS root account credentials
- Commit credentials anywhere

### Do ✅
- Use `.gitignore` to exclude `.env.local` (already done)
- Share credentials via encrypted/1-on-1 messages only
- Use IAM users with minimal permissions
- Store `.env.local` locally only
- Rotate access keys every 90 days in production

### Verify Git Safety
```bash
# Check .env.local is ignored
cat .gitignore | grep env.local
# Should output: .env.local
```

---

## 🧪 Testing the Setup

### Test Database Connection

```bash
npm run dev
# Visit http://localhost:3000
# Check server logs for database connection confirmation
```

### Test Redis Connection

In a Node REPL:
```typescript
import { createClient } from 'redis';
const client = createClient({ url: process.env.REDIS_URL });
await client.connect();
console.log('Redis connected!');
```

### Test S3 Connection

```typescript
import { getStorageProvider } from '@/lib/storage/init';

const storage = getStorageProvider();
const exists = await storage.hasObject('test.txt');
console.log('S3 working:', exists !== undefined);
```

---

## 📍 Where to Find Everything in AWS Console

### Dashboard

Once logged in, navigate:

```
AWS Console (top-left logo)
├── RDS
│   └── Databases → Click "socsboard-db"
│       ├── Connectivity & security → Endpoint (DATABASE_HOST)
│       └── Details → Port (DATABASE_PORT)
├── ElastiCache
│   └── Clusters → Click "socsboard-redis"
│       └── Details → Primary endpoint (REDIS_HOST)
└── S3
    └── Buckets → Click "your-bucket-name-files"
        ├── Permissions → CORS, Policy
        └── Properties → Region
```

### IAM (Credentials)

```
IAM (top-right search)
├── Users → socsboard-app-user
│   ├── Security credentials → Access Keys
│   └── Permissions → View policy
```

---

## ❌ Troubleshooting

### "Cannot connect to database"
- Check DATABASE_HOST is correct
- Check DATABASE_USER/PASSWORD are correct
- Verify RDS instance is "Available" (not still creating)
- Check security group allows your IP

### "Redis connection timeout"
- Check REDIS_HOST is correct
- Verify ElastiCache is "Available"
- Check security group allows connections
- For local dev, may need to whitelist your IP

### "S3 Access Denied"
- Verify STORAGE_ACCESS_KEY and STORAGE_SECRET_KEY
- Check IAM user has S3 permissions
- Confirm bucket policy includes the user ARN

### ".env.local not working"
- Make sure it's in the project root: `ls -la .env.local`
- Restart dev server after changing
- Check file has correct format (no quotes around values)

---

## 📚 References

- [RDS MariaDB Docs](https://docs.aws.amazon.com/rds/latest/UserGuide/CHAP_MariaDB.html)
- [ElastiCache Redis Docs](https://docs.aws.amazon.com/elasticache/latest/red-ug/index.html)
- [S3 Docs](https://docs.aws.amazon.com/s3/latest/userguide/GetStartedWithS3.html)
- [IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)

---

## 🚀 Production Deployment

When deploying to production:

1. **Create separate AWS account** or use different IAM user
2. **Use AWS Secrets Manager** for credentials (don't hardcode)
3. **Enable multi-factor authentication** on AWS account
4. **Rotate access keys** every 90 days
5. **Set RDS to non-public** (behind VPC security group only)
6. **Enable ElastiCache encryption** at rest and in transit
7. **Update S3 CORS** to production domain only

---

## 📞 Quick Help

| Issue | Fix |
|-------|-----|
| Credentials not working | Verify they're pasted exactly (no extra spaces) |
| Database won't connect | Check security group allows inbound traffic |
| Redis timeout | Make sure ElastiCache is in "Available" state |
| S3 uploads fail | Verify bucket name is correct, IAM user has s3:PutObject |
| `.env.local` ignored by IDE | Check `.gitignore`, might need IDE restart |

---

**All set? Start development with `npm run dev`** 🎉

Still need help? Check the error messages in:
- **Server console** (npm run dev output)
- **Browser console** (F12 → Console)
- AWS Console → Service → Logs (if available)
