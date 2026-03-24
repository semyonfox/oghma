#!/bin/bash

# Remote migration verifier - check if migration succeeded
# Usage: ./verify-migration-remote.sh
# Credentials: reads DATABASE_URL from env, or fetches from AWS Secrets Manager

set -e

echo "Verifying migration..."
echo ""

# build connection string from Secrets Manager if DATABASE_URL not set
if [ -z "$DATABASE_URL" ] && command -v aws &> /dev/null; then
    echo "Fetching credentials from Secrets Manager..."
    DATABASE_URL=$(aws secretsmanager get-secret-value --region eu-north-1 \
        --secret-id oghmanotes/database --query SecretString --output text 2>/dev/null \
        | python3 -c "import sys,json; print(json.load(sys.stdin)['database_url'])" 2>/dev/null || true)
fi

DATABASE_URL="${DATABASE_URL:?Set DATABASE_URL or configure oghmanotes/database in Secrets Manager}"

if ! command -v psql &> /dev/null; then
    echo "psql not found"
    exit 1
fi

echo "Checking tables..."
psql "$DATABASE_URL" -c "SELECT tablename FROM pg_tables WHERE schemaname = 'app' ORDER BY tablename;"

echo ""
echo "Checking app.notes columns..."
psql "$DATABASE_URL" -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'notes' ORDER BY ordinal_position;"

echo ""
echo "Checking row counts..."
psql "$DATABASE_URL" -c "
    SELECT 'app.login' AS table_name, COUNT(*) FROM app.login
    UNION ALL
    SELECT 'app.notes', COUNT(*) FROM app.notes
    UNION ALL
    SELECT 'app.tree_items', COUNT(*) FROM app.tree_items
    UNION ALL
    SELECT 'app.attachments', COUNT(*) FROM app.attachments
    UNION ALL
    SELECT 'app.pdf_annotations', COUNT(*) FROM app.pdf_annotations;
"

echo ""
echo "Verification complete!"
