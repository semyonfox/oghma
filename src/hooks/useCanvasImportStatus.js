import { useState, useEffect, useCallback } from 'react'

const LS_ACTIVE_JOB = 'canvas_active_job'

/**
 * Hook to track Canvas import status and show notifications.
 * Mounted globally in providers so the toast persists across page navigation.
 *
 * Checks localStorage for an active job on mount, then polls /api/canvas/status
 * every 3s while importing. Shows a toast with progress and restricted course info.
 */
export function useCanvasImportStatus(options = {}) {
  const { checkInterval = 6 * 60 * 60 * 1000, autoCheckOnMount = true } = options

  const [progress, setProgress] = useState(null)
  const [showToast, setShowToast] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/canvas/status')
      const data = await res.json()

      if (!data.success) return

      const active = data.activeJob?.status === 'processing' || data.activeJob?.status === 'queued'
      setIsImporting(active)

      // show toast if there's an active job OR if we have recent progress to report
      if (active || data.progress?.total > 0) {
        setProgress({
          ...data.progress,
          forbidden: data.issues?.forbidden ?? 0,
          error: data.issues?.error ?? 0,
        })
        setShowToast(true)
      }

      // clean up localStorage when job finishes
      if (!active) {
        localStorage.removeItem(LS_ACTIVE_JOB)
      }
    } catch (err) {
      console.error('Failed to check Canvas import status:', err)
    }
  }, [])

  // on mount: check if there's a known active job, or do a general check
  useEffect(() => {
    if (!autoCheckOnMount) return

    const savedJob = JSON.parse(localStorage.getItem(LS_ACTIVE_JOB) ?? 'null')
    if (savedJob?.jobId) {
      setIsImporting(true)
      setShowToast(true)
    }
    checkStatus()
  }, [autoCheckOnMount, checkStatus])

  // poll every 3s while importing
  useEffect(() => {
    if (!isImporting) return
    const interval = setInterval(checkStatus, 3000)
    return () => clearInterval(interval)
  }, [isImporting, checkStatus])

  // background check every N hours
  useEffect(() => {
    const interval = setInterval(checkStatus, checkInterval)
    return () => clearInterval(interval)
  }, [checkInterval, checkStatus])

  return {
    progress,
    showToast,
    isImporting,
    checkStatus,
    onToastClose: () => setShowToast(false),
  }
}
