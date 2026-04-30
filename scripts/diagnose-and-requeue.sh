#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }
log_section() { echo -e "\n${MAGENTA}══ $1 ══${NC}"; }
log_debug() { echo -e "${CYAN}◆${NC} $1"; }

# Load env when present
if [ -f ./.env ]; then
  set -a
  . ./.env
  set +a
fi

AWS_REGION="${AWS_REGION:-eu-west-1}"
DATABASE_URL="${DATABASE_URL:-}"

log_section "RAG PIPELINE DIAGNOSTIC & REQUEUE"
log_info "Starting Marker diagnostics and pending_retry requeue...\n"

if [ -z "$DATABASE_URL" ]; then
  log_error "DATABASE_URL not set"
  exit 1
fi

# ============================================================================
# 1. MARKER HEALTH CHECK
# ============================================================================

log_section "MARKER DIAGNOSTICS"

log_info "Testing Marker endpoint: $MARKER_API_URL"

MARKER_HEALTHY=false
if [ -n "$MARKER_API_URL" ]; then
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 5 "$MARKER_API_URL/" 2>/dev/null || echo "0")
  if [ "$HTTP_CODE" = "200" ]; then
    log_success "Marker / endpoint returned HTTP 200 (Healthy)"
    MARKER_HEALTHY=true
  elif [ "$HTTP_CODE" = "502" ]; then
    log_error "Marker / endpoint returned HTTP 502 (Bad Gateway)"
  else
    log_warn "Marker / endpoint returned HTTP $HTTP_CODE"
  fi
fi

# ============================================================================
# 2. QUERY DATABASE DIRECTLY
# ============================================================================

log_section "PENDING_RETRY ANALYSIS"

# Get data as CSV
SQL_QUERY="
SELECT 
  ci.id, 
  ci.note_id, 
  ci.filename, 
  ci.attempt_number,
  COALESCE(n.deleted, false) as deleted,
  (SELECT COUNT(*) FROM app.chunks WHERE document_id = ci.note_id) AS chunks_count,
  (SELECT COUNT(*) FROM app.embeddings e 
   JOIN app.chunks c ON c.id = e.chunk_id 
   WHERE c.document_id = ci.note_id) AS embeddings_count
FROM app.canvas_imports ci
LEFT JOIN app.notes n ON n.note_id = ci.note_id
WHERE ci.status = 'pending_retry'
ORDER BY ci.attempt_number DESC, ci.updated_at DESC;
"

QUERY_RESULT=$(psql "$DATABASE_URL" -t -A -F',' -c "$SQL_QUERY" 2>&1)

if [ $? -ne 0 ]; then
  log_error "Database query failed: $QUERY_RESULT"
  exit 1
fi

# Parse results and count
TOTAL_ITEMS=0
VALID_IDS=""
VALID_COUNT=0
DELETED_COUNT=0
COMPLETE_COUNT=0

while IFS=',' read -r id note_id filename attempt deleted chunks_count embeddings_count; do
  [ -z "$id" ] && continue
  
  TOTAL_ITEMS=$((TOTAL_ITEMS + 1))
  
  if [ "$deleted" = "t" ]; then
    DELETED_COUNT=$((DELETED_COUNT + 1))
  elif [ "$embeddings_count" -ge "$chunks_count" ]; then
    COMPLETE_COUNT=$((COMPLETE_COUNT + 1))
  else
    VALID_COUNT=$((VALID_COUNT + 1))
    VALID_IDS="$VALID_IDS $id"
    log_debug "Valid: ID=$id, note=$note_id, attempt=$attempt"
  fi
done <<< "$QUERY_RESULT"

log_success "Loaded $TOTAL_ITEMS pending_retry items"
log_success "Valid for requeue: $VALID_COUNT"
log_warn "Invalid - Note deleted: $DELETED_COUNT"
log_warn "Invalid - Extraction complete: $COMPLETE_COUNT"

# ============================================================================
# 3. CREATE FRESH JOB & REQUEUE
# ============================================================================

if [ $VALID_COUNT -eq 0 ]; then
  log_warn "No valid items to requeue - all pending items are either deleted or already complete"
  NEW_JOB_ID="(none)"
  QUEUED_COUNT=0
else
  log_section "CREATING FRESH JOB & REQUEUING"

  # Create fresh job
  NEW_JOB_ID=$(psql "$DATABASE_URL" -t -A -c "
    INSERT INTO app.canvas_import_jobs (status, created_at, updated_at)
    VALUES ('queued', NOW(), NOW())
    RETURNING id;
  " 2>&1)

  if [ $? -ne 0 ]; then
    log_error "Failed to create job: $NEW_JOB_ID"
    exit 1
  fi

  log_success "Created fresh canvas_import_job: $NEW_JOB_ID"

  # Update canvas_imports records
  ITEM_ID_LIST=$(echo $VALID_IDS | tr ' ' ',' | sed 's/^,//' | sed 's/,$//')
  
  psql "$DATABASE_URL" -c "
    UPDATE app.canvas_imports 
    SET job_id = $NEW_JOB_ID, status = 'queued', attempt_number = 1, updated_at = NOW()
    WHERE id IN ($ITEM_ID_LIST);
  " 2>&1

  if [ $? -ne 0 ]; then
    log_error "Failed to update canvas_imports"
    exit 1
  fi

  log_success "Updated $VALID_COUNT canvas_imports records"

  # Queue to SQS
  if [ -z "$SQS_QUEUE_URL" ]; then
    log_error "SQS_QUEUE_URL not set, cannot queue messages"
    QUEUED_COUNT=0
  else
    log_info "Queuing $VALID_COUNT items to SQS..."

    QUEUED_COUNT=0
    while IFS=',' read -r id note_id filename attempt deleted chunks_count embeddings_count; do
      [ -z "$id" ] && continue
      
      # Only queue valid items
      if [ "$deleted" != "t" ] && [ "$embeddings_count" -lt "$chunks_count" ]; then
        ESCAPED_FILENAME=$(echo "$filename" | sed 's/"/\\"/g')
        
        aws sqs send-message \
          --queue-url "$SQS_QUEUE_URL" \
          --message-body "{\"job_id\":$NEW_JOB_ID,\"note_id\":\"$note_id\",\"filename\":\"$ESCAPED_FILENAME\",\"import_id\":$id,\"attempt_number\":1,\"retry\":true}" \
          --region "$AWS_REGION" 2>&1 > /dev/null
        
        QUEUED_COUNT=$((QUEUED_COUNT + 1))
      fi
    done <<< "$QUERY_RESULT"

    log_debug "Sent $QUEUED_COUNT messages to SQS"
  fi
fi

# ============================================================================
# FINAL REPORT
# ============================================================================

log_section "FINAL REPORT"

log_info ""
log_info "Marker Status:"
if [ "$MARKER_HEALTHY" = true ]; then
  log_success "  ✓ Marker API is healthy and ready"
else
  log_error "  ✗ Marker API is unhealthy (HTTP 502 or unreachable)"
fi

log_info ""
log_info "Pending Retry Backlog:"
log_info "  Total: $TOTAL_ITEMS"
log_success "  Valid (requeued): $VALID_COUNT"
log_warn "  Skipped (note deleted): $DELETED_COUNT"
log_warn "  Skipped (extraction complete): $COMPLETE_COUNT"

if [ "$NEW_JOB_ID" != "(none)" ]; then
  log_info ""
  log_info "Requeue Action:"
  log_success "  ✓ New job ID: $NEW_JOB_ID"
  log_success "  ✓ Messages queued to SQS: $QUEUED_COUNT"
fi

log_info ""
log_info "📋 Next Steps:"
if [ "$MARKER_HEALTHY" != true ]; then
  log_warn "  1. URGENT: Fix Marker 502 error"
  log_warn "     - Check EC2 instance state (should be: running + healthy)"
  log_warn "     - View CloudWatch logs: /aws/lambda/marker-extraction"
  log_warn "     - Try restarting EC2 instance"
  log_warn "     - Retries will auto-drain once Marker is healthy"
else
  log_success "  1. Marker is healthy - retries will process immediately"
fi
log_info "  2. Monitor extraction:"
log_info "     - Watch SQS queue depth: \`aws sqs get-queue-attributes --queue-url \$SQS_QUEUE_URL --attribute-names ApproximateNumberOfMessages --region $AWS_REGION\`"
log_info "  3. Verify success:"
log_info "     - Check chunks table: \`SELECT COUNT(*) FROM app.chunks;\`"
log_info "     - Check embeddings: \`SELECT COUNT(*) FROM app.embeddings;\`"

log_success "\n✓ Diagnostic and requeue complete!"
