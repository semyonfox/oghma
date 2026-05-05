#!/usr/bin/env bash
# one-time migration: dump RDS → restore to homelab postgres
# run from the oghma repo root, with the homelab stack already running
#
# usage:
#   bash scripts/migrate-rds-to-homelab.sh
#   bash scripts/migrate-rds-to-homelab.sh --no-data    (schema only, for a clean dev DB)
#
# requires:  pg_dump / psql on PATH, or install: sudo pacman -S postgresql-libs
set -euo pipefail

RDS_HOST="oghma.c9sac6iec8m8.eu-west-1.rds.amazonaws.com"
RDS_PORT="5432"
RDS_USER="oghma_admin"
RDS_DB="oghma"

HOMELAB_CONTAINER="oghma-postgres"
HOMELAB_DB="oghma"
HOMELAB_USER="oghma_admin"

DUMP_FILE="/tmp/oghma-rds-$(date +%Y%m%d-%H%M%S).dump"
NO_DATA="${1:-}"

echo "=== oghma RDS → homelab migration ==="
echo "source:  ${RDS_HOST}:${RDS_PORT}/${RDS_DB}"
echo "target:  docker:${HOMELAB_CONTAINER}/${HOMELAB_DB}"
echo "dump to: ${DUMP_FILE}"
[ "$NO_DATA" = "--no-data" ] && echo "mode:    schema only (--no-data)" || echo "mode:    full (schema + data)"
echo ""

read -rp "continue? [y/N] " CONFIRM
[ "${CONFIRM,,}" != "y" ] && exit 0

# 1. dump from RDS
echo "[1/4] dumping from RDS (enter RDS oghma_admin password when prompted)..."
DUMP_OPTS="--no-owner --no-acl --format=custom --compress=6"
[ "$NO_DATA" = "--no-data" ] && DUMP_OPTS="$DUMP_OPTS --schema-only"

pg_dump $DUMP_OPTS \
    -h "$RDS_HOST" -p "$RDS_PORT" -U "$RDS_USER" "$RDS_DB" \
    -f "$DUMP_FILE"

DUMP_SIZE=$(du -sh "$DUMP_FILE" | cut -f1)
echo "    dump complete: ${DUMP_FILE} (${DUMP_SIZE})"

# 2. ensure homelab postgres has pgvector + dev db if needed
echo "[2/4] ensuring extensions and database exist..."
docker exec "$HOMELAB_CONTAINER" psql -U "$HOMELAB_USER" -c "CREATE EXTENSION IF NOT EXISTS vector;" "$HOMELAB_DB" 2>/dev/null || true
docker exec "$HOMELAB_CONTAINER" psql -U "$HOMELAB_USER" -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;" "$HOMELAB_DB" 2>/dev/null || true

# 3. restore — copy dump into container and restore
echo "[3/4] restoring to homelab..."
docker cp "$DUMP_FILE" "${HOMELAB_CONTAINER}:/tmp/oghma.dump"
docker exec "$HOMELAB_CONTAINER" pg_restore \
    --no-owner --no-acl \
    -U "$HOMELAB_USER" -d "$HOMELAB_DB" \
    --clean --if-exists \
    /tmp/oghma.dump
docker exec "$HOMELAB_CONTAINER" rm /tmp/oghma.dump

# 4. re-grant app user access (owner was stripped by --no-owner)
echo "[4/4] re-granting oghma_app permissions..."
docker exec "$HOMELAB_CONTAINER" psql -U "$HOMELAB_USER" -d "$HOMELAB_DB" << 'SQL'
DO $$
DECLARE r record;
BEGIN
  -- grant connect
  GRANT CONNECT ON DATABASE oghma TO oghma_app;
  -- grant usage on app schema
  GRANT USAGE ON SCHEMA app TO oghma_app;
  -- grant on all existing tables/sequences/functions
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO oghma_app;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO oghma_app;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO oghma_app;
  -- default privileges for future objects
  ALTER DEFAULT PRIVILEGES IN SCHEMA app
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO oghma_app;
  ALTER DEFAULT PRIVILEGES IN SCHEMA app
    GRANT USAGE, SELECT ON SEQUENCES TO oghma_app;
END $$;
SQL

echo ""
echo "=== migration complete ==="
echo "dump file kept at: ${DUMP_FILE}"
echo ""
echo "verify with:"
echo "  docker exec -it oghma-postgres psql -U oghma_admin oghma -c '\\dt app.*'"
echo "  docker exec -it oghma-postgres psql -U oghma_admin oghma -c 'SELECT COUNT(*) FROM app.users;'"
