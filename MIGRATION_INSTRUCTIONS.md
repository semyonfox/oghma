# Database Migration Instructions

## Quick Start

Run the migration on your server with Tailscale active:

```bash
cd /path/to/oghmanotes
./scripts/run-migration-remote.sh
```

Then verify it worked:

```bash
./scripts/verify-migration-remote.sh
```

---

## Files Included

| File | Purpose |
|------|---------|
| `database/migrations/006_consolidated_safe_migration.sql` | Complete UUID v7 migration SQL |
| `scripts/run-migration-remote.sh` | Run the migration via psql |
| `scripts/verify-migration-remote.sh` | Verify migration succeeded |

---

## Requirements

- **psql** installed (PostgreSQL client)
  ```bash
  # Ubuntu/Debian
  sudo apt-get install postgresql-client
  
  # macOS
  brew install postgresql
  ```

- **Tailscale** active (to access AWS RDS database)
  ```bash
  sudo tailscale up
  ```

---

## Step-by-Step

### 1. Clone/Pull the latest code
```bash
cd /path/to/oghmanotes
git pull origin dev
```

### 2. Start Tailscale (if not already running)
```bash
sudo tailscale up
```

### 3. Run the migration
```bash
./scripts/run-migration-remote.sh
```

You should see:
```
════════════════════════════════════════════════════
  OghmaNotes Database Migration
════════════════════════════════════════════════════

📍 Connecting to: oghma.c5uicousc1yo.eu-north-1.rds.amazonaws.com:5432/oghma
🔐 User: oghma_app

⏳ Running migration (this may take a minute)...

... SQL output ...

════════════════════════════════════════════════════
  ✅ Migration completed successfully!
════════════════════════════════════════════════════
```

### 4. Verify the migration
```bash
./scripts/verify-migration-remote.sh
```

Should show:
```
🔍 Verifying migration...

📋 Checking tables...
 tablename
-----------
 attachments
 login
 notes
 pdf_annotations
 tree_items
(5 rows)

📊 Checking app.notes columns...
 column_name | data_type
-------------+------------------
 note_id     | uuid
 user_id     | uuid
 title       | text
 content     | text
 ...
 is_folder   | boolean
 deleted_at  | timestamp with time zone
 ...

📈 Checking row counts...
 table_name | count
------------+-------
 app.login  |     0
 app.notes  |     0
 app.tree_items |     0
 ...
```

---

## What the Migration Does

✅ Creates new UUID v7 schema  
✅ Drops old integer-based schema  
✅ Creates all tables with proper indexes  
✅ Sets up triggers for auto-updated timestamps  
✅ Backs up old data (if any) to `backup.*` tables  

---

## If Something Goes Wrong

### Connection refused?
- Check Tailscale is running: `tailscale status`
- Check database credentials in the script
- Verify network access

### psql command not found?
- Install PostgreSQL client (see Requirements above)

### Migration failed partway through?
- Check the error message
- All data backed up in `backup.login_backup`, `backup.notes_backup`, etc.
- Can restore from backup if needed

### Want to rollback?
```sql
-- Restore from backup
TRUNCATE app.login CASCADE;
INSERT INTO app.login SELECT * FROM backup.login_backup;

-- Repeat for other tables as needed
```

---

## Next Steps

After migration succeeds:

1. Run the Next.js app: `npm run dev`
2. Test the tree loads without errors
3. Expand/collapse folders
4. Try drag-drop operations
5. Check browser console for any errors

---

## Questions?

- **Migration SQL:** `database/migrations/006_consolidated_safe_migration.sql`
- **Commit:** `96f6482` - All migration changes
- **Documentation:** `MIGRATION_SUMMARY.md`
