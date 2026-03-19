# Canvas Import UI Integration Guide

This guide explains how to integrate the Canvas import progress UI components into your application.

## Components Overview

### 1. `CanvasImportToast` 
Toast notification showing real-time import progress.

**Props:**
- `show` (boolean) - Whether to display the toast
- `progress` (object) - Progress data with `{ total, completed, percent, forbidden, error }`
- `onClose` (function) - Callback when user closes the toast
- `onViewLogs` (function) - Callback when user clicks "View detailed logs"

**Features:**
- Real-time progress bar (0-100%)
- File count display (X/Y completed)
- Auto-closes after 5 seconds if successful with no errors
- Shows error summary if there are failures
- "View logs" button for detailed error information

### 2. `CanvasImportStatus`
Full import status panel for settings page.

**Features:**
- Active job summary with progress bar
- Download/processing/error status breakdown
- Estimated time remaining
- Recent errors with file names
- Detailed logs modal showing all file statuses
- Auto-refreshes every 3 seconds during active import

### 3. `useCanvasImportStatus` Hook
Custom React hook for managing import status state and polling.

**Usage:**
```javascript
const { progress, showToast, isImporting, checkStatus, onToastClose } = useCanvasImportStatus({
  checkInterval: 6 * 60 * 60 * 1000, // Check every 6 hours (default)
  autoCheckOnMount: true, // Check on component mount (default: true)
})
```

**Returns:**
- `progress` - Current progress object
- `showToast` - Boolean for whether to show toast
- `isImporting` - Boolean for active import
- `checkStatus` - Function to manually trigger status check
- `onToastClose` - Function to hide toast

## Integration Steps

### Step 1: Add Toast to Root Layout

In your main layout file (e.g., `src/app/layout.jsx`):

```jsx
import CanvasIntegration from '@/components/CanvasIntegration'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <CanvasIntegration /> {/* Global toast + polling */}
        {children}
      </body>
    </html>
  )
}
```

### Step 2: Add Status Panel to Settings

In your settings page (e.g., `src/app/settings/page.jsx`):

```jsx
import CanvasImportStatus from '@/components/CanvasImportStatus'

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      {/* ... other settings sections ... */}
      
      <section className="border-t border-gray-700 pt-6">
        <h2 className="text-lg font-semibold text-white mb-4">Canvas Import Status</h2>
        <CanvasImportStatus />
      </section>
    </div>
  )
}
```

Or if you use tabs:

```jsx
<Tabs defaultValue="general">
  <TabsList>
    <TabsTrigger value="general">General</TabsTrigger>
    <TabsTrigger value="canvas-imports">Canvas Imports</TabsTrigger>
  </TabsList>
  <TabsContent value="canvas-imports">
    <CanvasImportStatus />
  </TabsContent>
</Tabs>
```

## Behavior Overview

### Toast Lifecycle

1. **Queued** - Toast doesn't show (no files being processed yet)
2. **Processing** - Toast appears with spinner, shows X/Y files imported, progress bar
3. **Complete (No Errors)** - Shows success message, auto-closes after 5 seconds
4. **Complete (With Errors)** - Shows summary of errors, stays visible, user can click "View logs"
5. **Failed** - Shows warning icon, user can click "View logs"

### Status Checks

- **On app load** - Hook checks if there's an active import
- **Every 3 seconds** - While import is processing (from hook's polling)
- **Every 6 hours** - Background check for completed imports (from hook's interval)
- **Manual** - User can click "Refresh" or use `checkStatus()` function

## API Endpoints

The UI components depend on these endpoints (already implemented):

### `GET /api/canvas/status`
Returns current import progress.

**Response:**
```json
{
  "success": true,
  "activeJob": {
    "jobId": "uuid",
    "status": "processing|queued|complete",
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
  "recentErrors": [
    {
      "filename": "restricted-lecture.pdf",
      "errorMessage": "File access denied by lecturer",
      "status": "forbidden",
      "updatedAt": "2025-03-19T..."
    }
  ]
}
```

### `GET /api/canvas/logs?jobId=<uuid>`
Returns detailed import logs.

**Response:**
```json
{
  "success": true,
  "jobId": "uuid",
  "count": 170,
  "logs": [
    {
      "filename": "lecture-1.pdf",
      "status": "complete",
      "errorMessage": null,
      "mimeType": "application/pdf",
      "createdAt": "2025-03-19T...",
      "updatedAt": "2025-03-19T..."
    }
  ]
}
```

## Customization

### Change Poll Interval

```jsx
const { progress, showToast } = useCanvasImportStatus({
  checkInterval: 2 * 60 * 60 * 1000, // Check every 2 hours
  autoCheckOnMount: true,
})
```

### Disable Auto-Check on Mount

```jsx
const { progress, showToast, checkStatus } = useCanvasImportStatus({
  autoCheckOnMount: false, // Manual control only
})

// Then call checkStatus() when you want
```

### Custom Toast Styling

The toast uses Tailwind CSS classes. Edit `CanvasImportToast.jsx` to customize colors, sizing, positioning, etc.

## Multi-User Safety

✅ All components are multi-user safe:
- API endpoints scoped to authenticated user via `validateSession()`
- Progress data is per-user (database queries filtered by `user_id`)
- Each user's imports tracked separately
- File data isolated by S3 prefix (`canvas/{userId}/...`)

## Troubleshooting

### Toast never shows
- Check browser console for fetch errors
- Verify user has active Canvas imports (check DB: `SELECT * FROM app.canvas_import_jobs WHERE status IN ('queued', 'processing')`)
- Ensure `CanvasIntegration` is in root layout

### Progress bar stuck at certain %
- Check worker logs for errors: `docker logs oghmanotes-worker` or `pm2 logs canvas-worker`
- Look for specific file errors in `/api/canvas/logs`
- Verify database connection is active

### Settings panel shows "Loading import status..."
- Check `/api/canvas/status` endpoint is responding (curl it manually)
- Look for database errors in server logs

## Next Steps

1. Deploy worker to your instance: `node src/lib/canvas/import-worker.js &`
2. Add `<CanvasIntegration />` to root layout
3. Add `<CanvasImportStatus />` to settings page
4. Test by triggering an import via Canvas course selection
5. Monitor worker and API logs during import

See `QUICK_START_ASYNC_IMPORTS.md` for worker deployment details.
