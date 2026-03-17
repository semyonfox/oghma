#!/bin/bash

# Remote migration runner - execute on server with Tailscale access
# Usage: ./run-migration-remote.sh

set -e

echo "════════════════════════════════════════════════════"
echo "  OghmaNotes Database Migration"
echo "════════════════════════════════════════════════════"
echo ""

# Database credentials
DB_HOST="<old-rds-endpoint>"
DB_PORT="5432"
DB_USER="oghma_app"
DB_PASSWORD="REDACTED_DB_PASSWORD"
DB_NAME="oghma"

echo "📍 Connecting to: $DB_HOST:$DB_PORT/$DB_NAME"
echo "🔐 User: $DB_USER"
echo ""

# Check if psql is installed
if ! command -v psql &> /dev/null; then
    echo "❌ psql not found. Install PostgreSQL client:"
    echo "   sudo apt-get install postgresql-client"
    exit 1
fi

echo "⏳ Running migration (this may take a minute)..."
echo ""

# Run the migration SQL file
PGPASSWORD="$DB_PASSWORD" psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -f "database/migrations/006_consolidated_safe_migration.sql"

MIGRATION_EXIT=$?

if [ $MIGRATION_EXIT -eq 0 ]; then
    echo ""
    echo "════════════════════════════════════════════════════"
    echo "  ✅ Migration completed successfully!"
    echo "════════════════════════════════════════════════════"
    echo ""
    echo "📋 Tables created:"
    echo "   ✓ app.login"
    echo "   ✓ app.notes"
    echo "   ✓ app.tree_items"
    echo "   ✓ app.attachments"
    echo "   ✓ app.pdf_annotations"
    echo ""
    echo "🔐 All primary keys are now UUID v7"
    echo "📁 Folder support enabled (is_folder column)"
    echo "🗑️  Soft delete enabled (deleted_at column)"
    echo ""
    exit 0
else
    echo ""
    echo "❌ Migration failed!"
    exit 1
fi
