#!/bin/bash
set -e

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

set -a
. ./.env
set +a

log_section "RAG PIPELINE DIAGNOSTIC & REQUEUE"

# ============================================================================
# 1. MARKER HEALTH
# ============================================================================

log_section "MARKER HEALTH"
log_info "Testing endpoint: $MARKER_API_URL"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 5 "$MARKER_API_URL/" 2>/dev/null || echo "0")
if [ "$HTTP_CODE" = "200" ]; then
  log_success "Marker HTTP $HTTP_CODE ✓ Healthy"
  MARKER_HEALTHY=true
else
  log_error "Marker HTTP $HTTP_CODE ✗ Unhealthy (502 = Bad Gateway)"
  MARKER_HEALTHY=false
fi

# ============================================================================
# 2. PENDING_RETRY ANALYSIS
# ============================================================================

log_section "PENDING_RETRY ITEMS"

# Extract DB credentials from DATABASE_URL
DB_HOST="oghma.czq402kw8cfz.eu-north-1.rds.amazonaws.com"
DB_PORT="5432"
DB_USER="oghma_app"
DB_PASS="YC-5pmNrAE6cGKywFEH38HGOKERmZGKOHGIv_-48RrE"
DB_NAME="oghma"

export PGPASSWORD="$DB_PASS"

# Query all pending_retry items
QUERY_RESULT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -A -F'|' -c "
SELECT 
  ci.id, 
  ci.note_id, 
  ci.filename, 
  ci.attempt_number,
  COALESCE(n.deleted, false)::int as deleted,
  (SELECT COUNT(*) FROM app.chunks WHERE document_id = ci.note_id) AS chunks_count,
  (SELECT COUNT(*) FROM app.embeddings e 
   JOIN app.chunks c ON c.id = e.chunk_id 
   WHERE c.document_id = ci.note_id) AS embeddings_count
FROM app.canvas_imports ci
LEFT JOIN app.notes n ON n.note_id = ci.note_id
WHERE ci.status = 'pending_retry'
ORDER BY ci.attempt_number DESC, ci.updated_at DESC;
" 2>&1)

TOTAL=$(echo "$QUERY_RESULT" | wc -l)
log_success "Loaded $TOTAL pending_retry items"

# Analyze
VALID_COUNT=0
DELETED_COUNT=0
COMPLETE_COUNT=0
VALID_IDS=""

while IFS='|' read -r id note_id filename attempt deleted chunks_count embeddings_count; do
  [ -z "$id" ] && continue
  
  if [ "$deleted" = "1" ]; then
    DELETED_COUNT=$((DELETED_COUNT + 1))
  elif [ "$embeddings_count" -ge "$chunks_count" ]; then
    COMPLETE_COUNT=$((COMPLETE_COUNT + 1))
  else
    VALID_COUNT=$((VALID_COUNT + 1))
    VALID_IDS="$VALID_IDS$id,"
    log_debug "  ✓ ID=$id (note=$note_id, attempt=$attempt)"
  fi
done <<< "$QUERY_RESULT"

# Clean up trailing comma
VALID_IDS="${VALID_IDS%,}"

log_success "Valid (incomplete): $VALID_COUNT"
log_warn "Invalid (deleted): $DELETED_COUNT"
log_warn "Invalid (complete): $COMPLETE_COUNT"

# ============================================================================
# 3. REQUEUE
# ============================================================================

if [ $VALID_COUNT -eq 0 ]; then
  log_warn "No items to requeue"
  exit 0
fi

log_section "CREATING JOB & REQUEUING"

# Create fresh job
NEW_JOB_ID=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -A -c "
INSERT INTO app.canvas_import_jobs (status, created_at, updated_at)
VALUES ('queued', NOW(), NOW())
RETURNING id;
" 2>&1)

log_success "Created job: $NEW_JOB_ID"

# Update canvas_imports
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
UPDATE app.canvas_imports 
SET job_id = $NEW_JOB_ID, status = 'queued', attempt_number = 1, updated_at = NOW()
WHERE id IN ($VALID_IDS);
" 2>&1

log_success "Updated $VALID_COUNT records to job $NEW_JOB_ID"

# Queue to SQS
QUEUED=0
while IFS='|' read -r id note_id filename attempt deleted chunks_count embeddings_count; do
  [ -z "$id" ] && continue
  
  if echo "$VALID_IDS" | grep -q "^$id,\|,$id,\|,$id$\|^$id$"; then
    ESCAPED=$(echo "$filename" | sed 's/"/\\"/g')
    
    aws sqs send-message \
      --queue-url "$SQS_QUEUE_URL" \
      --message-body "{\"job_id\":$NEW_JOB_ID,\"note_id\":\"$note_id\",\"filename\":\"$ESCAPED\",\"import_id\":$id,\"attempt_number\":1,\"retry\":true}" \
      --region eu-north-1 2>&1 > /dev/null && QUEUED=$((QUEUED + 1))
  fi
done <<< "$QUERY_RESULT"

log_success "Queued $QUEUED items to SQS"

# ============================================================================
# SUMMARY
# ============================================================================

log_section "SUMMARY"

log_info ""
log_info "Marker: $([ "$MARKER_HEALTHY" = true ] && echo "✓ Healthy" || echo "✗ HTTP 502 - Unhealthy")"
log_info "Pending Retry Backlog:"
log_info "  • Total: $TOTAL"
log_info "  • Valid: $VALID_COUNT (requeued to job $NEW_JOB_ID)"
log_info "  • Skipped: $((DELETED_COUNT + COMPLETE_COUNT))"
log_info ""
log_info "📋 Next:"
if [ "$MARKER_HEALTHY" = true ]; then
  log_success "✓ Marker healthy - retries processing now"
else
  log_warn "⚠ Fix Marker 502: Check EC2, restart if needed"
fi

log_success "✓ Done!"
