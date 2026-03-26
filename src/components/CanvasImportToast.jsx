'use client'

import { useEffect, useState } from 'react'

/**
 * Subtle bottom-bar notification for Canvas imports.
 * Sits at the very bottom of the viewport as a thin strip — not a floating toast.
 * Auto-hides after completion (with a brief "done" message).
 */
export default function CanvasImportToast({ show, onClose, progress, onViewLogs }) {
  const { total = 0, completed = 0, percent = 0, forbidden = 0, error = 0 } = progress || {}
  const [visible, setVisible] = useState(false)

  const isProcessing = total > 0 && percent < 100
  const isComplete = total > 0 && percent === 100
  const hasIssues = forbidden > 0 || error > 0

  // animate in
  useEffect(() => {
    if (show) {
      requestAnimationFrame(() => setVisible(true))
    } else {
      requestAnimationFrame(() => setVisible(false))
    }
  }, [show])

  // auto-hide 6s after completion
  useEffect(() => {
    if (isComplete && show) {
      const timer = setTimeout(() => {
        setVisible(false)
        setTimeout(onClose, 300)
      }, hasIssues ? 10000 : 6000)
      return () => clearTimeout(timer)
    }
  }, [isComplete, hasIssues, show, onClose])

  if (!show) return null

  // build status text
  let text
  if (isProcessing) {
    text = `Importing Canvas files — ${completed}/${total}`
    if (forbidden > 0) text += ` · ${forbidden} restricted`
  } else if (isComplete && hasIssues) {
    const parts = [`${completed} imported`]
    if (forbidden > 0) parts.push(`${forbidden} restricted`)
    if (error > 0) parts.push(`${error} failed`)
    text = `Canvas import done — ${parts.join(', ')}`
  } else if (isComplete) {
    text = `Canvas import complete — ${completed} files imported`
  } else {
    text = 'Canvas import in progress...'
  }

  return (
    <div
      aria-live="polite"
      className={`fixed bottom-0 left-0 right-0 z-40 transition-transform duration-300 ${
        visible ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      {/* progress track */}
      {isProcessing && (
        <div className="h-0.5 w-full bg-white/5">
          <div
            className="h-full bg-primary-500 transition-all duration-700 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}

      {/* info strip */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-gray-900/95 backdrop-blur-sm border-t border-white/5 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          {isProcessing && (
            <svg className="w-3 h-3 animate-spin text-primary-400 shrink-0" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {isComplete && !hasIssues && (
            <svg className="w-3 h-3 text-green-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
          {isComplete && hasIssues && (
            <svg className="w-3 h-3 text-orange-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          )}
          <span className="text-text-tertiary truncate">{text}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-3">
          {isProcessing && (
            <span className="tabular-nums text-text-tertiary/60">{percent}%</span>
          )}
          {!isProcessing && onViewLogs && (
            <button
              onClick={onViewLogs}
              className="text-primary-400 hover:text-primary-300 font-medium"
            >
              View logs
            </button>
          )}
          <button
            onClick={() => { setVisible(false); setTimeout(onClose, 300) }}
            className="text-text-tertiary hover:text-text-secondary p-0.5"
          >
            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
