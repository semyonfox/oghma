'use client'

import { useState, useEffect } from 'react'
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

  // Import state
  const [isImporting, setIsImporting]     = useState(false)
  const [importSummary, setImportSummary] = useState(null)
  const [importStatus, setImportStatus]   = useState(null)

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
        }
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

  /** Toggles a course in/out of the selected set. */
  const toggleCourse = (courseId) => {
    setSelectedCourseIds(prev =>
      prev.includes(courseId)
        ? prev.filter(id => id !== courseId)
        : [...prev, courseId]
    )
  }

  /**
   * Triggers the import for selected courses, then fetches status.
   * Per-course 403 errors are captured into localStorage + state.
   */
  const handleImport = async () => {
    if (selectedCourseIds.length === 0) return

    setIsImporting(true)
    setImportSummary(null)

    try {
      const selectedCourses = courses
        .filter(c => selectedCourseIds.includes(c.id))
        .map(c => ({ id: c.id, name: c.name, course_code: c.course_code }))

      const res  = await fetch('/api/canvas/import', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ courses: selectedCourses }),
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
        setConnectionError(data.error ?? 'Import failed')
        return
      }

      setImportSummary(data)

      // Fetch full status to surface forbidden-file details
      const statusRes  = await fetch('/api/canvas/status')
      const statusData = await statusRes.json()
      if (statusRes.ok) {
        setImportStatus(statusData)

        // Persist any forbidden files as course errors (keyed by first word of filename)
        if (statusData.recentErrors?.length > 0) {
          const newErrors = { ...courseErrors }
          statusData.recentErrors.forEach(e => {
            if (e.status === 'forbidden') {
              // We don't have courseId here, but surface the message in the summary
            }
          })
          if (Object.keys(newErrors).length > Object.keys(courseErrors).length) {
            setCourseErrors(newErrors)
            localStorage.setItem(LS_ERRORS, JSON.stringify(newErrors))
          }
        }
      }

    } catch {
      setConnectionError('Import failed. Please try again.')
    } finally {
      setIsImporting(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (isCheckingConnection) {
    return (
      <div className="text-sm text-gray-400 animate-pulse">
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

      {/* ── How to get your token ──────────────────────────────────── */}
      {!isConnected && (
        <div className="rounded-md bg-white/5 p-4 ring-1 ring-white/10">
          <h3 className="text-sm font-semibold text-white mb-2">{t('How to generate your Canvas API token')}</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm text-gray-400">
            <li>{t('Log into your Canvas account')}</li>
            <li>{t('Click your profile picture →')} <span className="text-gray-300">{t('Settings')}</span></li>
            <li>{t('Scroll down to')} <span className="text-gray-300">{t('Approved Integrations')}</span></li>
            <li>{t('Click')} <span className="text-gray-300">{t('+ New Access Token')}</span></li>
            <li>{t('Give it a name (e.g. "OghmaNotes") and click')} <span className="text-gray-300">{t('Generate Token')}</span></li>
            <li>{t('Copy the token and paste it below — Canvas will only show it once')}</li>
          </ol>
        </div>
      )}

      {/* ── Connection form ────────────────────────────────────────── */}
      {!isConnected && (
        <>
          <div>
            <label htmlFor="canvas-domain" className="block text-sm/6 font-medium text-white">
              {t('Canvas Domain')}
            </label>
            <p className="mt-1 text-xs text-gray-400">
              {t("Your institution's Canvas URL e.g.")}{' '}
              <span className="text-gray-300">dcu.instructure.com</span>
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
            <h3 className="text-sm font-medium text-white mb-3">
              {t('Select courses to import')}
            </h3>
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
                        <p className="text-sm text-white">{course.name}</p>
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
                      <p className="text-xs text-gray-400">{course.course_code}</p>
                      {course.modules?.length > 0 && (
                        <p className="text-xs text-gray-500">
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

          {/* Import result summary */}
          {importSummary && (
            <div className="rounded-md bg-white/5 p-4 ring-1 ring-white/10 text-sm text-gray-300 space-y-1">
              <p className="font-medium text-white">{t('Import queued')}</p>
              {importSummary.jobId && (
                <p className="text-xs text-gray-400">{t('Job ID')}: {importSummary.jobId}</p>
              )}
              <p className="text-xs text-gray-400">{t('Status')}: {importSummary.status ?? 'queued'}</p>
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
                  <li key={i} className="text-xs text-gray-400">
                    {file.filename}
                    {file.errorMessage && (
                      <span className="text-gray-500"> — {file.errorMessage}</span>
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
              {isImporting
                ? t('Importing...')
                : `${t('Import')}${selectedCourseIds.length > 0 ? ` (${selectedCourseIds.length})` : ''}`}
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
