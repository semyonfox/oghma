import { useState, useEffect, useCallback, useRef } from 'react'
import useSyncStatusStore from '@/lib/notes/state/sync-status'

const LS_ACTIVE_JOB = 'canvas_active_job'
const AUTO_SYNC_INTERVAL = 6 * 60 * 60 * 1000 // 6 hours

/**
 * Hook to track Canvas import status and show notifications.
 * Mounted globally in providers so the toast persists across page navigation.
 *
 * Polls /api/canvas/status every 3s while a job is active.
 * Triggers auto-sync when canvas_auto_sync is enabled and last sync > 6h ago.
 */
export function useCanvasImportStatus(options = {}) {
  const { autoCheckOnMount = true } = options

  const [progress, setProgress] = useState(null)
  const [showToast, setShowToast] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const autoSyncTriggered = useRef(false)

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/canvas/status')
      const data = await res.json()

      if (!data.success) return

      const active = data.activeJob?.status === 'processing' || data.activeJob?.status === 'queued'
      setIsImporting(active)

      if (active || data.progress?.total > 0) {
        setProgress({
          ...data.progress,
          jobType: data.activeJob?.jobType ?? 'import',
          forbidden: data.issues?.forbidden ?? 0,
          error: data.issues?.error ?? 0,
        })
        setShowToast(true)
      }

      if (!active) {
        localStorage.removeItem(LS_ACTIVE_JOB)

        // mark newly imported notes with blue dot in sidebar
        const newNoteIds = (data.recentLogs ?? [])
          .filter(l => l.status === 'complete' && l.noteId)
          .map(l => l.noteId)
        if (newNoteIds.length > 0) {
          useSyncStatusStore.getState().markCanvasNew(newNoteIds)
        }
      }
    } catch (err) {
      console.error('Failed to check Canvas import status:', err)
    }
  }, [])

  // auto-sync: check if eligible and trigger once per session
  const maybeAutoSync = useCallback(async () => {
    if (autoSyncTriggered.current) return
    try {
      const res = await fetch('/api/canvas/sync')
      const data = await res.json()
      if (!data.available) return

      // check if last sync is stale enough
      const lastSync = data.activeJob?.created_at
      if (lastSync && Date.now() - new Date(lastSync).getTime() < AUTO_SYNC_INTERVAL) return

      autoSyncTriggered.current = true
      const syncRes = await fetch('/api/canvas/sync', { method: 'POST' })
      const syncData = await syncRes.json()
      if (syncData.queued) {
        localStorage.setItem(LS_ACTIVE_JOB, JSON.stringify({ jobId: syncData.jobId }))
        setIsImporting(true)
        setShowToast(true)
      }
    } catch {
      // auto-sync is best-effort
    }
  }, [])

  // on mount: check active job and maybe trigger auto-sync
  useEffect(() => {
    if (!autoCheckOnMount) return

    const savedJob = JSON.parse(localStorage.getItem(LS_ACTIVE_JOB) ?? 'null')
    if (savedJob?.jobId) {
      setIsImporting(true)
      setShowToast(true)
    }
    checkStatus()
    maybeAutoSync()
  }, [autoCheckOnMount, checkStatus, maybeAutoSync])

  // poll every 3s while importing
  useEffect(() => {
    if (!isImporting) return
    const interval = setInterval(checkStatus, 3000)
    return () => clearInterval(interval)
  }, [isImporting, checkStatus])

  return {
    progress,
    showToast,
    isImporting,
    checkStatus,
    onToastClose: () => setShowToast(false),
  }
}
