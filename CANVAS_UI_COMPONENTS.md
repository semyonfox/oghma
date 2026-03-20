# Canvas UI Components - Technical Reference

## Components

### `CanvasImportToast` (`src/components/CanvasImportToast.jsx`)
Toast notification showing real-time import progress.
- Real-time progress bar (0-100%)
- File count display (X/Y completed)
- Auto-closes after 5 seconds if successful with no errors
- Shows error summary + "View logs" button on failures

**Customization:**
- Line 23: Change auto-close delay: `setTimeout(onClose, 5000)`
- Lines 25-70: Edit colors/styling with Tailwind classes

### `CanvasImportStatus` (`src/components/CanvasImportStatus.jsx`)
Settings page panel for detailed import status.
- Active job summary with progress breakdown
- Download/processing/error counts
- Estimated time remaining
- Recent errors list
- Detailed logs modal (up to 1000 entries)

### `useCanvasImportStatus` Hook (`src/hooks/useCanvasImportStatus.js`)
Custom React hook for import polling and state management.

**Usage:**
```jsx
const { progress, showToast, isImporting, checkStatus, onToastClose } = useCanvasImportStatus({
  checkInterval: 6 * 60 * 60 * 1000, // Default: 6 hours
  autoCheckOnMount: true,              // Default: true
})
```

**Polling behavior:**
- On app load: Check if import is active
- Every 3 seconds: While import is processing
- Every N hours: Background check (configurable)
- Manual: Call `checkStatus()` anytime

**Customization:**
- Line 37: Change active polling interval: `setInterval(checkStatus, 3000)`
- Pass `checkInterval` to change background check frequency

### `CanvasIntegration` (`src/components/CanvasIntegration.jsx`)
Global wrapper component for root layout. Automatically shows/hides toast and handles navigation to settings.

## API Endpoints

### `GET /api/canvas/status`
Returns current import progress. Scoped to authenticated user.

**Response:**
```json
{
  "success": true,
  "activeJob": { "jobId": "uuid", "status": "processing|queued" },
  "progress": { "total": 170, "completed": 67, "percent": 39 },
  "issues": { "forbidden": 2, "error": 1 },
  "estimatedSecsRemaining": 540,
  "recentErrors": [{ "filename": "...", "status": "forbidden" }]
}
```

### `GET /api/canvas/logs`
Returns detailed logs for all imports (up to 1000).

**Response:**
```json
{
  "success": true,
  "count": 170,
  "logs": [{ "filename": "...", "status": "complete|error|forbidden", "errorMessage": null }]
}
```

## Database Tables

### `app.canvas_imports` (file-level tracking)
Tracks individual file imports. Columns:
- `status`: downloading → processing → complete (or forbidden/error)
- `error_message`: Error details if status is error/forbidden
- `note_id`: References created note (NULL if failed)

### `app.canvas_import_jobs` (job-level tracking)
Tracks overall import jobs. Columns:
- `status`: queued → processing → complete
- `user_id`: Owner of import
- `course_ids`: JSON array of courses being imported

## Integration (Already Complete)

✅ `src/app/layout.js` - Added `<CanvasIntegration />` in root  
✅ `src/app/settings/page.jsx` - Added `<CanvasImportStatus />` in Canvas section  

No additional integration needed unless customizing behavior.

## Multi-User Safety

✅ All components are scoped by authenticated user:
- API endpoints check `validateSession()`
- Database queries filtered by `user_id`
- S3 file paths include `userId` prefix

## Troubleshooting

**Toast never appears:** Check browser console, verify authenticated, check if DB has active imports  
**Progress bar stuck:** Check worker logs (`pm2 logs canvas-worker`)  
**Settings panel slow:** Verify database connectivity  

See `PRODUCTION_SETUP_CHECKLIST.md` for deployment and Canvas worker setup.
