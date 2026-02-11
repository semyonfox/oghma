# AWS Amplify Deployment Summary

## Overview

Your project **is already a monorepo** (pnpm workspace) and is now **fully documented for AWS Amplify deployment**. This is the recommended production target.

---

## What Changed

### New Documentation

1. **[docs/AMPLIFY_DEPLOYMENT.md](docs/AMPLIFY_DEPLOYMENT.md)** (Primary)
   - Complete AWS Amplify setup for Next.js frontend
   - Monorepo configuration with `AMPLIFY_MONOREPO_APP_ROOT`
   - Environment variables, CI/CD, cost estimation
   - Troubleshooting guide

2. **[docs/RECOMMENDER_DEPLOYMENT.md](docs/RECOMMENDER_DEPLOYMENT.md)**
   - Separate Python API deployment strategy
   - Three deployment options: Lambda, App Runner, ECS
   - Code examples for FastAPI setup
   - Recommendation algorithm templates

3. **Updated Documentation**
   - `README.md` now highlights AWS Amplify as recommended
   - `DEPLOYMENT.md` marked deprecated (local dev only)
   - `DEPLOYMENT_QUICKSTART.md` redirects to Amplify guide
   - `docs/README.md` updated with new docs structure

---

## Architecture Decision

### Should Recommender Be Separate? **YES**

| Aspect | Why Separate |
|--------|-------------|
| **Runtime** | Python ≠ Node.js; Amplify optimized for JS/TS |
| **Dependencies** | ML libraries (pandas, sklearn) need Python runtime |
| **Scaling** | Recommender scales independently from frontend |
| **Updates** | Algorithm updates don't trigger frontend rebuilds |
| **Cost** | Pay-per-request (Lambda) vs always-on (Amplify) |

### Deployment Architecture

```
AWS Amplify (Frontend)
├─ apps/web (Next.js)
├─ CloudFront CDN
└─ Auto CI/CD on push

AWS Lambda/ECS/App Runner (Backend)
└─ apps/recommender (Python FastAPI)

AWS RDS
└─ PostgreSQL (shared database)
```

---

## Monorepo Setup (Already Done)

Your repo already has:

```yaml
# pnpm-workspace.yaml
packages:
  - apps/*
  - packages/*
```

**Apps:**
- `apps/web` - Next.js frontend
- `apps/recommender` - Python recommender (placeholder, needs setup)

**Key Files for Amplify:**
- `pnpm-workspace.yaml` ✅
- `apps/web/package.json` ✅
- Build scripts configured ✅

---

## Quick Start: Deploy to AWS

### Step 1: Connect GitHub to Amplify

```bash
# In AWS Console:
# Amplify → Create app → Select GitHub repo → main branch
```

### Step 2: Configure for Monorepo

```yaml
# Amplify Console → Build settings → Edit:
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
```

### Step 3: Set Environment Variables

```
NEXT_PUBLIC_RECOMMENDER_API_URL=https://your-recommender-api.example.com
DATABASE_URL=postgresql://user:pass@rds-endpoint:5432/socsboard
JWT_SECRET=<generate-random-32-byte-string>
NODE_ENV=production
```

### Step 4: Deploy Recommender (Separate)

Choose one:
- **Lambda** (cheapest, serverless): See RECOMMENDER_DEPLOYMENT.md Part 2, Option A
- **App Runner** (simplest): See RECOMMENDER_DEPLOYMENT.md Part 2, Option B
- **ECS** (most control): See RECOMMENDER_DEPLOYMENT.md Part 2, Option C

### Step 5: Create RDS Database

```bash
aws rds create-db-instance \
  --db-instance-identifier your-bucket-name \
  --engine postgres \
  --engine-version 15.4 \
  --db-instance-class db.t3.micro \
  --allocated-storage 20
```

---

## Key Configuration Points

### For Amplify (Frontend)

✅ **Must have:**
- `pnpm-workspace.yaml` at root
- `apps/web/package.json` with build script
- `AMPLIFY_MONOREPO_APP_ROOT=apps/web` OR `appRoot: apps/web` in yaml

❌ **Don't:**
- Use npm (use pnpm)
- Deploy Python from Amplify (separate service)
- Commit `.env` files

### For Recommender

✅ **Can be:**
- Lambda (serverless, cheapest)
- App Runner (containerized, simple)
- ECS (full control, GPU-capable)

❌ **Don't:**
- Deploy from Amplify (different runtime)
- Use Node.js runtime (Python only)
- Put in same repository as Next.js frontend (—it's separate)

---

## Why This Architecture Works

### Monorepo Benefits
- **Single repo:** One git workflow for frontend + backend
- **Atomic commits:** Changes across services in one commit
- **Shared types:** TypeScript types shared via `packages/`
- **Unified CI/CD:** One pipeline for both

### Separate Deployment Benefits
- **Independent scaling:** Recommender scales on its own
- **Optimal runtimes:** Each service uses best-fit technology
- **Cost efficiency:** Lambda for intermittent calls, Amplify always-on
- **Easy updates:** ML model updates don't affect frontend

---

## Documentation Map

| Task | Document |
|------|----------|
| **Deploy frontend to AWS** | [AMPLIFY_DEPLOYMENT.md](docs/AMPLIFY_DEPLOYMENT.md) |
| **Deploy recommender API** | [RECOMMENDER_DEPLOYMENT.md](docs/RECOMMENDER_DEPLOYMENT.md) |
| **Local Docker testing** | [DEPLOYMENT_QUICKSTART.md](docs/DEPLOYMENT_QUICKSTART.md) |
| **Full Docker reference** | [DEPLOYMENT.md](docs/DEPLOYMENT.md) (deprecated) |

---

## Cost Estimation (Monthly)

| Service | Tier | Cost |
|---------|------|------|
| Amplify Hosting | 1M requests | $1 |
| Lambda (recommender) | 100K calls | $0.20 |
| RDS PostgreSQL | db.t3.micro | $9 |
| Data transfer | 1 GB | $0.09 |
| **Total** | | **~$10/month** |

---

## Next Steps

1. **Read:** [AMPLIFY_DEPLOYMENT.md](docs/AMPLIFY_DEPLOYMENT.md) for complete frontend setup
2. **Read:** [RECOMMENDER_DEPLOYMENT.md](docs/RECOMMENDER_DEPLOYMENT.md) for API deployment
3. **Connect GitHub** to AWS Amplify Console
4. **Set environment variables** in Amplify Console
5. **Create RDS instance** for database
6. **Deploy recommender** to Lambda/App Runner/ECS
7. **Configure frontend API URL** to point to recommender
8. **Deploy and test**

---

## Questions?

- **Amplify monorepo support?** See AMPLIFY_DEPLOYMENT.md Part 1, Step 2
- **How to structure recommender?** See RECOMMENDER_DEPLOYMENT.md Part 1
- **Which recommender option?** See cost/feature comparison in RECOMMENDER_DEPLOYMENT.md
- **Database setup?** See AMPLIFY_DEPLOYMENT.md Part 3

---

**Last Updated:** February 11, 2026
**Status:** Ready for AWS deployment
**All docs committed:** ✅
