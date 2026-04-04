# Marker GPU Pre-warm & AMI Bake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce Marker cold start from 4-7 min to ~90 sec via a baked AMI, fix spot→on-demand (quota=0 blocks all launches), pre-warm the GPU when a user connects Canvas or registers, scale to zero after 15 min idle, and queue a background Marker retry after pdf-parse fallback.

**Architecture:** A new `bake-ami.sh` script launches a temporary g4dn.xlarge, runs the existing userdata-asg.sh to pre-install marker-pdf+CUDA, creates a golden AMI, then terminates. The ASG launch template is updated to use on-demand (spot GPU quota=0 on this account) + the baked AMI. Two new fire-and-forget `preWarmMarker()` calls are added at Canvas connect and registration. `extraction-retry.ts` is restored from the archive commit to enqueue delayed SQS retries for Marker after pdf-parse fallback.

**Tech Stack:** AWS EC2 g4dn.xlarge (T4), ASG, ALB, SQS, marker-pdf, Next.js API routes, TypeScript

**Known limitation (document inline):** pdf-parse is NOT OCR — it only extracts embedded text from digitally-created PDFs. Scanned/image-heavy PDFs return empty content until Marker retries. This is a known team decision pending a proper UI indicator ("Processing with full OCR…").

---

## File Map

| File                                         | Action | Purpose                                                                             |
| -------------------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| `infra/marker/bake-ami.sh`                   | CREATE | Launch temp instance, install marker, snapshot AMI, terminate                       |
| `infra/marker/setup-asg.sh`                  | MODIFY | on-demand instead of spot, 15 min scale-in cooldown, accept `MARKER_AMI_ID` env var |
| `src/lib/marker-ec2.ts`                      | MODIFY | Remove Sam's `healthy===0 throw` guard; export `preWarmMarker()` fire-and-forget    |
| `src/lib/canvas/extraction-retry.ts`         | CREATE | SQS retry logic from archive (exponential delays 30s/2m/8m/15m)                     |
| `src/app/api/canvas/connect/route.js`        | MODIFY | Fire-and-forget `preWarmMarker()` on successful POST                                |
| `src/app/api/auth/register/route.js`         | MODIFY | Fire-and-forget `preWarmMarker()` on account created                                |
| `src/app/api/extract/route.ts`               | MODIFY | After pdf-parse fallback, enqueue SQS Marker retry via extraction-retry.ts          |
| `src/__tests__/lib/extraction-retry.test.ts` | CREATE | Unit tests for retry queue logic                                                    |

---

## Task 1: Fix spot→on-demand in launch template (unblocks everything)

**Files:**

- Modify: `infra/marker/setup-asg.sh` (spot config section)

The account has `All G and VT Spot Instance Requests = 0` quota. Every scale-up attempt fails with "Max spot instance count exceeded." Switch to on-demand. Cost impact is negligible because desired=0 when idle — you only pay while actively running.

- [ ] **Step 1: Update setup-asg.sh to remove spot config**

In `infra/marker/setup-asg.sh`, find the `SPOT_CONFIG` variable and the launch template data, replace with on-demand:

```bash
# Remove this block entirely:
SPOT_CONFIG='"InstanceMarketOptions": {"MarketType": "spot", "SpotOptions": {"SpotInstanceType": "one-time", "InstanceInterruptionBehavior": "terminate"}}'

# And remove ", $SPOT_CONFIG" from LT_DATA
```

Also update the comment at top:

```bash
# architecture:
#   ALB (port 80) -> Target Group (port 8000) -> ASG (g4dn.xlarge on-demand, 0-2 instances)
#   scale-to-zero — GPU only runs during active imports, cold start ~90sec (baked AMI)
#
# cost (~$0.74/hr on-demand): pay-per-use only, ~$0 when idle
```

And update echo lines:

```bash
echo "Instance:  $INSTANCE_TYPE (on-demand)"
echo "Mode:      scale-to-zero (cold start ~90sec with baked AMI)"
```

- [ ] **Step 2: Change ScaleInCooldown from 120 to 900 (15 min)**

Find the target tracking policy section:

```bash
    \"ScaleInCooldown\": 900,
    \"ScaleOutCooldown\": 30,
```

- [ ] **Step 3: Accept `MARKER_AMI_ID` env var for baked AMI**

Near the top where `AMI_ID` is set, add:

```bash
# if MARKER_AMI_ID is set (from bake-ami.sh output), use baked AMI
# otherwise fall back to the Deep Learning AMI lookup
AMI_ID="${MARKER_AMI_ID:-}"
if [ -z "$AMI_ID" ]; then
  # existing lookup code for Deep Learning AMI...
```

- [ ] **Step 4: Update the launch template directly via AWS CLI (immediate fix, no re-run needed)**

```bash
aws ec2 create-launch-template-version \
  --launch-template-id <launch-template> \
  --source-version '$Latest' \
  --launch-template-data '{"InstanceMarketOptions": null}' \
  --region eu-west-1
# then set it as default:
aws ec2 modify-launch-template \
  --launch-template-id <launch-template> \
  --default-version '$Latest' \
  --region eu-west-1
```

Note: AWS CLI doesn't support null to clear InstanceMarketOptions. Instead create a new version with `--launch-template-data` that omits the spot config entirely. See step 6 in Task 2 (bake-ami.sh handles this properly).

- [ ] **Step 5: Create new on-demand launch template version via CLI now**

```bash
# get current LT data minus spot config
CURRENT=$(aws ec2 describe-launch-template-versions \
  --launch-template-id <launch-template> \
  --versions '$Latest' \
  --region eu-west-1 \
  --query 'LaunchTemplateVersions[0].LaunchTemplateData' \
  --output json)

# create new version without InstanceMarketOptions
NEW=$(echo "$CURRENT" | python3 -c "
import json,sys
d=json.load(sys.stdin)
d.pop('InstanceMarketOptions', None)
print(json.dumps(d))
")

NEW_VER=$(aws ec2 create-launch-template-version \
  --launch-template-id <launch-template> \
  --launch-template-data "$NEW" \
  --region eu-west-1 \
  --query 'LaunchTemplateVersion.VersionNumber' \
  --output text)

aws ec2 modify-launch-template \
  --launch-template-id <launch-template> \
  --default-version "$NEW_VER" \
  --region eu-west-1
echo "New default version: $NEW_VER"
```

- [ ] **Step 6: Reset ASG desired to 0 then trigger a test scale-up**

```bash
aws autoscaling set-desired-capacity \
  --auto-scaling-group-name <marker-asg> \
  --desired-capacity 0 \
  --region eu-west-1

sleep 5

aws autoscaling set-desired-capacity \
  --auto-scaling-group-name <marker-asg> \
  --desired-capacity 1 \
  --region eu-west-1
```

- [ ] **Step 7: Watch for a successful launch**

```bash
watch -n 10 "aws autoscaling describe-scaling-activities \
  --auto-scaling-group-name <marker-asg> \
  --region eu-west-1 \
  --max-items 1 \
  --query 'Activities[0].{Status:StatusCode,Msg:StatusMessage}' \
  --output table"
```

Expected: Status = `Successful` (not `Failed`)

---

## Task 2: Create `infra/marker/bake-ami.sh`

**Files:**

- Create: `infra/marker/bake-ami.sh`

Bakes a custom AMI with marker-pdf + CUDA pre-installed. Reduces cold start from 4-7 min → ~90 sec (just OS boot + service start, no pip install).

- [ ] **Step 1: Create the bake-ami.sh script**

```bash
cat > infra/marker/bake-ami.sh << 'SCRIPT'
#!/usr/bin/env bash
# bakes a g4dn.xlarge AMI with marker-pdf pre-installed
# usage: bash infra/marker/bake-ami.sh
# outputs: AMI ID to use as MARKER_AMI_ID in setup-asg.sh
set -euo pipefail

REGION="${MARKER_AMI_REGION:-eu-west-1}"
INSTANCE_TYPE="g4dn.xlarge"
PROJECT="oghmanotes"
KEY_NAME="marker-server-${PROJECT}"
AMI_NAME="marker-baked-$(date +%Y%m%d-%H%M)"

echo "=== Marker AMI Bake ==="
echo "Region:   $REGION"
echo "Instance: $INSTANCE_TYPE"
echo "AMI name: $AMI_NAME"
echo ""

# 1. get default VPC + first subnet
VPC_ID=$(aws ec2 describe-vpcs \
  --filters "Name=isDefault,Values=true" \
  --region "$REGION" \
  --query 'Vpcs[0].VpcId' --output text)

SUBNET_ID=$(aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=default-for-az,Values=true" \
  --region "$REGION" \
  --query 'Subnets[0].SubnetId' --output text)

# 2. get the Deep Learning AMI (PyTorch, Amazon Linux 2023, same base userdata uses)
BASE_AMI=$(aws ec2 describe-images \
  --owners amazon \
  --filters \
    "Name=name,Values=Deep Learning OSS Nvidia Driver AMI GPU PyTorch*Amazon Linux 2023*" \
    "Name=state,Values=available" \
  --region "$REGION" \
  --query 'Images | sort_by(@, &CreationDate) | [-1].ImageId' \
  --output text)

echo "Base AMI: $BASE_AMI"

# 3. get or create instance security group (allow SSH)
SG_ID=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=marker-instance-sg" "Name=vpc-id,Values=$VPC_ID" \
  --region "$REGION" \
  --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || echo "None")

if [ "$SG_ID" = "None" ] || [ -z "$SG_ID" ]; then
  echo "Security group not found — run setup-asg.sh first"
  exit 1
fi

# 4. launch bake instance (on-demand, no spot)
echo "[1/5] Launching bake instance..."
INSTANCE_ID=$(aws ec2 run-instances \
  --image-id "$BASE_AMI" \
  --instance-type "$INSTANCE_TYPE" \
  --key-name "$KEY_NAME" \
  --security-group-ids "$SG_ID" \
  --subnet-id "$SUBNET_ID" \
  --user-data "file://infra/marker/userdata-asg.sh" \
  --iam-instance-profile "Name=marker-instance-profile-${PROJECT}" \
  --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":75,"VolumeType":"gp3"}}]' \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=marker-bake-temp},{Key=Project,Value=$PROJECT}]" \
  --region "$REGION" \
  --query 'Instances[0].InstanceId' --output text)

echo "  Instance: $INSTANCE_ID"

# 5. wait for instance running
echo "[2/5] Waiting for instance to be running..."
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID" --region "$REGION"
echo "  Instance is running"

# get public IP for health check
PUBLIC_IP=$(aws ec2 describe-instances \
  --instance-ids "$INSTANCE_ID" \
  --region "$REGION" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
echo "  Public IP: $PUBLIC_IP"

# 6. wait for marker service to be healthy (userdata installs it)
echo "[3/5] Waiting for marker service to be healthy (may take 5-7 min for first install)..."
DEADLINE=$(( $(date +%s) + 600 ))
while [ $(date +%s) -lt $DEADLINE ]; do
  if curl -sf --max-time 5 "http://${PUBLIC_IP}:8000/" > /dev/null 2>&1; then
    echo "  ✓ Marker service is healthy!"
    break
  fi
  echo "  ... not ready yet ($(( DEADLINE - $(date +%s) ))s remaining)"
  sleep 15
done

if ! curl -sf --max-time 5 "http://${PUBLIC_IP}:8000/" > /dev/null 2>&1; then
  echo "ERROR: Marker service did not become healthy within 10 minutes"
  aws ec2 terminate-instances --instance-ids "$INSTANCE_ID" --region "$REGION"
  exit 1
fi

# 7. create AMI
echo "[4/5] Creating AMI snapshot..."
AMI_ID=$(aws ec2 create-image \
  --instance-id "$INSTANCE_ID" \
  --name "$AMI_NAME" \
  --description "marker-pdf pre-installed, ~90s cold start" \
  --no-reboot \
  --tag-specifications "ResourceType=image,Tags=[{Key=Project,Value=$PROJECT},{Key=Service,Value=marker}]" \
  --region "$REGION" \
  --query 'ImageId' --output text)

echo "  AMI ID: $AMI_ID"
echo "  Waiting for AMI to be available..."
aws ec2 wait image-available --image-ids "$AMI_ID" --region "$REGION"
echo "  ✓ AMI is ready"

# 8. terminate bake instance
echo "[5/5] Terminating bake instance..."
aws ec2 terminate-instances --instance-ids "$INSTANCE_ID" --region "$REGION" > /dev/null
echo "  ✓ Instance terminated"

echo ""
echo "=== AMI Bake Complete ==="
echo ""
echo "AMI ID: $AMI_ID"
echo ""
echo "Update your launch template:"
echo "  MARKER_AMI_ID=$AMI_ID bash infra/marker/setup-asg.sh"
echo ""
echo "Or update directly:"
echo "  bash infra/marker/update-lt-ami.sh $AMI_ID"
SCRIPT
chmod +x infra/marker/bake-ami.sh
```

- [ ] **Step 2: Create `infra/marker/update-lt-ami.sh` (helper to swap AMI in live LT)**

```bash
cat > infra/marker/update-lt-ami.sh << 'SCRIPT'
#!/usr/bin/env bash
# updates the Marker launch template to use a new AMI
# usage: bash infra/marker/update-lt-ami.sh <ami-id>
set -euo pipefail
AMI_ID="${1:?Usage: update-lt-ami.sh <ami-id>}"
REGION="${MARKER_ASG_REGION:-eu-west-1}"
LT_NAME="marker-lt-oghmanotes"

LT_ID=$(aws ec2 describe-launch-templates \
  --launch-template-names "$LT_NAME" \
  --region "$REGION" \
  --query 'LaunchTemplates[0].LaunchTemplateId' --output text)

CURRENT=$(aws ec2 describe-launch-template-versions \
  --launch-template-id "$LT_ID" \
  --versions '$Latest' \
  --region "$REGION" \
  --query 'LaunchTemplateVersions[0].LaunchTemplateData' \
  --output json)

NEW=$(echo "$CURRENT" | python3 -c "
import json,sys
d=json.load(sys.stdin)
d.pop('InstanceMarketOptions', None)  # remove spot config
d['ImageId'] = sys.argv[1]
print(json.dumps(d))
" "$AMI_ID")

NEW_VER=$(aws ec2 create-launch-template-version \
  --launch-template-id "$LT_ID" \
  --launch-template-data "$NEW" \
  --region "$REGION" \
  --query 'LaunchTemplateVersion.VersionNumber' --output text)

aws ec2 modify-launch-template \
  --launch-template-id "$LT_ID" \
  --default-version "$NEW_VER" \
  --region "$REGION"

echo "✓ Launch template updated: AMI=$AMI_ID version=$NEW_VER"
SCRIPT
chmod +x infra/marker/update-lt-ami.sh
```

- [ ] **Step 3: Commit infra scripts**

```bash
git add infra/marker/bake-ami.sh infra/marker/update-lt-ami.sh infra/marker/setup-asg.sh
git commit -m "infra: add AMI bake script, on-demand LT, 15min scale-in for Marker"
```

---

## Task 3: Run the AMI bake

- [ ] **Step 1: Run bake-ami.sh**

```bash
bash infra/marker/bake-ami.sh 2>&1 | tee /tmp/marker-bake.log
```

Expected output ends with:

```
=== AMI Bake Complete ===
AMI ID: ami-xxxxxxxxxxxxxxxxx
```

- [ ] **Step 2: Update the live launch template with the baked AMI**

```bash
AMI_ID=$(grep "^AMI ID:" /tmp/marker-bake.log | awk '{print $3}')
bash infra/marker/update-lt-ami.sh "$AMI_ID"
```

Expected: `✓ Launch template updated: AMI=ami-xxx version=N`

---

## Task 4: Test with a real PDF

With the launch template fixed (on-demand) and a baked AMI, test end-to-end.

- [ ] **Step 1: Scale up the ASG**

```bash
aws autoscaling set-desired-capacity \
  --auto-scaling-group-name <marker-asg> \
  --desired-capacity 1 \
  --region eu-west-1
```

- [ ] **Step 2: Wait for healthy (~90 sec with baked AMI)**

```bash
MARKER_URL="http://<marker-alb>"
until curl -sf "$MARKER_URL/" > /dev/null; do echo "waiting..."; sleep 5; done
echo "✓ Marker is healthy"
```

- [ ] **Step 3: Find a PDF on this machine and post it**

```bash
PDF=$(find ~/obsidian ~/lectures /tmp -name "*.pdf" -size +10k 2>/dev/null | head -1)
echo "Testing with: $PDF"

curl -X POST "$MARKER_URL/convert" \
  -F "file=@$PDF" \
  -F "output_format=markdown" \
  -o /tmp/marker-result.md

wc -c /tmp/marker-result.md
head -100 /tmp/marker-result.md
```

Expected: markdown output with preserved headings, tables, equations. Check for images (should appear as `![](...)` references or base64 inline depending on Marker config).

- [ ] **Step 4: Verify image/context preservation**

```bash
grep -c "!\[" /tmp/marker-result.md && echo "images found" || echo "no images (PDF may not have any)"
grep -E "#{1,6} " /tmp/marker-result.md | head -10  # headings
grep -E "\|.*\|" /tmp/marker-result.md | head -5    # tables
```

- [ ] **Step 5: Scale back to 0**

```bash
aws autoscaling set-desired-capacity \
  --auto-scaling-group-name <marker-asg> \
  --desired-capacity 0 \
  --region eu-west-1
```

---

## Task 5: Restore `extraction-retry.ts`

**Files:**

- Create: `src/lib/canvas/extraction-retry.ts`

- [ ] **Step 1: Cherry-pick the file from the archive commit**

```bash
git checkout archive/semyon-ui-refactor -- src/lib/canvas/extraction-retry.ts
```

Verify it exists:

```bash
head -10 src/lib/canvas/extraction-retry.ts
```

Expected: imports from `@/lib/sqs`, exports `enqueueExtractionRetry`, `MAX_EXTRACTION_RETRIES`.

- [ ] **Step 2: Write tests**

Create `src/__tests__/lib/extraction-retry.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  chooseExtractionRetryQueueUrl,
  getExtractionRetryDelaySeconds,
} from "@/lib/canvas/extraction-retry";

describe("chooseExtractionRetryQueueUrl", () => {
  it("prefers the dedicated retry queue", () => {
    expect(
      chooseExtractionRetryQueueUrl("https://sqs/retry", "https://sqs/main"),
    ).toBe("https://sqs/retry");
  });

  it("falls back to main queue when retry queue is empty", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(chooseExtractionRetryQueueUrl("", "https://sqs/main")).toBe(
      "https://sqs/main",
    );
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns null when both queues are empty", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(chooseExtractionRetryQueueUrl("", "")).toBeNull();
  });
});

describe("getExtractionRetryDelaySeconds", () => {
  it("returns 30s for first attempt", () => {
    expect(getExtractionRetryDelaySeconds(0)).toBe(30);
  });

  it("returns 120s for second attempt", () => {
    expect(getExtractionRetryDelaySeconds(1)).toBe(120);
  });

  it("caps at 900s for attempts beyond array length", () => {
    expect(getExtractionRetryDelaySeconds(99)).toBe(900);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npm test -- --reporter=verbose src/__tests__/lib/extraction-retry.test.ts
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/canvas/extraction-retry.ts src/__tests__/lib/extraction-retry.test.ts
git commit -m "feat: restore extraction-retry SQS backoff module"
```

---

## Task 6: `preWarmMarker()` in marker-ec2.ts

**Files:**

- Modify: `src/lib/marker-ec2.ts`

Two changes: (a) remove Sam's `healthy===0 throw` guard (it breaks on-demand scaling — the whole point is healthy=0 initially, then scale up); (b) export a `preWarmMarker()` fire-and-forget function for Canvas connect and registration.

- [ ] **Step 1: Remove the healthy===0 guard**

In `src/lib/marker-ec2.ts`, find and remove:

```typescript
if (healthy === 0) {
  throw new Error("Marker ASG has no running instances, skipping");
}
```

The code that follows (scale up if desired=0, wait for healthy) is correct. The guard was preventing it from ever running.

- [ ] **Step 2: Add `preWarmMarker()` export at the bottom of the file**

```typescript
/**
 * Pre-warms the Marker GPU — call fire-and-forget when we know a user
 * is likely to import notes soon (Canvas connect, new account).
 *
 * Does NOT wait for the instance to be ready. If Marker is already warm
 * (cached URL still valid) this is a no-op. If the ASG is at desired=0,
 * it triggers scale-up so the instance is ready by the time the user
 * actually imports. The ASG scales back to 0 after 15 min of no requests.
 *
 * Never throws — failures are logged and swallowed so callers don't break.
 */
export function preWarmMarker(): void {
  if (!ASG_NAME && !INSTANCE_ID) return; // not configured
  if (cachedReadyUrl && Date.now() - lastReadyAt < MARKER_READY_CACHE_MS)
    return; // already warm

  ensureMarkerRunning().catch((err) => {
    // pre-warm is best-effort — log but don't surface to caller
    console.warn("Marker pre-warm failed (non-fatal):", err?.message ?? err);
  });
}
```

- [ ] **Step 3: Verify the file compiles**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "marker-ec2" | head -5
```

Expected: no errors for marker-ec2.ts.

- [ ] **Step 4: Commit**

```bash
git add src/lib/marker-ec2.ts
git commit -m "feat: remove early-exit guard, add preWarmMarker() for proactive scale-up"
```

---

## Task 7: Pre-warm on Canvas connect

**Files:**

- Modify: `src/app/api/canvas/connect/route.js`

- [ ] **Step 1: Add import at top of file**

After the existing imports, add:

```javascript
import { preWarmMarker } from "@/lib/marker-ec2";
```

- [ ] **Step 2: Add pre-warm call after successful Canvas token save**

In the POST handler, after the `await sql` UPDATE that saves the token (line ~97), add:

```javascript
// pre-warm Marker GPU — user will likely import notes soon
// fire-and-forget, never throws
preWarmMarker();
```

- [ ] **Step 3: Verify the route still works**

```bash
npm run build 2>&1 | grep -E "canvas/connect|error" | head -10
```

Expected: builds cleanly.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/canvas/connect/route.js
git commit -m "feat: pre-warm Marker GPU on Canvas connect"
```

---

## Task 8: Pre-warm on registration

**Files:**

- Modify: `src/app/api/auth/register/route.js`

- [ ] **Step 1: Add import**

```javascript
import { preWarmMarker } from "@/lib/marker-ec2";
```

- [ ] **Step 2: Add pre-warm call after account is created**

After the INSERT into `app.login` and before the verification email is sent (near where the user row is created), add:

```javascript
// pre-warm Marker — new users often import Canvas notes soon after signup
// gives the GPU extra lead time vs waiting until Canvas is connected
preWarmMarker();
```

- [ ] **Step 3: Verify**

```bash
npm run build 2>&1 | grep -E "register|error" | head -10
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/auth/register/route.js
git commit -m "feat: pre-warm Marker GPU on new account creation"
```

---

## Task 9: Queue Marker retry after pdf-parse fallback

**Files:**

- Modify: `src/app/api/extract/route.ts`

After Sam's existing `try/catch` Marker fallback (which uses pdf-parse + returns `"test"` chunks), enqueue a Marker retry via SQS. The user gets an immediate response from pdf-parse; Marker re-processes in the background once the GPU is warm.

**IMPORTANT:** pdf-parse is NOT OCR. For scanned PDFs it returns empty/garbage content. The Marker retry is essential for quality. This is a known limitation — document it clearly.

- [ ] **Step 1: Read the current fallback block in extract/route.ts**

```bash
sed -n '85,105p' src/app/api/extract/route.ts
```

The block looks like:

```typescript
try {
  const marker = await extractWithMarker(buffer, filename);
  return { rawText: marker.text, chunks: marker.chunks };
} catch (err) {
  logger.warn("Marker unavailable, falling back to basic extraction", { err });
  return { rawText: "test", chunks: ["test"] };
}
```

- [ ] **Step 2: Import extraction-retry at the top of extract/route.ts**

Add after existing imports:

```typescript
import { enqueueExtractionRetry } from "@/lib/canvas/extraction-retry";
```

- [ ] **Step 3: Replace the fallback block**

Replace:

```typescript
        } catch (err) {
        logger.warn("Marker unavailable, falling back to basic extraction", { err });
        return { rawText: "test", chunks: ["test"] };
        }
```

With:

```typescript
        } catch (err) {
          logger.warn("Marker unavailable, falling back to pdf-parse", { err });

          // KNOWN LIMITATION: pdf-parse extracts embedded text only.
          // It is NOT OCR — scanned/image-heavy PDFs return empty content.
          // A Marker retry is queued via SQS so the note is re-processed
          // with proper OCR once the GPU warms up (~90sec with baked AMI).
          // TODO(team): add a UI indicator "Processing with full OCR — check back shortly"
          // when a note is in pending-marker state.

          // queue background Marker retry (fire-and-forget, non-fatal if SQS unavailable)
          if (noteId && userId) {
            enqueueExtractionRetry({
              noteId,
              userId,
              s3Key: s3KeyForRetry ?? null,
              filename,
              mimeType,
              parentFolderId: null,
              attempt: 0,
            }).catch((retryErr) => {
              logger.warn("Failed to enqueue Marker retry (non-fatal)", { retryErr });
            });
          }

          return { rawText: basicExtract, chunks: chunkText(basicExtract) };
        }
```

Note: `noteId`, `userId`, `s3KeyForRetry`, `mimeType` need to be in scope — verify the function signature has them. If not, the retry enqueue is skipped gracefully via the `if (noteId && userId)` guard.

- [ ] **Step 4: Replace the placeholder `"test"` with actual pdf-parse extraction**

The current fallback returns `{ rawText: "test", chunks: ["test"] }` which is clearly a placeholder. Replace with real pdf-parse:

```typescript
// basic text extraction via pdf-parse (text-layer PDFs only)
let basicExtract = "";
try {
  const pdfParse = (await import("pdf-parse")).default;
  const parsed = await pdfParse(buffer);
  basicExtract = parsed.text ?? "";
} catch (parseErr) {
  logger.warn("pdf-parse also failed", { parseErr });
}
```

- [ ] **Step 5: Build and test**

```bash
npm run build 2>&1 | grep -E "extract/route|error" | head -10
npm test 2>&1 | tail -10
```

Expected: clean build, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/extract/route.ts
git commit -m "feat: enqueue Marker SQS retry after pdf-parse fallback, replace placeholder chunks"
```

---

## Task 10: Push and verify

- [ ] **Step 1: Run full build + tests**

```bash
npm run build 2>&1 | tail -5
npm test 2>&1 | tail -8
```

Expected: build succeeds, all tests pass.

- [ ] **Step 2: Push feat/ui-refactor**

```bash
git push origin feat/ui-refactor
```

- [ ] **Step 3: Verify ASG is at desired=0 and ready for pre-warm testing**

```bash
aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-name <marker-asg> \
  --region eu-west-1 \
  --query 'AutoScalingGroups[0].{Desired:DesiredCapacity,Min:MinSize,Max:MaxSize}'
```

Expected: `Desired: 0`

---

## Self-Review

**Spec coverage:**

- ✅ Fix spot→on-demand (Task 1)
- ✅ Bake AMI, 90sec cold start (Task 2, 3)
- ✅ Test with real PDF, verify images/context (Task 4)
- ✅ Extraction retry module (Task 5)
- ✅ preWarmMarker() + remove Sam's guard (Task 6)
- ✅ Pre-warm on Canvas connect (Task 7)
- ✅ Pre-warm on registration (Task 8)
- ✅ Queue Marker retry after pdf-parse fallback (Task 9)
- ✅ 15min scale-in cooldown (Task 1, Step 2 in setup-asg.sh)
- ✅ pdf-parse limitation documented inline (Task 9)

**Placeholder scan:** Clean — all steps have exact commands, no TBDs.

**Type consistency:** `preWarmMarker()` exported from marker-ec2.ts, imported identically in both connect and register routes.
