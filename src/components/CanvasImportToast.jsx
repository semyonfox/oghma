'use client'

import { useState, useEffect } from 'react'
import { Transition } from '@headlessui/react'
import { CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline'
import { XMarkIcon } from '@heroicons/react/20/solid'

export default function CanvasImportToast({ show, onClose, progress, onViewLogs }) {
  const { total = 0, completed = 0, percent = 0, forbidden = 0, error = 0 } = progress || {}
  
  // Determine toast state
  const isProcessing = percent < 100 && total > 0
  const isComplete = percent === 100 && total > 0
  const hasIssues = forbidden > 0 || error > 0

  // Auto-hide after 5 seconds if complete without issues
  useEffect(() => {
    if (isComplete && !hasIssues && show) {
      const timer = setTimeout(onClose, 5000)
      return () => clearTimeout(timer)
    }
  }, [isComplete, hasIssues, show, onClose])

  const icon = isProcessing ? (
    <div className="animate-spin">
      <svg className="size-6 text-blue-400" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
    </div>
  ) : isComplete ? (
    <CheckCircleIcon aria-hidden="true" className="size-6 text-green-400" />
  ) : (
    <ExclamationCircleIcon aria-hidden="true" className="size-6 text-yellow-400" />
  )

  const title = isProcessing 
    ? `Importing Canvas files... ${completed}/${total}`
    : isComplete
    ? `Canvas import complete! ${completed} files imported`
    : `Canvas import failed`

  const subtitle = isProcessing
    ? `${percent}% done`
    : isComplete && (forbidden > 0 || error > 0)
    ? `${forbidden} forbidden, ${error} failed. Click to view details.`
    : isComplete
    ? `All files imported successfully`
    : `Some files could not be imported`

  return (
    <div
      aria-live="assertive"
      className="pointer-events-none fixed inset-0 flex items-end px-4 py-6 sm:items-start sm:p-6 z-50"
    >
      <div className="flex w-full flex-col items-center space-y-4 sm:items-end">
        <Transition show={show}>
          <div className="pointer-events-auto w-full max-w-sm rounded-lg bg-gray-800 shadow-lg outline-1 -outline-offset-1 outline-white/10 transition data-closed:opacity-0 data-enter:transform data-enter:duration-300 data-enter:ease-out data-closed:data-enter:translate-y-2 data-leave:duration-100 data-leave:ease-in data-closed:data-enter:sm:translate-x-2 data-closed:data-enter:sm:translate-y-0">
            <div className="p-4">
              <div className="flex items-start">
                <div className="shrink-0">
                  {icon}
                </div>
                <div className="ml-3 w-0 flex-1 pt-0.5">
                  <p className="text-sm font-medium text-white">{title}</p>
                  <p className="mt-1 text-sm text-gray-400">{subtitle}</p>
                  
                  {/* Progress bar */}
                  {isProcessing && (
                    <div className="mt-3 w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all duration-300"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  )}

                  {/* View logs button for completed/failed imports */}
                  {!isProcessing && onViewLogs && (
                    <button
                      onClick={onViewLogs}
                      className="mt-3 text-xs font-medium text-blue-400 hover:text-blue-300 underline"
                    >
                      View detailed logs →
                    </button>
                  )}
                </div>
                <div className="ml-4 flex shrink-0">
                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex rounded-md text-gray-400 hover:text-white focus:outline-2 focus:outline-offset-2 focus:outline-indigo-500"
                  >
                    <span className="sr-only">Close</span>
                    <XMarkIcon aria-hidden="true" className="size-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </div>
  )
}
