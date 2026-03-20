'use client'

import { useState, useEffect } from 'react'
import { CheckCircleIcon, ExclamationCircleIcon, ClockIcon } from '@heroicons/react/24/outline'

export default function CanvasImportStatus() {
  const [progress, setProgress] = useState(null)
  const [logs, setLogs] = useState([])
  const [showLogs, setShowLogs] = useState(false)
  const [loading, setLoading] = useState(true)

  // Fetch import status
  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/canvas/status')
      const data = await res.json()
      setProgress(data)
    } catch (err) {
      console.error('Failed to fetch canvas status:', err)
    }
  }

  // Fetch detailed logs
  const fetchLogs = async () => {
    try {
      setShowLogs(true)
      const res = await fetch('/api/canvas/logs')
      const data = await res.json()
      setLogs(data.logs || [])
    } catch (err) {
      console.error('Failed to fetch canvas logs:', err)
    }
  }

  useEffect(() => {
    fetchStatus()
    setLoading(false)

    // Poll for updates every 3 seconds if processing
    const interval = setInterval(fetchStatus, 3000)
    return () => clearInterval(interval)
  }, [])

  if (loading || !progress) {
    return <div className="text-gray-400 text-sm">Loading import status...</div>
  }

  const { activeJob, progress: fileProgress = {}, issues = {}, estimatedSecsRemaining } = progress
  const isProcessing = activeJob?.status === 'processing' || activeJob?.status === 'queued'

  return (
    <div className="space-y-4">
      {/* Active Job Summary */}
      {activeJob && (
        <div className="rounded-lg bg-gray-900 p-4 border border-gray-800">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">
              {isProcessing ? '📥 Canvas Import In Progress' : '✓ Last Import'}
            </h3>
            {isProcessing && <ClockIcon className="size-5 text-blue-400 animate-spin" />}
          </div>

          {/* Progress Bar */}
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">
                {fileProgress.completed}/{fileProgress.total} files imported
              </span>
              <span className="font-semibold text-white">{fileProgress.percent || 0}%</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-300"
                style={{ width: `${fileProgress.percent || 0}%` }}
              />
            </div>
          </div>

          {/* Status Details */}
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded bg-gray-800 p-2">
              <div className="text-gray-500 text-xs">Downloading</div>
              <div className="font-semibold text-blue-400">{fileProgress.downloading || 0}</div>
            </div>
            <div className="rounded bg-gray-800 p-2">
              <div className="text-gray-500 text-xs">Processing</div>
              <div className="font-semibold text-yellow-400">{fileProgress.processing || 0}</div>
            </div>
            {issues.forbidden > 0 && (
              <div className="rounded bg-gray-800 p-2">
                <div className="text-gray-500 text-xs">Forbidden</div>
                <div className="font-semibold text-orange-400">{issues.forbidden}</div>
              </div>
            )}
            {issues.error > 0 && (
              <div className="rounded bg-gray-800 p-2">
                <div className="text-gray-500 text-xs">Failed</div>
                <div className="font-semibold text-red-400">{issues.error}</div>
              </div>
            )}
          </div>

          {/* ETA */}
          {isProcessing && estimatedSecsRemaining && (
            <p className="mt-3 text-xs text-gray-500">
              Est. time remaining: {Math.ceil(estimatedSecsRemaining / 60)} minute{estimatedSecsRemaining > 60 ? 's' : ''}
            </p>
          )}
        </div>
      )}

      {/* Recent Errors */}
      {progress.recentErrors && progress.recentErrors.length > 0 && (
        <div className="rounded-lg bg-red-900/20 p-4 border border-red-900/50">
          <h3 className="font-semibold text-red-400 flex items-center gap-2">
            <ExclamationCircleIcon className="size-5" />
            {progress.recentErrors.length} Issue{progress.recentErrors.length > 1 ? 's' : ''}
          </h3>
          <div className="mt-2 space-y-1 text-sm">
            {progress.recentErrors.slice(0, 5).map((err, i) => (
              <div key={i} className="text-gray-300">
                <span className="text-red-400 font-medium">{err.filename}</span>
                <span className="text-gray-500"> — {err.status}</span>
              </div>
            ))}
            {progress.recentErrors.length > 5 && (
              <p className="text-gray-500 text-xs">+{progress.recentErrors.length - 5} more</p>
            )}
          </div>
          <button
            onClick={fetchLogs}
            className="mt-3 text-xs text-red-400 hover:text-red-300 underline"
          >
            View all errors →
          </button>
        </div>
      )}

      {/* Detailed Logs Modal */}
      {showLogs && (
        <div className="rounded-lg bg-gray-900 p-4 border border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-white">Import Logs ({logs.length})</h3>
            <button
              onClick={() => setShowLogs(false)}
              className="text-gray-400 hover:text-white text-lg"
            >
              ✕
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto space-y-1 text-xs">
            {logs.map((log, i) => (
              <div key={i} className="flex items-start gap-2 p-2 rounded bg-gray-800">
                 {log.status === 'complete' ? (
                   <CheckCircleIcon className="size-4 text-green-400 flex-shrink-0 mt-0.5" />
                 ) : log.status === 'forbidden' ? (
                   <ExclamationCircleIcon className="size-4 text-orange-400 flex-shrink-0 mt-0.5" />
                 ) : log.status === 'error' ? (
                   <ExclamationCircleIcon className="size-4 text-red-400 flex-shrink-0 mt-0.5" />
                 ) : (
                   <ClockIcon className="size-4 text-gray-400 flex-shrink-0 mt-0.5" />
                 )}
                <div className="flex-1">
                  <div className="font-medium text-gray-200">{log.filename}</div>
                  {log.errorMessage && (
                    <div className="text-gray-500 text-xs mt-0.5">{log.errorMessage}</div>
                  )}
                </div>
                <span className="text-gray-500 flex-shrink-0 whitespace-nowrap">
                  {new Date(log.updatedAt).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Active Import */}
      {!activeJob && (
        <div className="rounded-lg bg-gray-900 p-4 border border-gray-800 text-center text-gray-400 text-sm">
          No active Canvas imports. Start an import from the Canvas settings.
        </div>
      )}
    </div>
  )
}
