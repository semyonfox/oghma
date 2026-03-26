#!/bin/bash

# Remote migration runner
# Usage: ./run-migration-remote.sh [migration-file]
# Credentials: reads DATABASE_URL from env, or fetches from AWS Secrets Manager

set -e

echo "════════════════════════════════════════════════════"
echo "  OghmaNotes Database Migration"
echo "════════════════════════════════════════════════════"
echo ""

# build connection string from Secrets Manager if DATABASE_URL not set
if [ -z "$DATABASE_URL" ] && command -v aws &> /dev/null; then
    echo "Fetching credentials from Secrets Manager..."
    DATABASE_URL=$(aws secretsmanager get-secret-value --region eu-north-1 \
        --secret-id oghmanotes/database --query SecretString --output text 2>/dev/null \
        | python3 -c "import sys,json; print(json.load(sys.stdin)['database_url'])" 2>/dev/null || true)
fi

DATABASE_URL="${DATABASE_URL:?Set DATABASE_URL or configure oghmanotes/database in Secrets Manager}"

# mask credentials in output
MASKED=$(echo "$DATABASE_URL" | sed 's|://[^@]*@|://***@|')
echo "📍 Connecting to: $MASKED"
echo ""

if ! command -v psql &> /dev/null; then
    echo "psql not found. Install: sudo apt-get install postgresql-client"
    exit 1
fi

MIGRATION="${1:-database/migrations/006_consolidated_safe_migration.sql}"
echo "Running: $MIGRATION"
echo ""

psql "$DATABASE_URL" -f "$MIGRATION"

if [ $? -eq 0 ]; then
    echo ""
    echo "════════════════════════════════════════════════════"
    echo "  Migration completed successfully!"
    echo "════════════════════════════════════════════════════"
else
    echo ""
    echo "Migration failed!"
    exit 1
fi
