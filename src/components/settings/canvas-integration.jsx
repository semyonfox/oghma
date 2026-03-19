'use client'

import { useState, useEffect, useRef } from 'react'
import { ExclamationCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import useI18n from '@/lib/notes/hooks/use-i18n'

// localStorage keys
const LS_SELECTED = 'canvas_selected_courses'
const LS_ERRORS   = 'canvas_course_errors'

/** Inline SVG check — heroicons CheckCircle style, no external dep needed */
function CheckCircleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
    </svg>
  )
}

/**
 * CanvasIntegration
 *
 * Handles the full Canvas LMS connection flow on the settings page:
 *   1. On mount, checks GET /api/canvas/connect for a stored, live connection
 *   2. If connected, shows course list immediately (skips the form)
 *   3. User enters domain + token only when there is no stored connection
 *   4. Selected course IDs are persisted in localStorage
 *   5. Per-course import errors (403s etc.) are stored and shown inline
 *   6. Progress and forbidden files are shown via status polling
 */
export default function CanvasIntegration() {
  const { t } = useI18n()

  // Connection form state
  const [domain, setDomain]               = useState('')
  const [token, setToken]                 = useState('')
  const [isConnecting, setIsConnecting]   = useState(false)
  const [connectionError, setConnectionError] = useState(null)

  // Post-connection state
  const [isConnected, setIsConnected]     = useState(false)
  const [connectedDomain, setConnectedDomain] = useState('')
  const [courses, setCourses]             = useState([])
  const [selectedCourseIds, setSelectedCourseIds] = useState([])
  const [courseErrors, setCourseErrors]   = useState({})   // { courseId: errorMessage }

  // Startup check
  const [isCheckingConnection, setIsCheckingConnection] = useState(true)
  // Set to a warning string when a stored token exists but is no longer valid
  const [connectionWarning, setConnectionWarning] = useState(null)

  // Import state
  const [isImporting, setIsImporting]     = useState(false)
  const [importSummary, setImportSummary] = useState(null) // { imported, forbidden, failed, skipped, alreadyImported }
  const [importStatus, setImportStatus]   = useState(null) // live status from polling
  const [progress, setProgress]           = useState(null) // { percent, completed, total, downloading, processing }
  const pollRef                           = useRef(null)

  // Sync state
  const [isSyncing, setIsSyncing]         = useState(false)
  const [syncAvailable, setSyncAvailable] = useState(false)

  // ── On mount: restore localStorage selections/errors, then check connection ──
  useEffect(() => {
    const savedErrors = JSON.parse(localStorage.getItem(LS_ERRORS) ?? '{}')
    setCourseErrors(savedErrors)

    const checkConnection = async () => {
      try {
        const res  = await fetch('/api/canvas/connect')
        const data = await res.json()

        if (res.ok && data.connected) {
          setIsConnected(true)
          setConnectedDomain(data.domain)
          setCourses(data.courses ?? [])

          // Restore previously selected courses that still exist in the list
          const savedIds  = JSON.parse(localStorage.getItem(LS_SELECTED) ?? '[]')
          const validIds  = (data.courses ?? []).map(c => c.id)
          setSelectedCourseIds(savedIds.filter(id => validIds.includes(id)))

          // check if a sync is available (has prior imports)
          fetch('/api/canvas/sync').then(r => r.json()).then(d => {
            setSyncAvailable(d.available ?? false)
          }).catch(() => {})
        } else if (res.ok && !data.connected) {
          // Server responded but token is invalid or expired — prompt re-auth
          setConnectionWarning(t('Your Canvas token is invalid or expired. Please reconnect.'))
        }
        // 401 / network error → just show the form with no warning
      } catch {
        // Network error — just show the form
      } finally {
        setIsCheckingConnection(false)
      }
    }

    checkConnection()
  }, [])

  // ── Persist selected courses whenever they change ────────────────────────────
  useEffect(() => {
    localStorage.setItem(LS_SELECTED, JSON.stringify(selectedCourseIds))
  }, [selectedCourseIds])

  /**
   * Validates the token against Canvas, stores credentials, and loads courses.
   */
  const handleConnect = async () => {
    if (!domain || !token) return

    setIsConnecting(true)
    setConnectionError(null)

    try {
      const res  = await fetch('/api/canvas/connect', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ domain, token }),
      })

      const data = await res.json()

      if (!res.ok) {
        setConnectionError(data.error ?? 'Connection failed')
        return
      }

      setIsConnected(true)
      setConnectedDomain(domain)
      setCourses(data.courses ?? [])

      // Restore any previously saved selection for these courses
      const savedIds = JSON.parse(localStorage.getItem(LS_SELECTED) ?? '[]')
      const validIds = (data.courses ?? []).map(c => c.id)
      setSelectedCourseIds(savedIds.filter(id => validIds.includes(id)))

    } catch {
      setConnectionError('Could not reach the server. Please try again.')
    } finally {
      setIsConnecting(false)
    }
  }

  /**
   * Disconnects Canvas, clears all local state and localStorage.
   */
  const handleDisconnect = async () => {
    try {
      await fetch('/api/canvas/connect', { method: 'DELETE' })
    } finally {
      setIsConnected(false)
      setConnectedDomain('')
      setCourses([])
      setSelectedCourseIds([])
      setImportSummary(null)
      setImportStatus(null)
      setDomain('')
      setToken('')
      // Clear persisted selections and errors on disconnect
      localStorage.removeItem(LS_SELECTED)
      localStorage.removeItem(LS_ERRORS)
      setCourseErrors({})
    }
  }

  /**
   * Queues a resync job for all previously imported courses.
   * The worker handles deduplication — only new files will be downloaded.
   */
  const handleSync = async () => {
    setIsSyncing(true)
    setImportSummary(null)
    try {
      const res  = await fetch('/api/canvas/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.queued) {
        setConnectionError(data.error ?? data.reason ?? t('Sync failed'))
        return
      }
      setIsImporting(true)
      setProgress({ percent: 0, completed: 0, total: 0, downloading: 0, processing: 0 })
      startPolling()
    } catch {
      setConnectionError(t('Sync failed. Please try again.'))
    } finally {
      setIsSyncing(false)
    }
  }

  /** Toggles a course in/out of the selected set. */
  const toggleCourse = (courseId) => {
    setSelectedCourseIds(prev =>
      prev.includes(courseId)
        ? prev.filter(id => id !== courseId)
        : [...prev, courseId]
    )
  }

  const allSelected = courses.length > 0 && selectedCourseIds.length === courses.length
  const someSelected = selectedCourseIds.length > 0 && !allSelected

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedCourseIds([])
    } else {
      setSelectedCourseIds(courses.map(c => c.id))
    }
  }

  /** Poll /api/canvas/status until no active job remains. */
  const startPolling = () => {
    if (pollRef.current) return // already polling
    pollRef.current = setInterval(async () => {
      try {
        const res  = await fetch('/api/canvas/status')
        const data = await res.json()
        if (!res.ok) return
        setProgress(data.progress)
        setImportStatus(data)
        // stop when job finishes
        if (!data.activeJob) {
          stopPolling()
          setIsImporting(false)
          if (data.progress) {
            setImportSummary({
              imported:  data.progress.completed,
              forbidden: data.issues?.forbidden ?? 0,
              failed:    data.issues?.error ?? 0,
              skipped:   0,
            })
          }
        }
      } catch {
        // swallow — keep polling
      }
    }, 2500)
  }

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  // clean up on unmount
  useEffect(() => stopPolling, [])

  /**
   * Triggers the import for selected courses, then fetches status.
   * Per-course 403 errors are captured into localStorage + state.
   */
  const handleImport = async () => {
    if (selectedCourseIds.length === 0) return

    setIsImporting(true)
    setImportSummary(null)

    try {
      // The import API expects { courseIds: string[] }
      const res  = await fetch('/api/canvas/import', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ courseIds: selectedCourseIds }),
      })

      const data = await res.json()

      if (!res.ok) {
        // Check for per-course 403 errors in the response
        if (res.status === 403 && data.courseId) {
          const updated = {
            ...courseErrors,
            [data.courseId]: data.error ?? 'Access denied',
          }
          setCourseErrors(updated)
          localStorage.setItem(LS_ERRORS, JSON.stringify(updated))
        }
        setConnectionError(data.error ?? t('Import failed'))
        return
      }

      // job queued — start polling for live progress
      setProgress({ percent: 0, completed: 0, total: 0, downloading: 0, processing: 0 })
      startPolling()

    } catch {
      setConnectionError(t('Import failed. Please try again.'))
      setIsImporting(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (isCheckingConnection) {
    return (
      <div className="text-sm text-text-tertiary animate-pulse">
        {t('Checking Canvas connection...')}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-y-8 sm:max-w-xl">

      {/* ── Connection status badge (when connected) ────────────────── */}
      {isConnected && (
        <div className="flex items-center gap-2 text-sm text-green-400">
          <CheckCircleIcon className="size-4 shrink-0" />
          <span>{t('Connected to')} <span className="font-medium">{connectedDomain}</span></span>
        </div>
      )}

      {/* ── Expired / invalid token warning ────────────────────────── */}
      {!isConnected && connectionWarning && (
        <div className="flex items-center gap-2 rounded-md bg-yellow-500/10 px-3 py-2 text-sm text-yellow-400 ring-1 ring-yellow-500/20">
          <ExclamationTriangleIcon className="size-4 shrink-0" />
          {connectionWarning}
        </div>
      )}

      {/* ── How to get your token ──────────────────────────────────── */}
      {!isConnected && (
        <div className="rounded-md bg-white/5 p-4 ring-1 ring-white/10">
           <h3 className="text-sm font-semibold text-text-secondary mb-2">{t('How to generate your Canvas API token')}</h3>
           <ol className="list-decimal list-inside space-y-1 text-sm text-text-tertiary">
            <li>{t('Log into your Canvas account')}</li>
             <li>{t('Click your profile picture →')} <span className="text-text-secondary">{t('Settings')}</span></li>
             <li>{t('Scroll down to')} <span className="text-text-secondary">{t('Approved Integrations')}</span></li>
             <li>{t('Click')} <span className="text-text-secondary">{t('+ New Access Token')}</span></li>
             <li>{t('Give it a name (e.g. "OghmaNotes") and click')} <span className="text-text-secondary">{t('Generate Token')}</span></li>
            <li>{t('Copy the token and paste it below — Canvas will only show it once')}</li>
          </ol>
        </div>
      )}

      {/* ── Connection form ────────────────────────────────────────── */}
      {!isConnected && (
        <>
          <div>
            <label htmlFor="canvas-domain" className="block text-sm/6 font-medium text-text-secondary">
              {t('Canvas Domain')}
            </label>
             <p className="mt-1 text-xs text-text-tertiary">
               {t("Your institution's Canvas URL e.g.")}{' '}
               <span className="text-text-secondary">dcu.instructure.com</span>
            </p>
            <div className="mt-2">
              <input
                id="canvas-domain"
                type="text"
                placeholder="dcu.instructure.com"
                value={domain}
                onChange={e => setDomain(e.target.value)}
               className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-text-secondary outline-1 -outline-offset-1 outline-white/10 placeholder:text-text-tertiary focus:outline-2 focus:-outline-offset-2 focus:outline-primary-500 sm:text-sm/6"
             />
           </div>
         </div>

         <div>
           <label htmlFor="canvas-token" className="block text-sm/6 font-medium text-text-secondary">
             {t('API Token')}
           </label>
           <div className="mt-2">
             <input
               id="canvas-token"
               type="password"
               placeholder={t('Paste your Canvas API token here')}
               value={token}
               onChange={e => setToken(e.target.value)}
               className="block w-full rounded-md bg-white/5 px-3 py-1.5 text-base text-text-secondary outline-1 -outline-offset-1 outline-white/10 placeholder:text-text-tertiary focus:outline-2 focus:-outline-offset-2 focus:outline-primary-500 sm:text-sm/6"
              />
            </div>
          </div>

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

      {/* ── Connected state — course selection ─────────────────────── */}
      {isConnected && (
        <>
          {/* Course list */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-text-secondary">
                {t('Select courses to import')}
              </h3>
              {courses.length > 0 && (
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="text-xs text-primary-400 hover:text-primary-300 font-medium"
                >
                  {allSelected ? t('Deselect all') : someSelected ? t('Select all') : t('Select all')}
                </button>
              )}
            </div>
            <div className="space-y-2">
              {courses.map(course => {
                const courseError = courseErrors[course.id]
                return (
                  <label key={course.id} className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedCourseIds.includes(course.id)}
                      onChange={() => toggleCourse(course.id)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-text-secondary">{course.name}</p>
                        {courseError && (
                          <span
                            title={courseError}
                            className="inline-flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-xs text-yellow-400 ring-1 ring-yellow-500/20"
                          >
                            <ExclamationTriangleIcon className="size-3 shrink-0" />
                            {t('Access issue')}
                          </span>
                        )}
                      </div>
                       <p className="text-xs text-text-tertiary">{course.course_code}</p>
                       {course.modules?.length > 0 && (
                         <p className="text-xs text-text-tertiary">
                          {course.modules.length}{' '}
                          {course.modules.length !== 1 ? t('modules') : t('module')}
                        </p>
                      )}
                      {courseError && (
                        <p className="text-xs text-yellow-500/80 mt-0.5">{courseError}</p>
                      )}
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Import error */}
          {connectionError && (
            <div className="flex items-center gap-2 text-sm text-red-400">
              <ExclamationCircleIcon className="size-4 shrink-0" />
              {connectionError}
            </div>
          )}

          {/* Live import progress bar */}
          {isImporting && progress && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-text-tertiary">
                <span>
                  {progress.downloading > 0 && `${progress.downloading} ${t('downloading')}${progress.processing > 0 ? ', ' : ''}`}
                  {progress.processing > 0 && `${progress.processing} ${t('processing')}`}
                  {progress.downloading === 0 && progress.processing === 0 && t('Starting…')}
                </span>
                <span className="tabular-nums font-medium text-text-secondary">{progress.percent ?? 0}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary-500 transition-all duration-500"
                  style={{ width: `${progress.percent ?? 0}%` }}
                />
              </div>
              {progress.total > 0 && (
                <p className="text-xs text-text-tertiary tabular-nums">
                  {progress.completed} / {progress.total} {t('files')}
                </p>
              )}
            </div>
          )}

          {/* Import result summary */}
          {importSummary && !isImporting && (
            <div className="rounded-md bg-white/5 p-4 ring-1 ring-white/10 text-sm text-text-secondary space-y-1">
              <p className="font-medium text-text-secondary">{t('Import complete')}</p>
              {importSummary.imported != null && (
                <p className="text-xs text-text-tertiary">
                  {importSummary.imported} {t('imported')}
                  {importSummary.alreadyImported > 0 ? `, ${importSummary.alreadyImported} ${t('already up to date')}` : ''}
                  {importSummary.skipped > 0 ? `, ${importSummary.skipped} ${t('skipped')}` : ''}
                </p>
              )}
              {importSummary.forbidden > 0 && (
                <p className="text-xs text-yellow-400">
                  {importSummary.forbidden} {t('file(s) restricted by lecturers — upload manually')}
                </p>
              )}
              {importSummary.failed > 0 && (
                <p className="text-xs text-red-400">
                  {importSummary.failed} {t('file(s) failed to process')}
                </p>
              )}
            </div>
          )}

          {/* Forbidden / error files from status */}
          {importStatus?.recentErrors?.length > 0 && (
            <div className="rounded-md bg-yellow-500/10 p-4 ring-1 ring-yellow-500/20">
              <h3 className="text-sm font-semibold text-yellow-400 mb-2">
                {t('Files restricted by lecturers — upload manually')}
              </h3>
              <ul className="space-y-1">
                {importStatus.recentErrors.map((file, i) => (
                   <li key={i} className="text-xs text-text-tertiary">
                     {file.filename}
                     {file.errorMessage && (
                       <span className="text-text-tertiary"> — {file.errorMessage}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={selectedCourseIds.length === 0 || isImporting || isSyncing}
              onClick={handleImport}
              className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isImporting && !isSyncing
                ? t('Importing...')
                : `${t('Import')}${selectedCourseIds.length > 0 ? ` (${selectedCourseIds.length})` : ''}`}
            </button>
            {syncAvailable && (
              <button
                type="button"
                disabled={isImporting || isSyncing}
                onClick={handleSync}
                className="rounded-md bg-white/5 px-3 py-2 text-sm font-semibold text-text-secondary ring-1 ring-white/10 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                title={t('Check for new files in previously imported courses')}
              >
                {isSyncing ? t('Syncing...') : t('Sync')}
              </button>
            )}
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
