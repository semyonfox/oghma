# Canvas Import UI - DEPLOYMENT READY

## ✅ What's Been Implemented

### Backend
- ✅ Worker now tracks individual file progress in `app.canvas_imports` table
  - Status: `downloading` → `processing` → `complete` (or `forbidden`/`error`)
  - Error messages recorded for failed files
  
- ✅ Enhanced `/api/canvas/status` endpoint
  - Returns job progress, file counts, percent complete
  - Estimated time remaining
  - Recent errors summary

- ✅ New `/api/canvas/logs` endpoint
  - Detailed logs for all imports (up to 1000 entries)
  - Useful for debugging import failures

### Frontend Components
- ✅ **CanvasImportToast** (`src/components/CanvasImportToast.jsx`)
  - Toast notification with real-time progress bar
  - Shows "Importing X/Y files"
  - Auto-closes after 5 sec if successful with no errors
  - Shows error summary + "View logs" button if failures occur

- ✅ **CanvasImportStatus** (`src/components/CanvasImportStatus.jsx`)
  - Full status panel for settings page
  - Active job summary with progress breakdown
  - Estimated time remaining
  - Recent errors list
  - Detailed logs modal

- ✅ **useCanvasImportStatus** (`src/hooks/useCanvasImportStatus.js`)
  - Custom React hook for import polling
  - Checks status on app load (login)
  - Polls every 3 seconds during active import
  - Periodic check every 6 hours (background)
  - Manages toast visibility state

- ✅ **CanvasIntegration** (`src/components/CanvasIntegration.jsx`)
  - Global wrapper for root layout
  - Automatically shows/hides toast based on status
  - Includes navigation to settings panel on error

### Integration Points
- ✅ Root layout (`src/app/layout.js`)
  - Added `<CanvasIntegration />` for global toast notifications

- ✅ Settings page (`src/app/settings/page.jsx`)
  - Added import status section with `<CanvasImportStatus />`
  - Positioned below Canvas account connection UI

## 🚀 Deployment Steps

### Step 1: Deploy Worker Process

On your instance, run the background worker:

```bash
# Option A: Direct execution (development)
node src/lib/canvas/import-worker.js &

# Option B: Using PM2 (recommended for production)
pm2 start src/lib/canvas/import-worker.js --name canvas-worker --exec "node -r ./instrumentation.ts"
pm2 save
pm2 startup
systemctl enable pm2-root  # If running as root

# Option C: Using systemd service (advanced)
# Create /etc/systemd/system/canvas-worker.service
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

# Then:
sudo systemctl enable canvas-worker
sudo systemctl start canvas-worker
```

### Step 2: Deploy Amplify (API)

Your Amplify API is already updated. On next deploy:
1. New endpoints auto-deploy: `/api/canvas/status`, `/api/canvas/logs`
2. Updated `/api/canvas/import` endpoint (already queuing jobs)
3. Frontend components automatically available

### Step 3: Test the Integration

1. **Start worker** (from Step 1)
2. **Open app** in browser (should trigger useCanvasImportStatus on mount)
3. **Trigger import** via Canvas settings:
   - Go to `/settings?tab=canvas-imports` or click "Canvas Integration"
   - Connect Canvas account (if not already)
   - Select courses to import
4. **Watch toast appear** with progress bar
5. **Check detailed status** in settings under "Import Status" section

## 📊 Behavior Overview

### User Experience Flow

```
User clicks "Import Courses"
    ↓
POST /api/canvas/import queues job
    ↓
API returns jobId, endpoint returns immediately
    ↓
Toast appears with spinner: "Importing Canvas files..."
    ↓
Hook polls /api/canvas/status every 3 seconds
    ↓
Progress bar updates: 0% → 100%
    ↓
File counter updates: "0/170 imported" → "170/170 imported"
    ↓
Status shows downloading/processing/completed breakdown
    ↓
After all files: toast shows result:
  - Success: "✓ Canvas import complete! 170 files imported" (auto-closes)
  - With errors: "⚠ 2 forbidden, 1 failed. Click for logs" (stays visible)
    ↓
User can click "View detailed logs" to see which files failed and why
    ↓
Settings panel shows persistent status (visible until next refresh)
```

### Auto-Checks

- **On app load** - Checks if there's an active import (via `useCanvasImportStatus` hook)
- **Every 3 seconds** - While import is processing (aggressive polling)
- **Every 6 hours** - Background check for completed imports (low frequency)
- **Manual** - User can refresh settings page to fetch latest status

## 🔧 Configuration

### Check Interval (6 hours default)
Edit `src/components/CanvasIntegration.jsx`:

```jsx
const { progress, showToast } = useCanvasImportStatus({
  checkInterval: 2 * 60 * 60 * 1000, // Change to 2 hours
  autoCheckOnMount: true,
})
```

### Toast Auto-Close Delay (5 seconds)
Edit `src/components/CanvasImportToast.jsx` line 23:

```jsx
const timer = setTimeout(onClose, 10000) // 10 seconds instead
```

### Poll Frequency During Import (3 seconds)
Edit `src/hooks/useCanvasImportStatus.js` line 37:

```jsx
const interval = setInterval(checkStatus, 5000) // 5 seconds instead
```

## 📡 API Endpoints

### GET /api/canvas/status
Returns current import progress.

**Response:**
```json
{
  "success": true,
  "activeJob": {
    "jobId": "uuid",
    "status": "processing",
    "createdAt": "2025-03-19T...",
    "startedAt": "2025-03-19T..."
  },
  "progress": {
    "total": 170,
    "completed": 67,
    "downloading": 5,
    "processing": 3,
    "percent": 39
  },
  "issues": {
    "forbidden": 2,
    "error": 1
  },
  "estimatedSecsRemaining": 540,
  "recentErrors": [...]
}
```

### GET /api/canvas/logs
Returns detailed import logs (all files processed).

**Response:**
```json
{
  "success": true,
  "jobId": null,
  "count": 170,
  "logs": [
    {
      "filename": "lecture-1.pdf",
      "status": "complete",
      "errorMessage": null,
      "mimeType": "application/pdf",
      "createdAt": "2025-03-19T...",
      "updatedAt": "2025-03-19T..."
    },
    {
      "filename": "restricted-lecture.pdf",
      "status": "forbidden",
      "errorMessage": "File access denied by lecturer",
      "mimeType": "application/pdf",
      "createdAt": "2025-03-19T...",
      "updatedAt": "2025-03-19T..."
    }
  ]
}
```

## ✅ Verification Checklist

Before going live:

- [ ] Worker process running: `ps aux | grep canvas-worker` shows process
- [ ] Database queries work: Run `SELECT * FROM app.canvas_imports LIMIT 1`
- [ ] API endpoints respond:
  - [ ] `curl http://localhost:3000/api/canvas/status` (after auth)
  - [ ] `curl http://localhost:3000/api/canvas/logs` (after auth)
- [ ] Frontend builds: `npm run build` completes without errors
- [ ] Toast shows on app load if there are active imports
- [ ] Settings panel displays current progress
- [ ] Clicking "View logs" opens detailed log modal

## 🐛 Troubleshooting

### Toast never shows
1. Check browser console for fetch errors
2. Verify authenticated (check localStorage for auth token)
3. Check if there are actual active imports in DB:
   ```sql
   SELECT id, status, created_at FROM app.canvas_import_jobs 
   WHERE status IN ('queued', 'processing') LIMIT 5;
   ```

### Progress bar stuck at same %
1. Check worker logs: `pm2 logs canvas-worker`
2. Look for errors in worker process
3. Check database for stalled jobs: `SELECT * FROM app.canvas_imports WHERE status = 'downloading' AND updated_at < NOW() - INTERVAL '5 minutes'`

### Settings panel shows "Loading import status..."
1. Verify `/api/canvas/status` endpoint is responding
2. Check browser network tab for fetch errors
3. Ensure database connection is active

### Files not being imported
1. Check worker logs for specific file errors
2. Verify MIME type resolution in worker
3. Check S3 connectivity and bucket permissions

## 📝 Multi-User Safety

✅ All components are multi-user safe:
- API endpoints scoped by authenticated user (via `validateSession()`)
- Progress data filtered by `user_id` in all queries
- S3 file storage uses `canvas/{userId}/...` prefix
- Each user's imports tracked separately
- No cross-user data leakage

## 🎯 Next Steps

1. **Deploy worker** to your instance
2. **Push to Amplify** (API auto-updates)
3. **Test with real import** - Select Canvas courses and watch progress
4. **Monitor logs** - First few imports to ensure stability
5. **Share with users** - They can now see import progress in real-time

## 📚 Documentation

For integration details, see `CANVAS_UI_INTEGRATION.md`

For architecture overview, see `CANVAS_FIXES_SUMMARY.md`
