# Canvas + Vault Import Pipeline Optimization - Deployment Guide

## Overview

This guide documents the performance optimizations implemented to reduce Canvas and Vault import latency. The optimizations focus on three key areas:

1. **Backpressure + Staged Indexing** - Concurrency limits at each pipeline stage (ingest, OCR, embeddings)
2. **Two-Phase UX** - Files appear immediately after ingest; AI indexing completes in background
3. **Cold-Start Mitigation** - Marker readiness caching and worker keep-warm controls

**Key Result**: Files transition from "ingesting" → "indexing" → "indexed" status, with UX updates happening live throughout the process.

---

## Environment Variables Reference

All tuning knobs are environment variables and can be set in the ECS task definition without redeployment.

### Canvas Import Worker Concurrency

| Variable                         | Default         | Min   | Max     | Purpose                                                           |
| -------------------------------- | --------------- | ----- | ------- | ----------------------------------------------------------------- |
| `CANVAS_GLOBAL_FILE_CONCURRENCY` | 6               | 1     | 20      | Total concurrent file processing tasks across all courses/modules |
| `CANVAS_OCR_CONCURRENCY`         | 2               | 1     | 4       | Concurrent Marker OCR/extraction operations (GPU-limited)         |
| `CANVAS_EMBED_CONCURRENCY`       | 3               | 1     | 10      | Concurrent Cohere embedding operations                            |
| `CANVAS_FILE_TIMEOUT_MS`         | 600000 (10 min) | 60000 | 1800000 | Max time to wait for a single file to reach indexed status        |
| `CANVAS_PREWARM_MARKER`          | true            | -     | -       | Preload Marker service at job start (prevents cold-start delay)   |

### Cold-Start Controls

| Variable                            | Default         | Purpose                                                                                        |
| ----------------------------------- | --------------- | ---------------------------------------------------------------------------------------------- |
| `MARKER_READY_CACHE_MS`             | 90000 (1.5 min) | How long to cache Marker readiness checks (reduces repeated health checks)                     |
| `WORKER_KEEP_WARM`                  | false           | If true, worker polls for jobs even when idle (prevents AWS Lambda-style shutdown)             |
| `WORKER_IDLE_POLLS_BEFORE_SHUTDOWN` | 12              | Number of idle poll cycles before worker considers shutdown (only if `WORKER_KEEP_WARM=false`) |

---

## Pre-Deployment Checklist

Before deploying to production, verify:

- [ ] All tests pass locally: `npm test`
- [ ] Commit is on `dev` branch: `git log -1 --oneline`
- [ ] Code passes pre-commit hooks (ESLint, Prettier, type checks)
- [ ] Database migrations (if any) are tested in dev environment
- [ ] CloudWatch monitoring is configured for import metrics

---

## Deployment Steps

### 1. Deploy to Dev (Automated via GitHub Actions)

Push commits to the `dev` branch with changes to worker files:

```bash
git push origin dev
```

The GitHub Actions workflow `.github/workflows/deploy-worker.yml` will:

1. Build Docker image for the worker
2. Push to ECR (`723920043097.dkr.ecr.eu-west-1.amazonaws.com/oghmanotes-worker`)
3. Trigger new ECS deployment on the `canvas-import-worker` service

**Deployment time**: ~2–3 minutes (ECR push + ECS task replacement)

### 2. Test in Dev

After deployment completes:

1. Check ECS service health:

   ```bash
   aws ecs describe-services \
     --cluster oghmanotes \
     --services canvas-import-worker \
     --region eu-west-1 \
     --query 'services[0].[desiredCount,runningCount,deployments[0].desiredCount]'
   ```

2. Verify task logs in CloudWatch:

   ```
   /aws/ecs/oghmanotes/canvas-import-worker
   ```

   Look for:
   - ✓ Worker started successfully
   - ✓ Limiter concurrency caps active (log: "backpressure limiter")
   - ✓ Jobs processed (log: "Canvas import job started")

3. Test a Canvas import on dev:
   - Visit dev environment
   - Run a test course import
   - Monitor CloudWatch logs for:
     - Files transitioning through `ingesting` → `indexing` → `indexed` states
     - Marker cache hits: `marker readiness cache hit`
     - Indexing phase activation: `file marked as indexing`

### 3. Monitor Performance on Dev

**Key metrics to track**:

- **File ingestion time** (time from submission to "indexing" status)
- **Total import duration** (time from submission to "indexed" status)
- **Marker queue depth** (CloudWatch Custom Metrics)
- **ECS task CPU/memory utilization**

**CloudWatch Insights queries**:

```
// Files reaching "indexing" status (file now accessible in workspace)
fields @timestamp, fileId, @message
| filter @message like /marked as indexing/
| stats count() by bin(5m)

// Total time from submission to indexed
fields @timestamp, fileId, duration
| filter @message like /Canvas import completed/
| stats avg(duration), max(duration) by bin(5m)

// Marker OCR queue backpressure kicking in
fields @timestamp, concurrency, limit
| filter @message like /backpressure limiter/
| stats count() by limit
```

---

## ECS Autoscaling Setup

To enable automatic scaling of the worker service based on CPU utilization:

### Option A: AWS CLI (if AWS credentials configured)

Run the provided setup script:

```bash
AWS_REGION=eu-west-1 \
CLUSTER_NAME=oghmanotes \
SERVICE_NAME=canvas-import-worker \
bash infra/ecs-autoscaling-setup.sh
```

### Option B: AWS Console (manual)

1. **Register Scalable Target**:
   - Service: Application Auto Scaling
   - Resource: `service/oghmanotes/canvas-import-worker`
   - Min capacity: 1
   - Max capacity: 2
   - Dimension: `ecs:service:DesiredCount`

2. **Create Target-Tracking Policy**:
   - Policy name: `cpu-target-tracking-canvas-import-worker`
   - Metric: ECS Service Average CPU Utilization
   - Target value: 70%
   - Scale-out cooldown: 60s
   - Scale-in cooldown: 300s

**Result**: Service scales 1→2 tasks when average CPU > 70%, scales back to 1 when < 20%

---

## Promoting to Production

Once verified on dev:

1. **Create Pull Request** from `dev` → `main`
2. **Review changes**:
   - Core optimizations (backpressure, status tracking, cold-start)
   - Test coverage (285+ tests passing)
   - Breaking changes (should be none)
3. **Merge to main**
4. **Automated deployment**:
   - GitHub Actions will rebuild and deploy to production
   - ECS service `canvas-import-worker` in cluster `oghmanotes` updated
   - Amplify auto-deploys main to oghmanotes.ie

**Deployment time**: ~3–5 minutes (ECR push + ECS task replacement across production)

---

## Tuning for Production

After successful deployment, adjust concurrency and timeout values based on observed metrics:

### Conservative (Lower Throughput, More Stable)

```env
CANVAS_GLOBAL_FILE_CONCURRENCY=4
CANVAS_OCR_CONCURRENCY=1
CANVAS_EMBED_CONCURRENCY=2
CANVAS_FILE_TIMEOUT_MS=900000  # 15 minutes
CANVAS_PREWARM_MARKER=true
MARKER_READY_CACHE_MS=120000   # 2 minutes
```

### Balanced (Default - Recommended)

```env
CANVAS_GLOBAL_FILE_CONCURRENCY=6
CANVAS_OCR_CONCURRENCY=2
CANVAS_EMBED_CONCURRENCY=3
CANVAS_FILE_TIMEOUT_MS=600000  # 10 minutes
CANVAS_PREWARM_MARKER=true
MARKER_READY_CACHE_MS=90000    # 1.5 minutes
```

### Aggressive (Higher Throughput, Needs GPU Investment)

```env
CANVAS_GLOBAL_FILE_CONCURRENCY=10
CANVAS_OCR_CONCURRENCY=3
CANVAS_EMBED_CONCURRENCY=5
CANVAS_FILE_TIMEOUT_MS=480000  # 8 minutes
CANVAS_PREWARM_MARKER=true
MARKER_READY_CACHE_MS=60000    # 1 minute
```

**To apply**: Update the ECS task definition environment variables and trigger a new deployment.

---

## Critical Constraint: GPU Bottleneck

⚠️ **Important**: The primary bottleneck is **Marker (OCR) throughput**, which is GPU-limited.

- **Current Marker ASG**: 1 instance with 1 GPU (can handle ~2 concurrent PDFs)
- **Current Worker ECS**: 1 task (can handle ~6 concurrent files)
- **Imbalance**: Files queue faster than Marker can extract

### GPU Investment Recommendations

1. **Short-term** (if need immediate improvement):
   - Scale Marker ASG min/max to 2 instances
   - This doubles GPU capacity (2 concurrent PDFs)
   - Cost increase: ~$50–80/month

2. **Medium-term** (for 10x throughput):
   - Use GPU-optimized instances (e.g., `g4dn.xlarge` instead of `g4dn.large`)
   - Scale Marker ASG to 2–3 instances
   - Increase `CANVAS_OCR_CONCURRENCY` to 4–6

3. **Long-term** (architecture redesign):
   - Move Marker to parallel batch processing (e.g., AWS Lambda with GPU, or SageMaker)
   - Decouple OCR from embedding pipeline

**Current state**: Worker and ECS scaling are already optimized. **Next bottleneck fix must target GPU capacity**.

---

## Rollback Plan

If issues occur after production deployment:

1. **Identify issue**:

   ```bash
   # Check ECS service health
   aws ecs describe-services --cluster oghmanotes --services canvas-import-worker --region eu-west-1

   # Check recent deployments
   aws ecs describe-services --cluster oghmanotes --services canvas-import-worker --region eu-west-1 \
     --query 'services[0].deployments' --output table
   ```

2. **Rollback to previous version**:
   - GitHub Actions stores previous image tags in ECR
   - Redeploy with previous tag:
     ```bash
     aws ecs update-service \
       --cluster oghmanotes \
       --service canvas-import-worker \
       --force-new-deployment \
       --region eu-west-1
     ```
   - Or manually trigger the deploy workflow on the previous commit

3. **Scale down if needed**:
   ```bash
   aws ecs update-service \
     --cluster oghmanotes \
     --service canvas-import-worker \
     --desired-count 0 \
      --region eu-west-1
   ```

---

## Monitoring & Alerts

### CloudWatch Custom Metrics to Track

1. **Canvas Import Metrics**:
   - `canvas:ingestion_time_ms` - Time from file submission to "indexing" status
   - `canvas:total_time_ms` - Time from file submission to "indexed" status
   - `canvas:files_ingested` - Count of files ingested successfully
   - `canvas:files_indexed` - Count of files fully indexed

2. **Pipeline Health**:
   - `marker:queue_depth` - Number of files waiting for OCR
   - `canvas:backpressure_kicks_in` - Count of times concurrency limit was hit
   - `canvas:extraction_failures` - Count of OCR failures

### Alert Thresholds

| Metric                       | Threshold           | Action                                             |
| ---------------------------- | ------------------- | -------------------------------------------------- |
| `canvas:total_time_ms`       | > 15 min (900s) avg | Investigate Marker queue depth                     |
| `marker:queue_depth`         | > 20 files          | Scale Marker ASG or reduce OCR concurrency         |
| `canvas:extraction_failures` | > 5% of files       | Investigate Marker stability                       |
| ECS task CPU                 | > 85%               | Increase max capacity or reduce global concurrency |

---

## Files Modified in This Release

Core optimization files:

- `src/lib/canvas/import-worker.js` — Backpressure limiters, indexing phase, prewarm
- `src/lib/marker-ec2.ts` — Readiness cache and dedup ensure calls
- `src/lib/canvas/worker-entry.js` — Tunable idle threshold, keep-warm mode
- `src/app/api/canvas/status/route.js` — Indexed vs indexing tracking
- `src/hooks/useCanvasImportStatus.js` — Live tree refresh during import

Shared utilities (new):

- `src/lib/rag/indexing.ts` — Consolidated embedding replacements
- `src/lib/canvas/extraction-retry.ts` — Extraction retry logic

Supporting files:

- `.github/workflows/deploy-worker.yml` — Deployment automation
- `Dockerfile.worker` — Worker container definition
- `src/lib/ecs.ts` — ECS service management

---

## Support & Debugging

### Common Issues

**Files stuck in "indexing" for > 10 minutes**:

- Check Marker health: `curl https://<marker-ec2-ip>:3000/health`
- Check CloudWatch logs for OCR errors
- Reduce `CANVAS_OCR_CONCURRENCY` if Marker is overloaded
- Increase `CANVAS_FILE_TIMEOUT_MS` if timeout is being hit

**ECS task failing to start**:

- Check task logs in CloudWatch: `/aws/ecs/oghmanotes/canvas-import-worker`
- Verify environment variables are set correctly in task definition
- Check IAM role permissions for SQS, S3, RDS access

**Worker not picking up jobs**:

- Verify SQS queue is not empty: `aws sqs get-queue-attributes --queue-url <url> --attribute-names ApproximateNumberOfMessages`
- Check worker logs for polling errors
- Restart worker: `aws ecs update-service --cluster oghmanotes --service canvas-import-worker --force-new-deployment`

### Debug Commands

```bash
# Check worker task logs (last 1000 lines)
aws logs tail /aws/ecs/oghmanotes/canvas-import-worker --follow

# Check SQS queue depth
aws sqs get-queue-attributes \
  --queue-url https://sqs.eu-west-1.amazonaws.com/723920043097/canvas-import-jobs \
  --attribute-names ApproximateNumberOfMessages

# Test Marker health
curl -I https://<marker-ec2-private-ip>:3000/health

# Force new ECS deployment
aws ecs update-service \
  --cluster oghmanotes \
  --service canvas-import-worker \
  --force-new-deployment \
  --region eu-west-1
```

---

## Next Steps

- [ ] Run `ecs-autoscaling-setup.sh` to enable autoscaling (once AWS CLI is configured)
- [ ] Monitor dev deployment for 24 hours
- [ ] Collect metrics on file ingestion times and total import duration
- [ ] Plan GPU investment for Marker (see [GPU Bottleneck](#critical-constraint-gpu-bottleneck))
- [ ] Document final tuning parameters based on production metrics
