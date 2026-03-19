import { useState, useEffect, useCallback } from 'react'

/**
 * Hook to track Canvas import status and show notifications
 * 
 * Usage:
 * const { isImporting, progress, showToast, onToastClose, checkStatus } = useCanvasImportStatus()
 * 
 * - showToast: boolean, whether to display the toast
 * - progress: object with { total, completed, percent, forbidden, error }
 * - isImporting: boolean, whether an import is currently in progress
 * - checkStatus: function to manually fetch status
 * - onToastClose: function to hide the toast
 */
export function useCanvasImportStatus(options = {}) {
  const { checkInterval = 6 * 60 * 60 * 1000, autoCheckOnMount = true } = options // 6 hours default

  const [progress, setProgress] = useState(null)
  const [showToast, setShowToast] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  // Fetch current import status
  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/canvas/status')
      const data = await res.json()
      
      if (data.success && data.progress.total > 0) {
        setProgress(data.progress)
        setIsImporting(data.activeJob?.status === 'processing' || data.activeJob?.status === 'queued')
        setShowToast(true)
      }
    } catch (err) {
      console.error('Failed to check Canvas import status:', err)
    }
  }, [])

  // Check on mount (like when user logs in)
  useEffect(() => {
    if (autoCheckOnMount) {
      checkStatus()
    }
  }, [autoCheckOnMount, checkStatus])

  // Polling interval while importing
  useEffect(() => {
    if (!isImporting) return

    const interval = setInterval(checkStatus, 3000) // Poll every 3 seconds while processing
    return () => clearInterval(interval)
  }, [isImporting, checkStatus])

  // Check periodically (e.g., every 6 hours for background imports)
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
