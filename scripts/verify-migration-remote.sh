#!/bin/bash

# Remote migration verifier - check if migration succeeded
# Usage: ./verify-migration-remote.sh

set -e

echo "🔍 Verifying migration..."
echo ""

# Database credentials — source from environment or .env file
DB_HOST="${DB_HOST:?Set DB_HOST (e.g. your-rds-endpoint.region.rds.amazonaws.com)}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:?Set DB_USER}"
DB_PASSWORD="${DB_PASSWORD:?Set DB_PASSWORD}"
DB_NAME="${DB_NAME:-oghma}"

# Check if psql is installed
if ! command -v psql &> /dev/null; then
    echo "❌ psql not found"
    exit 1
fi

echo "📋 Checking tables..."
PGPASSWORD="$DB_PASSWORD" psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -c "SELECT tablename FROM pg_tables WHERE schemaname = 'app' ORDER BY tablename;"

echo ""
echo "📊 Checking app.notes columns..."
PGPASSWORD="$DB_PASSWORD" psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'notes' ORDER BY ordinal_position;"

echo ""
echo "📈 Checking row counts..."
PGPASSWORD="$DB_PASSWORD" psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -c "
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
echo "✅ Verification complete!"
