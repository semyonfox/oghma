'use client'

import { useState } from 'react'
import { CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline'
import useI18n from '@/lib/notes/hooks/use-i18n'

/**
 * CanvasIntegration
 *
 * Handles the full Canvas LMS connection flow on the settings page:
 *   1. User enters their institution domain and API token
 *   2. On connect, we validate the token against Canvas and store it
 *   3. Detected courses are shown as checkboxes for the user to select
 *   4. On import, selected courses are sent to the import pipeline
 *   5. Progress and forbidden files are shown via status polling
 */
export default function CanvasIntegration() {
  const { t } = useI18n()
  
  // Connection form state
  const [domain, setDomain] = useState('')
  const [token, setToken] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionError, setConnectionError] = useState(null)

  // Post-connection state
  const [isConnected, setIsConnected] = useState(false)
  const [courses, setCourses] = useState([])
  const [selectedCourseIds, setSelectedCourseIds] = useState([])

  // Import state
  const [isImporting, setIsImporting] = useState(false)
  const [importSummary, setImportSummary] = useState(null)
  const [importStatus, setImportStatus] = useState(null)

  /**
   * Validates the token against Canvas, stores credentials, and loads courses.
   * Called when the user clicks "Connect".
   */
  const handleConnect = async () => {
    if (!domain || !token) return

    setIsConnecting(true)
    setConnectionError(null)

    try {
      const res = await fetch('/api/canvas/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, token }),
      })

      const data = await res.json()

      if (!res.ok) {
        setConnectionError(data.error ?? 'Connection failed')
        return
      }

      // Token is valid — show the course selection UI
      setIsConnected(true)
      setCourses(data.courses ?? [])

    } catch {
      setConnectionError('Could not reach the server. Please try again.')
    } finally {
      setIsConnecting(false)
    }
  }

  /**
   * Disconnects Canvas by clearing the stored token.
   * Resets the component back to the initial state.
   */
  const handleDisconnect = async () => {
    try {
      await fetch('/api/canvas/connect', {
        method: 'DELETE',
      })
    } finally {
      // Reset all state regardless of server response
      setIsConnected(false)
      setCourses([])
      setSelectedCourseIds([])
      setImportSummary(null)
      setImportStatus(null)
      setDomain('')
      setToken('')
    }
  }

  /**
   * Toggles a course in/out of the selected set.
   */
  const toggleCourse = (courseId) => {
    setSelectedCourseIds(prev =>
      prev.includes(courseId)
        ? prev.filter(id => id !== courseId)
        : [...prev, courseId]
    )
  }

  /**
   * Triggers the import for selected courses, then polls for status.
   */
  const handleImport = async () => {
    if (selectedCourseIds.length === 0) return

    setIsImporting(true)
    setImportSummary(null)

    try {
      const res = await fetch('/api/canvas/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseIds: selectedCourseIds }),
      })

      const data = await res.json()

      if (!res.ok) {
        setConnectionError(data.error ?? 'Import failed')
        return
      }

      setImportSummary(data.summary)

      // Fetch full status to show forbidden files list
      const statusRes = await fetch('/api/canvas/status')
      const statusData = await statusRes.json()
      if (statusRes.ok) {
        setImportStatus(statusData)
      }

    } catch {
      setConnectionError('Import failed. Please try again.')
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-y-8 sm:max-w-xl">

      {/* ── How to get your token ───────────────────────────────────── */}
       <div className="rounded-md bg-white/5 p-4 ring-1 ring-white/10">
         <h3 className="text-sm font-semibold text-white mb-2">{t('How to generate your Canvas API token')}</h3>
         <ol className="list-decimal list-inside space-y-1 text-sm text-gray-400">
           <li>{t('Log into your Canvas account')}</li>
           <li>{t('Click your profile picture → ')} <span className="text-gray-300">{t('Settings')}</span></li>
           <li>{t('Scroll down to ')} <span className="text-gray-300">{t('Approved Integrations')}</span></li>
           <li>{t('Click ')} <span className="text-gray-300">{t('+ New Access Token')}</span></li>
           <li>{t('Give it a name (e.g. "OghmaNotes") and click ')} <span className="text-gray-300">{t('Generate Token')}</span></li>
           <li>{t('Copy the token and paste it below — Canvas will only show it once')}</li>
         </ol>
       </div>

      {/* ── Connection form ─────────────────────────────────────────── */}
      {!isConnected && (
        <>
           {/* Institution domain */}
           <div>
             <label htmlFor="canvas-domain" className="block text-sm/6 font-medium text-white">
               {t('Canvas Domain')}
             </label>
             <p className="mt-1 text-xs text-gray-400">
               {t('Your institution\'s Canvas URL e.g. ')} <span className="text-gray-300">dcu.instructure.com</span>
             </p>
             <div className="mt-2">
               <input
                 id="canvas-domain"
                 type="text"
                 placeholder="dcu.instructure.com"
                 value={domain}
                 onChange={e => setDomain(e.target.value)}
                 className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6"
               />
             </div>
           </div>

           {/* API token */}
           <div>
             <label htmlFor="canvas-token" className="block text-sm/6 font-medium text-white">
               {t('API Token')}
             </label>
             <div className="mt-2">
               <input
                 id="canvas-token"
                 type="password"
                 placeholder={t('Paste your Canvas API token here')}
                 value={token}
                 onChange={e => setToken(e.target.value)}
                 className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-white outline-1 -outline-offset-1 outline-white/10 placeholder:text-gray-500 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-500 sm:text-sm/6"
               />
             </div>
           </div>

          {/* Error message */}
          {connectionError && (
            <div className="flex items-center gap-2 text-sm text-red-400">
              <ExclamationCircleIcon className="size-4 shrink-0" />
              {connectionError}
            </div>
          )}

           <button
             type="button"
             disabled={!domain || !token || isConnecting}
             onClick={handleConnect}
             className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed"
           >
             {isConnecting ? t('Connecting...') : t('Connect Canvas')}
           </button>
        </>
      )}

      {/* ── Connected state — course selection ──────────────────────── */}
      {isConnected && (
        <>
           <div className="flex items-center gap-2 text-sm text-green-400">
             <CheckCircleIcon className="size-4 shrink-0" />
             {t('Connected to')} {domain}
           </div>

           {/* Course list */}
           <div>
             <h3 className="text-sm font-medium text-white mb-3">
               {t('Select courses to import')}
             </h3>
            <div className="space-y-2">
              {courses.map(course => (
                <label key={course.id} className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedCourseIds.includes(course.id)}
                    onChange={() => toggleCourse(course.id)}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm text-white">{course.name}</p>
                    <p className="text-xs text-gray-400">{course.course_code}</p>
                     {/* Show module count if available */}
                     {course.modules?.length > 0 && (
                       <p className="text-xs text-gray-500">{course.modules.length} {course.modules.length !== 1 ? t('modules') : t('module')}</p>
                     )}
                  </div>
                </label>
              ))}
            </div>
          </div>

           {/* Import result summary */}
           {importSummary && (
             <div className="rounded-md bg-white/5 p-4 ring-1 ring-white/10 text-sm text-gray-300 space-y-1">
               <p className="font-medium text-white">{t('Import complete')}</p>
               <p>✅ {t('Imported')}: {importSummary.imported}</p>
               {importSummary.forbidden > 0 && (
                 <p>🔒 {t('Restricted by lecturer')}: {importSummary.forbidden} — {t('see below to upload manually')}</p>
               )}
               {importSummary.failed > 0 && <p>❌ {t('Failed')}: {importSummary.failed}</p>}
               {importSummary.skipped > 0 && <p>⏭ {t('Skipped (unsupported type)')}: {importSummary.skipped}</p>}
             </div>
           )}

           {/* Forbidden files — need manual upload */}
           {importStatus?.forbidden?.length > 0 && (
             <div className="rounded-md bg-yellow-500/10 p-4 ring-1 ring-yellow-500/20">
               <h3 className="text-sm font-semibold text-yellow-400 mb-2">
                 {t('Files restricted by lecturers — upload manually')}
               </h3>
              <ul className="space-y-1">
                {importStatus.forbidden.map((file, i) => (
                  <li key={i} className="text-xs text-gray-400">
                    {file.filename}
                    {file.error_message && (
                      <span className="text-gray-500"> — {file.error_message}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

           {/* Action buttons */}
           <div className="flex gap-3">
             <button
               type="button"
               disabled={selectedCourseIds.length === 0 || isImporting}
               onClick={handleImport}
               className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed"
             >
               {isImporting ? t('Importing...') : `${t('Import')} ${selectedCourseIds.length > 0 ? `(${selectedCourseIds.length})` : ''}`}
             </button>
             <button
               type="button"
               onClick={handleDisconnect}
               className="rounded-md bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-400 ring-1 ring-red-500/20 hover:bg-red-500/20"
             >
               {t('Disconnect')}
             </button>
           </div>
        </>
      )}
    </div>
  )
}
