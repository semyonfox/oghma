# Canvas Import Worker - Deployment & Testing

## Architecture

```
Amplify (Serverless)           Your Instance (Worker)
├─ API endpoints               ├─ canvas-worker process
├─ React components            │  (polls DB every 5 sec)
└─ Frontend bundle             └─ Imports files in background
        ↓ (queries)                    ↓ (updates)
        └──────────── PostgreSQL ──────┘
                    (eu-north-1)
```

## Deploy Worker to Instance

Pick one approach:

### Option A: PM2 (Recommended)
```bash
cd ~/code/university/ct216-software-eng/oghmanotes
pm2 start src/lib/canvas/import-worker.js --name canvas-worker
pm2 save
pm2 startup  # Makes PM2 restart on system reboot
```

Check status:
```bash
pm2 list              # Shows all processes
pm2 logs canvas-worker  # Shows worker logs
pm2 monit             # Real-time monitoring
```

### Option B: Direct (Development)
```bash
node src/lib/canvas/import-worker.js &
```

### Option C: Systemd Service (Production)
Create `/etc/systemd/system/canvas-worker.service`:
```ini
[Unit]
Description=Canvas Import Worker
After=network.target

[Service]
Type=simple
User=semyon
WorkingDirectory=/home/semyon/code/university/ct216-software-eng/oghmanotes
ExecStart=/usr/bin/node src/lib/canvas/import-worker.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl enable canvas-worker
sudo systemctl start canvas-worker
sudo systemctl status canvas-worker
```

## Test the Integration

### 1. Verify Worker is Running
```bash
# PM2
pm2 list

# Systemd
sudo systemctl status canvas-worker

# Process check
ps aux | grep canvas-worker
```

Should show one process running.

### 2. Trigger an Import
1. Open app → Settings → Canvas Integration
2. Connect Canvas account (if needed)
3. Select courses and click "Import"
4. Should see toast with progress bar

### 3. Watch Worker Process
```bash
pm2 logs canvas-worker --lines 50
# or
tail -f ~/.pm2/logs/canvas-worker-out.log
```

Should see:
```
[timestamp] Processing course: CT216 — Software Engineering
[timestamp] Processing module: Lecture 1
[timestamp] Processed: lecture-1.pdf
```

### 4. Check Database
```bash
psql $DATABASE_URL -c "SELECT COUNT(*) FROM app.canvas_imports WHERE status = 'complete';"
```

Should increment as files are imported.

## User Experience

1. **User clicks "Import Courses"**
2. **Toast appears** with spinner: "Importing Canvas files..."
3. **Progress bar updates** every 3 seconds
4. **Success**: Toast auto-closes after 5 sec (no errors) or shows error summary (with errors)
5. **Settings panel**: Shows detailed breakdown and logs

## Polling Behavior

- **On app load**: Check if there's an active import
- **Every 3 seconds**: While import is processing
- **Every 6 hours**: Background check for completed imports
- **Manual**: User can refresh page to fetch latest status

## Troubleshooting

### Worker not running
```bash
# Check if process exists
ps aux | grep canvas-worker

# Start it
pm2 start src/lib/canvas/import-worker.js --name canvas-worker

# Check logs
pm2 logs canvas-worker
```

### Progress bar stuck
1. Check worker logs: `pm2 logs canvas-worker`
2. Look for database errors
3. Verify database connection: `psql $DATABASE_URL -c "SELECT NOW();"`

### Email integration issues
- See `PRODUCTION_SETUP_CHECKLIST.md` PART 3 (Email/AWS SES)

### OAuth issues
- See `PRODUCTION_SETUP_CHECKLIST.md` PART 2 (OAuth Providers)

## Monitoring

### Check Worker Health
```bash
# Running processes
pm2 list

# Worker logs (last 50 lines)
pm2 logs canvas-worker --lines 50

# Real-time monitoring
pm2 monit

# Restart if needed
pm2 restart canvas-worker

# Stop worker
pm2 stop canvas-worker

# Remove from PM2
pm2 delete canvas-worker
```

### Database Activity
```bash
# Active imports
psql $DATABASE_URL -c "SELECT COUNT(*) FROM app.canvas_imports WHERE status IN ('downloading', 'processing');"

# Recent errors
psql $DATABASE_URL -c "SELECT filename, status, error_message FROM app.canvas_imports WHERE status = 'error' ORDER BY updated_at DESC LIMIT 5;"

# Job queue
psql $DATABASE_URL -c "SELECT id, status, created_at FROM app.canvas_import_jobs ORDER BY created_at DESC LIMIT 5;"
```

## Configuration

Worker is already configured correctly. To modify:

**File**: `src/lib/canvas/import-worker.js`

- Line 293-308: Polling loop (changes poll interval here)
- Line 24: Supported file types (add more types here)
- Line 28-32: MIME type resolution (modify file type detection)

Environment variables read from:
- Instance `.env`: `DATABASE_URL`, `STORAGE_*`
- Database: Canvas token from `app.login` table

## Next Steps

1. Deploy worker (one of the 3 options above)
2. Set all OAuth + email env vars (see `PRODUCTION_SETUP_CHECKLIST.md`)
3. Push to Amplify: `git push`
4. Test import flow end-to-end
5. Monitor worker logs for 1-2 days

See `PRODUCTION_SETUP_CHECKLIST.md` for complete setup including OAuth, email, and Amplify deployment.
