# Complete AWS Setup Guide: S3, MariaDB & ElastiCache

**For: SocsBoard Team (CT216 Software Engineering I)**

This guide walks your team through provisioning and connecting the three core AWS services required for SocsBoard production deployment: S3 (file storage), MariaDB RDS (vector-enabled database), and ElastiCache Redis (session caching).

**Status:** Ready for team execution  
**Last Updated:** February 18, 2026  
**Complexity:** Beginner-friendly (step-by-step)

---

## Prerequisites

### What You'll Need

1. **AWS Account** (Free tier eligible)
   - Sign up at https://aws.amazon.com
   - Student credits: https://aws.amazon.com/education/awseducate/
   - Verify email and add payment method (charges only occur after free tier expires)

2. **AWS CLI** (Optional but recommended)
   ```bash
   # macOS
   brew install awscli

   # Linux (Ubuntu/Debian)
   sudo apt-get install awscli

   # Or download from:
   # https://aws.amazon.com/cli/
   ```

3. **Team Member Access**
   - Create IAM users for each team member (instead of sharing root account)
   - Assign permissions: AmazonS3FullAccess, AmazonRDSFullAccess, AmazonElastiCacheFullAccess

4. **Environment Variables Template**
   - Prepare `.env.production` file (do NOT commit to git)
   - Template provided at end of this guide

---

## Part 1: Set Up S3 Bucket (File Storage)

S3 stores uploaded documents, PDFs, and note exports. Requires encryption, versioning, and CORS setup for secure team access.

### Step 1: Create S3 Bucket

1. **Open AWS Console** → Search "S3" → Click "Buckets"
2. **Click "Create bucket"**
   - **Bucket name:** `socsboard-files-prod` (must be globally unique)
   - **Region:** Choose closest to your team (e.g., eu-west-1 for Ireland)
   - **Object Ownership:** ACLs enabled (for pre-signed URLs)

3. **Block Public Access** (IMPORTANT for security)
   - ✅ Block all public access (keep enabled)
   - Click "Create bucket"

### Step 2: Enable Versioning

Allows rollback if files are accidentally deleted.

1. **Select** `socsboard-files-prod` **bucket**
2. **Properties tab** → Scroll to "Versioning"
3. **Edit** → Enable versioning → Save

### Step 3: Enable Default Encryption

Encrypts files at rest using AWS-managed keys.

1. **Properties tab** → "Default encryption"
2. **Edit** → Select "SSE-S3" → Save

### Step 4: Configure CORS (Cross-Origin Resource Sharing)

Allows frontend at `amplifyapp.com` to upload files directly.

1. **Permissions tab** → "CORS"
2. **Edit** → Paste this configuration:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedOrigins": [
      "https://*.amplifyapp.com",
      "http://localhost:3000"
    ],
    "ExposeHeaders": ["ETag", "x-amz-version-id"],
    "MaxAgeSeconds": 3600
  }
]
```

3. **Save changes**

### Step 5: Create IAM Policy for S3 Access

Restricts app to only access this bucket (principle of least privilege).

1. **Go to IAM Console** → Policies → Create policy
2. **Service:** S3
3. **Actions:**
   - ListBucket
   - GetObject
   - PutObject
   - DeleteObject
4. **Resources:** Specify bucket ARN
   ```
   arn:aws:s3:::socsboard-files-prod
   arn:aws:s3:::socsboard-files-prod/*
   ```
5. **Name policy:** `SocsBoard-S3-Access`

### Step 6: Get S3 Credentials

1. **IAM Console** → Users → Create user `socsboard-app`
2. **Attach policy:** `SocsBoard-S3-Access`
3. **Create access key**
   - Select "Application running outside AWS"
   - Save credentials:
     ```
     AWS_ACCESS_KEY_ID=AKIA...
     AWS_SECRET_ACCESS_KEY=...
     AWS_S3_REGION=eu-west-1
     AWS_S3_BUCKET=socsboard-files-prod
     ```

### Step 7: Test S3 Connection

```bash
# Test with AWS CLI
aws s3 ls s3://socsboard-files-prod \
  --region eu-west-1 \
  --profile socsboard-app

# Should output: (empty or list of files)
```

**Troubleshooting:**
- Error: `NoSuchBucket` → Check bucket name spelling and region
- Error: `AccessDenied` → Verify IAM policy is attached to user
- Error: `InvalidArgument` → Ensure CORS is properly formatted JSON

---

## Part 2: Set Up MariaDB RDS (Vector Database)

MariaDB with native vector support enables AI features: semantic search, embeddings storage, and similarity matching.

### Step 1: Create RDS Instance

1. **Open RDS Console** → https://console.aws.amazon.com/rds
2. **Click "Create database"**
   - **Engine:** MariaDB
   - **Engine version:** 11.4 or later (vector support required)
   - **Template:** Production (for reliability) or Dev/Test (for cost)

3. **Settings:**
   - **DB instance identifier:** `socsboard-mariadb-prod`
   - **Master username:** `admin`
   - **Master password:** (Generate strong: 16+ chars, mix upper/lower/numbers/symbols)
     - Use: https://www.random.org/strings/ or `openssl rand -base64 16`

4. **Instance configuration:**
   - **Instance class:** `db.t3.small` (free tier or ~$20/month)
   - **Storage:** 20 GB with autoscaling enabled (auto-grow up to 100 GB)

5. **Connectivity:**
   - **VPC:** Default VPC
   - **Public access:** Yes (for initial setup; restrict in production)
   - **Create new security group:** `socsboard-db-sg`

6. **Database authentication:**
   - Password authentication (for team simplicity)
   - ✅ Enable IAM authentication (optional advanced security)

7. **Backup:**
   - **Backup retention:** 7 days
   - **Backup window:** Off-peak hours (e.g., 3 AM UTC)

8. **Monitoring:**
   - ✅ Enable CloudWatch logs for error/general logs

9. **Create database**
   - Takes 5-10 minutes to provision

### Step 2: Configure Security Group

Open database access to your team and application services.

1. **EC2 Console** → Security Groups → Find `socsboard-db-sg`
2. **Edit inbound rules** → Add:

| Type | Port | Source | Purpose |
|------|------|--------|---------|
| MySQL | 3306 | Your team IP | Initial setup (remove after) |
| MySQL | 3306 | `socsboard-app-sg` | From application |
| MySQL | 3306 | `socsboard-lambda-sg` | From Lambda/recommender |

**For team members:**
- Each person adds their public IP: https://checkip.amazonaws.com
- Temporary during setup, remove after initial migration

### Step 3: Create Initial Database

Connect and initialize schema:

```bash
# Get connection details from RDS console
# Endpoint: socsboard-mariadb-prod.xxxxx.eu-west-1.rds.amazonaws.com

# Install MariaDB client
brew install mariadb-client  # macOS
sudo apt-get install mariadb-client  # Linux

# Connect
mysql -h socsboard-mariadb-prod.xxxxx.eu-west-1.rds.amazonaws.com \
      -u admin \
      -p

# Enter password when prompted
```

**Once connected, create database and user:**

```sql
-- Create main database
CREATE DATABASE socsboard CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create application user (least privilege)
CREATE USER 'socsboard_app'@'%' IDENTIFIED BY 'strong-password-here';
GRANT ALL PRIVILEGES ON socsboard.* TO 'socsboard_app'@'%';
FLUSH PRIVILEGES;

-- Verify vector support
SELECT @@version;
-- Should show: 11.4.x or later
```

### Step 4: Run Schema Migration

Load your database schema:

```bash
# Download your schema file
# From: database/schema.sql or migrations/

mysql -h socsboard-mariadb-prod.xxxxx.eu-west-1.rds.amazonaws.com \
      -u socsboard_app \
      -p socsboard < database/schema.sql

# For vector tables, ensure they include:
ALTER TABLE embeddings ADD COLUMN vector_data VECTOR NOT NULL;
CREATE INDEX idx_vector ON embeddings(vector_data);
```

### Step 5: Get Connection String

Store securely in `.env.production`:

```bash
# Format:
DATABASE_URL=mysql://socsboard_app:PASSWORD@socsboard-mariadb-prod.xxxxx.eu-west-1.rds.amazonaws.com:3306/socsboard

# Example:
DATABASE_URL=mysql://socsboard_app:MyStr0ng!Pass@socsboard-mariadb-prod.c9akciq32.eu-west-1.rds.amazonaws.com:3306/socsboard
```

### Step 6: Test Connection from Application

```javascript
// app/api/health/route.js
export async function GET() {
  try {
    const result = await db.query('SELECT 1');
    return Response.json({ status: 'connected' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
```

Visit `https://your-app.amplifyapp.com/api/health` to verify.

**Troubleshooting:**
- Error: `Access denied for user` → Check password in DATABASE_URL
- Error: `Unknown host` → Verify endpoint spelling
- Error: `Connection refused` → Check security group inbound rules
- Error: `Lost connection` → RDS may still be starting (wait 2 more minutes)

---

## Part 3: Set Up ElastiCache Redis (Session & Query Cache)

Redis stores user sessions, caches API responses, and manages rate limiting. Fully managed by AWS with automatic failover.

### Step 1: Create ElastiCache Cluster

1. **Open ElastiCache Console** → https://console.aws.amazon.com/elasticache
2. **Click "Create Redis cluster"**
   - **Cluster mode:** Disabled (single-node setup, simpler for teams)
   - **Name:** `socsboard-redis-prod`
   - **Engine version:** 7.0 or later
   - **Node type:** `cache.t3.micro` (free tier) or `cache.t3.small` (~$12/month)

3. **Settings:**
   - **Automatic failover:** No (for dev/test)
   - **Replicas:** 1+ (for production high availability)

4. **Subnet & Security:**
   - **Subnet group:** Default (same VPC as RDS)
   - **Security group:** Create new `socsboard-redis-sg`

5. **Advanced:**
   - **Automatic backups:** Yes, 5-day retention
   - **Logs:** CloudWatch (enable for debugging)
   - **Encryption:** Enable encryption at rest and in transit

6. **Create cluster**
   - Takes 5-10 minutes

### Step 2: Configure Security Group

1. **EC2 Console** → Security Groups → Find `socsboard-redis-sg`
2. **Edit inbound rules** → Add:

| Type | Port | Source | Purpose |
|------|------|--------|---------|
| Custom TCP | 6379 | `socsboard-app-sg` | From application |
| Custom TCP | 6379 | `socsboard-lambda-sg` | From Lambda |

### Step 3: Get Connection String

1. **ElastiCache Console** → Clusters → `socsboard-redis-prod`
2. **Find "Primary Endpoint"**
   - Format: `socsboard-redis.xxxxx.0001.euw1.cache.amazonaws.com:6379`

3. **Store in `.env.production`:**
```bash
REDIS_URL=redis://socsboard-redis.xxxxx.0001.euw1.cache.amazonaws.com:6379
```

### Step 4: Test Redis Connection

```javascript
// app/api/cache/route.js
import redis from 'redis';

const client = redis.createClient({
  url: process.env.REDIS_URL
});

export async function GET() {
  try {
    await client.connect();
    await client.set('test-key', 'test-value');
    const value = await client.get('test-key');
    await client.disconnect();
    return Response.json({ cached: value });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
```

**Troubleshooting:**
- Error: `ECONNREFUSED` → Redis not ready, wait 2 more minutes
- Error: `Error: connect ETIMEDOUT` → Security group inbound rule missing port 6379
- Error: `ReplyError: NOAUTH` → Auth required (not configured in this setup)

---

## Part 4: Environment Variables Setup

Create `.env.production` file in project root (do NOT commit):

```bash
# === AWS S3 ===
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_REGION=eu-west-1
AWS_S3_BUCKET=socsboard-files-prod

# === MariaDB ===
DATABASE_URL=mysql://socsboard_app:PASSWORD@socsboard-mariadb-prod.xxxxx.eu-west-1.rds.amazonaws.com:3306/socsboard

# === Redis ===
REDIS_URL=redis://socsboard-redis.xxxxx.0001.euw1.cache.amazonaws.com:6379

# === Application ===
NODE_ENV=production
JWT_SECRET=<openssl rand -base64 32>
JWT_EXPIRES_IN=1h
NEXT_PUBLIC_API_URL=https://your-app.amplifyapp.com

# === Optional: Monitoring ===
SENTRY_DSN=https://... # for error tracking
LOG_LEVEL=info
```

**For AWS Amplify:**
1. Go to Amplify Console → App Settings → Environment Variables
2. Add each variable (except AWS_SECRET_ACCESS_KEY - add as "Secret" type)
3. Trigger new deployment after saving

---

## Part 5: Team Collaboration Setup

### IAM Users (One Per Team Member)

Instead of sharing credentials, give each person their own AWS user:

1. **IAM Console** → Users → Create user
2. **Name:** `socsboard-dev-alice`, `socsboard-dev-bob`, etc.
3. **Permissions:**
   - Attach: `AmazonS3FullAccess`
   - Attach: `AmazonRDSFullAccess`
   - Attach: `AmazonElastiCacheFullAccess`
4. **Create access key**
   - Download credentials (will only show once)
   - Each person adds to their `~/.aws/credentials`

### Shared Passwords (Secrets Manager)

Store sensitive values securely:

1. **Secrets Manager Console** → Store new secret
2. **Secret type:** Other type of secret
3. **Name:** `socsboard/database/password`
4. **Value:** (MariaDB master password)
5. **Share:** Team members retrieve from console when needed

### Documentation for Team

Create a `TEAM_AWS_SETUP.md` checklist:

```markdown
## Team AWS Setup Checklist

- [ ] Each developer creates IAM user and downloads credentials
- [ ] Each developer configures AWS CLI: `aws configure`
- [ ] Test S3 access: `aws s3 ls s3://socsboard-files-prod`
- [ ] Test DB connection: `mysql -h ... -u socsboard_app -p`
- [ ] Test Redis: `redis-cli -h ... ping`
- [ ] All environment variables added to `.env.production`
- [ ] Amplify environment variables set in AWS Console
```

---

## Part 6: Security Best Practices

### Principle of Least Privilege

- ✅ Create app-specific IAM user (not root account)
- ✅ Restrict S3 access to single bucket
- ✅ Use security groups instead of opening ports globally
- ✅ Enable encryption on all services

### Regular Maintenance

| Task | Frequency | Owner |
|------|-----------|-------|
| Review IAM access | Monthly | Tech Lead |
| Check CloudWatch for errors | Weekly | DevOps |
| Test RDS backup restore | Monthly | Tech Lead |
| Rotate access keys | 90 days | DevOps |
| Review S3 bucket policies | Quarterly | Tech Lead |

### Secrets Management

**DO NOT:**
- ❌ Commit `.env.production` or credentials to git
- ❌ Share AWS credentials via email/chat
- ❌ Use same password for multiple services
- ❌ Leave public access enabled on S3

**DO:**
- ✅ Use AWS Secrets Manager for shared values
- ✅ Rotate credentials every 90 days
- ✅ Enable MFA on root account
- ✅ Monitor CloudWatch for suspicious activity

---

## Part 7: Monitoring & Alerts

### CloudWatch Dashboards

Monitor all three services from one view:

1. **CloudWatch Console** → Dashboards → Create dashboard `SocsBoard-Prod`
2. **Add widgets:**
   - **S3:** Bucket size, request count
   - **RDS:** CPU%, connections, query latency
   - **ElastiCache:** CPU%, memory usage, evictions

### Set Alarms

Create alerts for issues:

```bash
# RDS CPU alert (email when >80%)
aws cloudwatch put-metric-alarm \
  --alarm-name rds-high-cpu \
  --metric-name CPUUtilization \
  --namespace AWS/RDS \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2

# S3 bucket size alert (email when >10GB)
# (Requires Lambda for S3 metrics)

# ElastiCache memory alert (email when >80%)
aws cloudwatch put-metric-alarm \
  --alarm-name cache-high-memory \
  --metric-name DatabaseMemoryUsagePercentage \
  --namespace AWS/ElastiCache \
  --statistic Average \
  --threshold 80
```

### Cost Monitoring

Set budget to avoid surprise bills:

1. **Billing Console** → Budgets → Create budget
2. **Name:** `SocsBoard Monthly`
3. **Limit:** $25/month
4. **Alert threshold:** 80%
5. **Notification:** Email team when threshold reached

---

## Part 8: Disaster Recovery

### Database Backup & Restore

**Automated backups:**
- RDS keeps 7-day rolling backups
- Enable "Automatic backup retention"
- Can restore to any point within 7 days

**Manual backup:**
```bash
# Export schema
mysqldump -h $DB_HOST -u admin -p socsboard > backup_$(date +%Y%m%d).sql

# Restore from backup
mysql -h $DB_HOST -u admin -p socsboard < backup_20260218.sql
```

### S3 Versioning

Recover accidentally deleted files:

```bash
# List all versions of a file
aws s3api list-object-versions \
  --bucket socsboard-files-prod \
  --prefix documents/important.pdf

# Restore deleted file
aws s3api get-object \
  --bucket socsboard-files-prod \
  --key documents/important.pdf \
  --version-id AbCdEfGhIjKlMnOpQrStUvWxYz \
  important.pdf
```

### Redis Persistence

Automatic backups every 5 days. Restore from snapshot in ElastiCache console.

---

## Part 9: Cost Estimation

### Monthly Breakdown (Free Tier)

| Service | Type | Cost | Notes |
|---------|------|------|-------|
| S3 | Standard | ~$0.50 | 10 GB storage + uploads |
| RDS MariaDB | db.t3.micro | FREE | 12 months free tier |
| ElastiCache | cache.t3.micro | FREE | 12 months free tier |
| Data Transfer | Outbound | ~$0.50 | 1 GB out = $0.09 |
| **Total** | | **~$1/month** | First year |

### After Free Tier Expires

| Service | Instance | Monthly |
|---------|----------|---------|
| S3 | 10 GB | $0.50 |
| RDS | db.t3.small | $18 |
| ElastiCache | cache.t3.small | $12 |
| Data Transfer | 10 GB out | $0.90 |
| **Total** | | **~$31/month** |

**Cost optimization tips:**
- Use reserved instances (30% discount for 1-year commit)
- Enable S3 lifecycle policies to archive old files
- Set RDS storage autoscaling limits
- Use on-demand pricing for variable loads

---

## Part 10: Troubleshooting Matrix

| Issue | Service | Solution |
|-------|---------|----------|
| Files not uploading | S3 | Check CORS config, IAM permissions, bucket name |
| Database connection fails | MariaDB | Verify security group port 3306, credentials |
| Sessions not persisting | Redis | Check REDIS_URL format, port 6379 open |
| High costs | All | Review CloudWatch metrics, check for runaway queries |
| Slow queries | MariaDB | Add indexes on frequently searched columns |
| Connection timeout | Any | Check security group inbound rules, wait 5 min |
| Auth errors | S3 | Verify AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY |

---

## Quick Verification Checklist

After setup, verify everything works:

```bash
# 1. S3
aws s3 ls s3://socsboard-files-prod

# 2. MariaDB
mysql -h socsboard-mariadb-prod.xxxxx.eu-west-1.rds.amazonaws.com \
      -u socsboard_app -p socsboard -e "SELECT 1"

# 3. Redis
redis-cli -h socsboard-redis.xxxxx.0001.euw1.cache.amazonaws.com ping
# Should return: PONG

# 4. Check environment variables
echo $DATABASE_URL
echo $REDIS_URL
echo $AWS_S3_BUCKET
```

---

## Next Steps

1. ✅ Create S3 bucket + configure
2. ✅ Create MariaDB RDS instance + initialize schema
3. ✅ Create ElastiCache Redis cluster
4. ✅ Add environment variables to Amplify
5. → **Deploy to AWS Amplify** (see DEPLOYMENT.md)
6. → **Set up Lambda recommender** (see RECOMMENDER_DEPLOYMENT.md)
7. → **Configure monitoring** (CloudWatch dashboards + alarms)

---

## Support & Questions

| Topic | Resource |
|-------|----------|
| AWS S3 docs | https://docs.aws.amazon.com/s3/ |
| RDS docs | https://docs.aws.amazon.com/rds/ |
| ElastiCache docs | https://docs.aws.amazon.com/elasticache/ |
| Amplify deployment | See DEPLOYMENT.md |
| Team coordination | Ask in Slack/Discord |

---

**Status:** Production-ready  
**Last Updated:** February 18, 2026  
**Maintained by:** Semyon (Tech Lead)  
**Next review:** April 18, 2026
