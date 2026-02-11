# Deployment Quick Reference

> **🚀 AWS AMPLIFY IS THE RECOMMENDED DEPLOYMENT TARGET**
>
> For **production**, use **[AMPLIFY_DEPLOYMENT.md](AMPLIFY_DEPLOYMENT.md)**.
>
> This guide covers **local development deployment only**. See AMPLIFY_DEPLOYMENT.md for AWS production deployment.

---

## Production: AWS Amplify + Lambda/ECS

For deploying to AWS:

1. **Frontend (Next.js)** → [AWS Amplify Hosting](AMPLIFY_DEPLOYMENT.md#part-1-deploy-frontend-nextjs-to-amplify)
2. **Recommender API (Python)** → [AWS Lambda or ECS](AMPLIFY_DEPLOYMENT.md#part-2-deploy-recommender-python-to-aws-lambdaecs)
3. **Database (PostgreSQL)** → [AWS RDS](AMPLIFY_DEPLOYMENT.md#part-3-database-setup-rds)

**Read:** [AMPLIFY_DEPLOYMENT.md](AMPLIFY_DEPLOYMENT.md) for complete AWS setup instructions.

---

## Local Development: Docker Compose

## Prerequisites

- Docker + Docker Compose installed
- Environment variables configured (.env file)
- Database running and accessible

---

## Quick Deploy Steps

### 1. Prepare Environment

```bash
# Copy and edit environment variables
cp .env.example .env
# Update DATABASE_URL, JWT_SECRET, etc.
```

### 2. Build and Run

```bash
# Build Docker image
docker compose build

# Start containers
docker compose up -d

# Check if running
docker ps | grep ct216_web
docker logs -f ct216_web
```

### 3. Verify Deployment

```bash
# Health check
curl http://localhost:3000/api/health

# You should see: {"status":"ok", ...}

# Or if behind tunnel
curl https://ct216.semyon.ie/api/health
```

---

## Common Commands

```bash
# View logs
docker logs -f ct216_web

# Restart services
docker compose restart

# Stop services
docker compose down

# Rebuild (after code changes)
docker compose up -d --build

# Execute command in container
docker exec -it ct216_web sh

# Check database connection
docker exec ct216_web nc -zv pg-db 5432
```

---

## Troubleshooting

**Container won't start:**
```bash
docker logs ct216_web
# Check for errors, fix .env variables
```

**Database connection failed:**
```bash
# Verify database is running
docker ps | grep pg-db

# Test connection from container
docker exec ct216_web psql $DATABASE_URL -c "SELECT 1"
```

**Port already in use:**
```bash
# Change port in docker-compose.yml
# Or kill process using the port
lsof -i :3000
```

---

## Cloudflare Tunnel

If using Cloudflare Tunnel to expose app publicly:

1. Ensure tunnel is running
2. Point tunnel to `http://ct216_web:3000`
3. Test via tunnel URL

See DEPLOYMENT.md for tunnel setup.

---

## Database Migrations

First time setup:

```bash
# Run schema setup
psql $DATABASE_URL -f database/schema.sql
```

---

## Environment Variables

Required for deployment:

```
DATABASE_URL=postgresql://user:password@host:5432/db
JWT_SECRET=your-secret-key
NODE_ENV=production
```

Optional:

```
PORT=3000
LOG_LEVEL=info
```

---

## Monitoring

Check app health continuously:

```bash
# Monitor logs
docker logs -f ct216_web

# Check metrics
docker stats ct216_web

# Verify endpoints
curl https://ct216.semyon.ie/api/health
curl https://ct216.semyon.ie/login
```

---

## Rollback

If deployment fails:

```bash
# Stop current deployment
docker compose down

# Restart previous version
docker compose up -d
```

---

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for complete deployment guide.

Last Updated: Feb 6, 2026
