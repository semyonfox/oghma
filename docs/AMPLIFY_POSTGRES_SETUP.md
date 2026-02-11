# AWS Amplify + PostgreSQL Setup Guide

**Team collaboration workflow for 4-person development team**

This guide covers setting up AWS Amplify Gen 2 with an external PostgreSQL database for collaborative development. Each team member gets their own sandbox environment while working with a shared or personal database.

Last Updated: February 11, 2026

---

## Overview

### Architecture

```
┌─────────────────────────────────────────┐
│  Each Developer's Local Machine         │
│  ├── npx ampx sandbox (CLI)            │
│  └── Isolated cloud sandbox             │
└─────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────┐
│  Developer's Cloud Sandbox (AWS)        │
│  ├── Lambda functions (auto-generated)  │
│  ├── AppSync API (auto-generated)       │
│  └── Connects to PostgreSQL             │
└─────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────┐
│  PostgreSQL Database                     │
│  ├── Option 1: Shared dev database      │
│  ├── Option 2: Personal database        │
│  └── Option 3: Neon (with branching)    │
└─────────────────────────────────────────┘
```

### Key Features

- **Isolated sandboxes:** Each developer has their own cloud backend
- **Shared schema:** All work from same generated TypeScript schema
- **No single bottleneck:** Any developer can modify database schema
- **Database branching (optional):** Neon provides automatic database branches per git branch

---

## Initial Setup (One Person Does This)

### Step 1: Create PostgreSQL Database

**Option A: AWS RDS PostgreSQL (Production-Ready)**
1. Create RDS PostgreSQL instance in AWS Console
2. Configure security group to allow connections
3. Note connection string

**Option B: Neon (Recommended for Teams)**
1. Sign up at https://neon.tech
2. Create project
3. Enable database branching feature
4. Copy connection string from dashboard

**Option C: Local PostgreSQL (Development Only)**
1. Install PostgreSQL locally
2. Create database: `createdb socsboard`
3. Connection string: `postgresql://<redacted>

**Connection string format:**
```
postgresql://<redacted>

Example:
postgresql://<redacted>
```

### Step 2: Set Connection String as Secret

In your project root:

```bash
npx ampx sandbox secret set SQL_CONNECTION_STRING
```

When prompted, paste your PostgreSQL connection string.

**Why secrets?**
- Not stored in git (security)
- Each developer can use different database
- Production uses separate secret

### Step 3: Generate Schema from Database

Run schema generator:

```bash
npx ampx generate schema-from-database \
  --connection-uri-secret SQL_CONNECTION_STRING \
  --out amplify/data/schema.sql.ts
```

This generates TypeScript schema file from your PostgreSQL tables.

**What it does:**
- Introspects database schema
- Creates TypeScript types
- Generates resolver functions
- Maps SQL tables to GraphQL types

### Step 4: Import Schema in Resource Definition

Edit `amplify/data/resource.ts`:

```typescript
import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { schema as generatedSqlSchema } from './schema.sql';

export const data = defineData({
  schema: generatedSqlSchema,
  authorizationModes: {
    defaultAuthorizationMode: 'apiKey'
  }
});

export type Schema = ClientSchema<typeof data>;
```

**Authorization modes:**
- `apiKey` - Simple API key (development)
- `userPool` - Cognito authentication (production)
- `iam` - AWS IAM (service-to-service)
- `oidc` - External identity provider

### Step 5: Test Locally

Start sandbox:

```bash
npx ampx sandbox
```

Sandbox creates:
- Lambda functions for database queries
- AppSync GraphQL API
- Resolver functions
- Outputs API endpoint and API key

**Verify it works:**
```bash
# In another terminal
curl -X POST \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"query":"{ listUsers { id email } }"}' \
  YOUR_GRAPHQL_ENDPOINT
```

### Step 6: Commit to Git

```bash
git add amplify/
git commit -m "setup: add PostgreSQL schema and Amplify configuration"
git push origin main
```

**What to commit:**
- `amplify/data/schema.sql.ts` (generated schema)
- `amplify/data/resource.ts` (configuration)
- `amplify/backend.ts` (backend definition)

**What NOT to commit:**
- Connection strings
- API keys
- Secrets

---

## Each Developer Setup

### Step 1: Clone Repository

```bash
git clone git@github.com:semyonfox/socsboard.git
cd socsboard
```

### Step 2: Install Dependencies

```bash
pnpm install
```

### Step 3: Set Your Own Connection String

Each developer sets their own database connection:

```bash
npx ampx sandbox secret set SQL_CONNECTION_STRING
```

**Options:**

**A. Share development database:**
```
postgresql://<redacted>
```

**B. Use personal database:**
```
postgresql://<redacted>
```

**C. Use Neon branch (automatic):**
```
postgresql://<redacted>
```

### Step 4: Start Your Sandbox

```bash
npx ampx sandbox
```

**What happens:**
1. Reads your local `amplify/` configuration
2. Deploys to your AWS account (isolated stack)
3. Connects to your PostgreSQL database
4. Generates Lambda resolvers
5. Watches for file changes

**Outputs:**
```
✅ Sandbox ready
📡 GraphQL endpoint: https://abc123.appsync-api.eu-west-1.amazonaws.com/graphql
🔑 API Key: da2-randomkey123
```

### Step 5: Develop

Your sandbox auto-deploys on file changes:
- Edit `amplify/data/schema.sql.ts`
- Modify backend functions
- Update authorization rules

Sandbox redeploys automatically.

---

## Modifying Database Schema

**Any developer can modify the database schema.**

### Step 1: Make Database Changes

**Option A: Write SQL migration**

Create `database/migrations/002_add_priority.sql`:
```sql
ALTER TABLE users ADD COLUMN priority VARCHAR(10);
ALTER TABLE events ADD COLUMN featured BOOLEAN DEFAULT FALSE;
```

Run migration:
```bash
psql $SQL_CONNECTION_STRING < database/migrations/002_add_priority.sql
```

**Option B: Use ORM (Prisma/Drizzle)**

If using Prisma:
```bash
npx prisma migrate dev --name add_priority
```

### Step 2: Regenerate Schema

After database changes, regenerate TypeScript schema:

```bash
npx ampx generate schema-from-database \
  --connection-uri-secret SQL_CONNECTION_STRING \
  --out amplify/data/schema.sql.ts
```

**Why regenerate?**
- Updates TypeScript types
- Adds new fields to GraphQL schema
- Regenerates resolver functions
- Keeps code in sync with database

### Step 3: Test in Sandbox

Sandbox auto-deploys the new schema:

```bash
# Sandbox is still running from previous step
# It detects schema.sql.ts change and redeploys
```

Test new fields:
```graphql
query {
  listUsers {
    id
    email
    priority  # New field
  }
}
```

### Step 4: Commit Changes

```bash
git add amplify/data/schema.sql.ts
git add database/migrations/002_add_priority.sql
git commit -m "add priority field to users table"
git push
```

**Other developers:**
1. Pull changes: `git pull`
2. Run migration on their database
3. Sandbox auto-redeploys with new schema

---

## Team Workflow

### Scenario 1: Adding a New Table

**Developer A:**
1. Creates `events` table in database
2. Runs `npx ampx generate schema-from-database`
3. Commits `amplify/data/schema.sql.ts`
4. Pushes to GitHub

**Developer B:**
1. Pulls changes
2. Runs migration to add `events` table to their database
3. Sandbox auto-deploys with new schema
4. Can now query events

### Scenario 2: Modifying Existing Table

**Developer C:**
1. Adds `featured` column to `events` table
2. Regenerates schema
3. Tests in sandbox
4. Commits and pushes

**Developers A, B, D:**
1. Pull changes
2. Run migration
3. Continue working with updated schema

### Scenario 3: Conflicting Schema Changes

**If two developers modify schema simultaneously:**

```bash
# Developer A pushed first
git push
# Success

# Developer B tries to push
git push
# Error: updates were rejected
```

**Developer B resolves:**
```bash
git pull --rebase
# Resolve conflicts in schema.sql.ts if any
# Regenerate schema to ensure it matches database
npx ampx generate schema-from-database \
  --connection-uri-secret SQL_CONNECTION_STRING \
  --out amplify/data/schema.sql.ts

git add amplify/data/schema.sql.ts
git rebase --continue
git push
```

---

## Database Branching with Neon (Recommended)

### Why Neon?

**Problem:** All developers share one development database
- Schema conflicts during development
- Risky to test breaking changes
- Hard to isolate work

**Solution:** Database branching (like git branches)

### Setup Neon Branching

**1. Enable in Neon Dashboard**
- Project Settings → Branching
- Enable "Auto-create branches"
- Set branch naming: `{git-branch-name}`

**2. Configure GitHub Integration**
```yaml
# .github/workflows/neon-branch.yml
name: Neon Database Branch
on:
  pull_request:
    types: [opened, synchronize]
  push:
    branches: [main]

jobs:
  branch:
    runs-on: ubuntu-latest
    steps:
      - uses: neondatabase/create-branch-action@v4
        with:
          project_id: ${{ secrets.NEON_PROJECT_ID }}
          api_key: ${{ secrets.NEON_API_KEY }}
          branch_name: ${{ github.head_ref || github.ref_name }}
```

**3. Automatic Branch Lifecycle**

**When you create feature branch:**
```bash
git checkout -b feature/add-notifications
git push -u origin feature/add-notifications
```

GitHub Actions automatically:
1. Creates Neon database branch `feature/add-notifications`
2. Copies schema from main database
3. Provides connection string as secret
4. Updates Amplify preview deployment

**When you merge PR:**
- Neon database branch auto-deleted
- No cleanup needed

### Using Database Branches

**Developer workflow:**

```bash
# Create feature branch
git checkout -b feature/new-table

# Get branch database connection string
# (Provided by GitHub Actions or Neon dashboard)
npx ampx sandbox secret set SQL_CONNECTION_STRING
# Paste branch connection string

# Make schema changes
psql $SQL_CONNECTION_STRING < migrations/003_add_table.sql

# Regenerate schema
npx ampx generate schema-from-database \
  --connection-uri-secret SQL_CONNECTION_STRING \
  --out amplify/data/schema.sql.ts

# Test in sandbox
npx ampx sandbox

# Commit and push
git commit -am "add new table"
git push
```

**Benefits:**
- Complete isolation per feature
- Safe to test breaking changes
- No conflicts with other developers
- Automatic cleanup on merge

---

## Production Deployment

### Step 1: Set Production Secrets

**In AWS Amplify Console:**
1. Navigate to your app
2. Go to App Settings → Environment Variables
3. Add secret:
   - Key: `SQL_CONNECTION_STRING`
   - Value: Production PostgreSQL connection string
   - Check "Secret" checkbox

**Production connection string:**
```
postgresql://<redacted>
```

### Step 2: Deploy to Production

Push to main branch:
```bash
git push origin main
```

Amplify automatically:
1. Builds application
2. Deploys backend (Lambda, AppSync)
3. Connects to production database
4. Deploys frontend

### Step 3: Verify Production

**Check GraphQL API:**
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "x-api-key: PROD_API_KEY" \
  -d '{"query":"{ listUsers { id } }"}' \
  https://prod-api.appsync-api.eu-west-1.amazonaws.com/graphql
```

### Step 4: Run Production Migrations

**Important:** Migrations don't auto-run in production

```bash
# Connect to production database
psql $PROD_DATABASE_URL

# Run migrations manually
\i database/migrations/001_initial.sql
\i database/migrations/002_add_priority.sql
```

**Or use migration tool:**
```bash
# With Prisma
npx prisma migrate deploy

# With Drizzle
npx drizzle-kit push:pg
```

---

## Troubleshooting

### Connection Refused

**Error:**
```
Error: connect ECONNREFUSED
```

**Solutions:**
1. Check database is running
2. Verify connection string is correct
3. Check firewall/security group allows your IP
4. Ensure database accepts remote connections

### Schema Generation Fails

**Error:**
```
Error: Could not introspect database
```

**Solutions:**
1. Verify connection string secret is set:
   ```bash
   npx ampx sandbox secret list
   ```
2. Test connection directly:
   ```bash
   psql $SQL_CONNECTION_STRING -c "SELECT 1"
   ```
3. Check user has read permissions

### Sandbox Won't Start

**Error:**
```
Error: Unable to assume role
```

**Solutions:**
1. Configure AWS credentials:
   ```bash
   aws configure
   ```
2. Ensure credentials have Amplify permissions
3. Check AWS region matches project region

### Schema Out of Sync

**Problem:** Code references fields that don't exist in database

**Solution:** Regenerate schema:
```bash
npx ampx generate schema-from-database \
  --connection-uri-secret SQL_CONNECTION_STRING \
  --out amplify/data/schema.sql.ts
```

---

## Best Practices

### Database Management

1. **Use migrations:** Track schema changes in version control
2. **Test locally first:** Never test migrations on production
3. **Backup before migrations:** Always backup production database
4. **Document changes:** Commit messages should explain schema changes

### Team Collaboration

1. **Communicate schema changes:** Announce in team chat before major changes
2. **Small, incremental changes:** Easier to review and merge
3. **Regenerate schema frequently:** Keep code in sync with database
4. **Use database branching:** Isolate experimental changes

### Security

1. **Never commit secrets:** Connection strings stay in secrets
2. **Use least privilege:** Database users should have minimum permissions
3. **Rotate credentials:** Change passwords regularly
4. **Enable SSL:** Use SSL for database connections in production

### Performance

1. **Add indexes:** Index frequently queried columns
2. **Monitor query performance:** Use CloudWatch for Lambda metrics
3. **Connection pooling:** Configure max connections appropriately
4. **Cache results:** Use Redis for frequently accessed data

---

## Reference

### Amplify Commands

```bash
# Start sandbox
npx ampx sandbox

# Stop sandbox
npx ampx sandbox delete

# Generate schema
npx ampx generate schema-from-database \
  --connection-uri-secret SQL_CONNECTION_STRING \
  --out amplify/data/schema.sql.ts

# Set secret
npx ampx sandbox secret set SECRET_NAME

# List secrets
npx ampx sandbox secret list

# Remove secret
npx ampx sandbox secret remove SECRET_NAME
```

### Database Commands

```bash
# Connect to database
psql $SQL_CONNECTION_STRING

# Run migration
psql $SQL_CONNECTION_STRING < migration.sql

# Dump schema
pg_dump -s $SQL_CONNECTION_STRING > schema.sql

# Dump data
pg_dump $SQL_CONNECTION_STRING > backup.sql
```

---

## External Resources

**Official Documentation:**
- Amplify Gen 2: https://docs.amplify.aws/react/build-a-backend/
- Connect to PostgreSQL: https://docs.amplify.aws/react/build-a-backend/data/connect-to-existing-data-sources/connect-postgres-mysql-database/
- Neon branching: https://neon.tech/docs/guides/branching

**Blog Posts:**
- AWS Amplify SQL integration: https://aws.amazon.com/blogs/mobile/new-in-aws-amplify-integrate-with-sql-databases-oidc-saml-providers-and-the-aws-cdk/
- Neon + Amplify CI/CD: https://neon.tech/blog/fullstack-serverless-ci-cd-in-aws-amplify-hosting-with-postgres-database-branching

---

**Last Updated:** February 11, 2026
**Maintained by:** Semyon (Tech Lead)
