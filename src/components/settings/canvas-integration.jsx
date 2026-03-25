'use client'

import { useState, useEffect, useRef } from 'react'
import { ExclamationCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import useI18n from '@/lib/notes/hooks/use-i18n'

// localStorage keys
const LS_SELECTED   = 'canvas_selected_courses'
const LS_ERRORS     = 'canvas_course_errors'
const LS_ACTIVE_JOB = 'canvas_active_job' // { jobId, startedAt }
const LS_FORBIDDEN  = 'canvas_forbidden_courses' // set of courseIds that had forbidden files
const LS_SYNCED     = 'canvas_synced_courses'    // set of courseIds successfully imported

/** Inline SVG check — heroicons CheckCircle style */
function CheckCircleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
    </svg>
  )
}

/** Inline SVG chevron down — for collapsible sections */
function ChevronDownIcon({ className, open }) {
  return (
    <svg className={`${className} transition-transform duration-200 ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  )
}

/** Status badge for each course */
function CourseBadge({ status, errorMsg }) {
  const config = {
    synced:    { color: 'fill-green-400',  text: 'text-green-200',  ring: 'ring-green-400/30',  label: 'Synced' },
    outOfSync: { color: 'fill-yellow-400', text: 'text-yellow-200', ring: 'ring-yellow-400/30', label: 'Out of sync' },
    syncing:   { color: 'fill-blue-400',   text: 'text-blue-200',   ring: 'ring-blue-400/30',   label: 'Syncing' },
    forbidden: { color: 'fill-orange-400', text: 'text-orange-200', ring: 'ring-orange-400/30', label: 'Restricted' },
    error:     { color: 'fill-red-400',    text: 'text-red-200',    ring: 'ring-red-400/30',    label: errorMsg ?? 'Failed' },
    idle:      null,
  }

  if (!config[status]) return null

  const { color, text, ring, label } = config[status]
  return (
    <span className={`inline-flex items-center gap-x-1.5 rounded-full px-2 py-1 text-xs font-medium ${text} ring-1 ${ring}`}>
      <svg viewBox="0 0 6 6" aria-hidden="true" className={`size-1.5 ${color}`}>
        <circle r={3} cx={3} cy={3} />
      </svg>
      {label}
    </span>
  )
}

/** Status dot + label for a single log entry */
function LogStatusIcon({ status }) {
  const map = {
    complete:    { dot: 'bg-green-400',  label: 'done' },
    processing:  { dot: 'bg-blue-400 animate-pulse', label: 'processing' },
    downloading: { dot: 'bg-yellow-400 animate-pulse', label: 'downloading' },
    forbidden:   { dot: 'bg-orange-400', label: 'restricted' },
    error:       { dot: 'bg-red-400',    label: 'error' },
  }
  const cfg = map[status] ?? { dot: 'bg-white/30', label: status }
  return (
    <span className={`mt-1 inline-block size-1.5 shrink-0 rounded-full ${cfg.dot}`} title={cfg.label} />
  )
}

/**
 * CanvasIntegration
 *
 * Handles the full Canvas LMS connection flow on the settings page.
 * Progress is persisted in localStorage so navigating away and back
 * doesn't lose the ongoing import state.
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
  const [courseErrors, setCourseErrors]   = useState({})

  // Startup check
  const [isCheckingConnection, setIsCheckingConnection] = useState(true)
  const [connectionWarning, setConnectionWarning] = useState(null)
  const [syncAvailable, setSyncAvailable] = useState(false)

  // Import state
  const [isImporting, setIsImporting]     = useState(false)
  const [importSummary, setImportSummary] = useState(null)
  const [progress, setProgress]           = useState(null)
  const [recentLogs, setRecentLogs]       = useState([])
  const [isSyncing, setIsSyncing]         = useState(false)
  const pollRef                           = useRef(null)

  // Per-course status tracking (persisted in localStorage)
  const [forbiddenCourses, setForbiddenCourses] = useState({}) // { [courseId]: true }
  const [syncedCourses, setSyncedCourses]       = useState({}) // { [courseId]: true }

  // UI state
  const [courseListOpen, setCourseListOpen]   = useState(true)
  const [logsSuccessOpen, setLogsSuccessOpen] = useState(false)
  const [logsFailedOpen, setLogsFailedOpen]   = useState(true)

  // ── On mount: restore state + check connection ────────────────────────────
  useEffect(() => {
    const savedErrors    = JSON.parse(localStorage.getItem(LS_ERRORS)    ?? '{}')
    const savedSynced    = JSON.parse(localStorage.getItem(LS_SYNCED)    ?? '{}')
    setCourseErrors(savedErrors)
    setSyncedCourses(savedSynced)

    const checkConnection = async () => {
      try {
        const res  = await fetch('/api/canvas/connect')
        const data = await res.json()

        if (res.ok && data.connected) {
          setIsConnected(true)
          setConnectedDomain(data.domain)
          setCourses(data.courses ?? [])

          // use server-side forbidden courses as source of truth
          if (data.forbiddenCourseIds?.length > 0) {
            const serverForbidden = {}
            for (const id of data.forbiddenCourseIds) serverForbidden[String(id)] = true
            setForbiddenCourses(serverForbidden)
            localStorage.setItem(LS_FORBIDDEN, JSON.stringify(serverForbidden))
          } else {
            // clear stale localStorage forbidden data
            const cached = JSON.parse(localStorage.getItem(LS_FORBIDDEN) ?? '{}')
            setForbiddenCourses(cached)
          }

          const savedIds = JSON.parse(localStorage.getItem(LS_SELECTED) ?? '[]')
          const validIds = (data.courses ?? []).map(c => c.id)
          setSelectedCourseIds(savedIds.filter(id => validIds.includes(id)))

          fetch('/api/canvas/sync').then(r => r.json()).then(d => {
            setSyncAvailable(d.available ?? false)
          }).catch(() => {})

          // resume any in-flight import that was started before page reload
          const savedJob = JSON.parse(localStorage.getItem(LS_ACTIVE_JOB) ?? 'null')
          if (savedJob?.jobId) {
            // ping status — if job is still active, resume polling
            const statusRes = await fetch('/api/canvas/status')
            if (statusRes.ok) {
              const statusData = await statusRes.json()
              if (statusData.activeJob) {
                setIsImporting(true)
                setProgress(statusData.progress)
                setRecentLogs(statusData.recentLogs ?? [])
                startPolling()
              } else {
                // job already finished while away
                localStorage.removeItem(LS_ACTIVE_JOB)
                if (statusData.progress) {
                  setImportSummary({
                    imported:  statusData.progress.completed,
                    forbidden: statusData.issues?.forbidden ?? 0,
                    failed:    statusData.issues?.error ?? 0,
                    skipped:   0,
                  })
                  setProgress(statusData.progress)
                  const logs = statusData.recentLogs ?? []
                  setRecentLogs(logs)
                  // backfill forbidden from returned logs
                  const newForbidden = { ...savedForbidden }
                  for (const log of logs) {
                    if (log.status === 'forbidden' && log.courseId) newForbidden[String(log.courseId)] = true
                  }
                  setForbiddenCourses(newForbidden)
                  localStorage.setItem(LS_FORBIDDEN, JSON.stringify(newForbidden))
                }
              }
            }
          }
        } else if (res.ok && !data.connected) {
          setConnectionWarning(t('Your Canvas token is invalid or expired. Please reconnect.'))
        }
      } catch {
        // network error — show the form
      } finally {
        setIsCheckingConnection(false)
      }
    }

    checkConnection()
  }, [])

  // ── Persist selected courses whenever they change ────────────────────────
  useEffect(() => {
    localStorage.setItem(LS_SELECTED, JSON.stringify(selectedCourseIds))
  }, [selectedCourseIds])

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

      const savedIds = JSON.parse(localStorage.getItem(LS_SELECTED) ?? '[]')
      const validIds = (data.courses ?? []).map(c => c.id)
      setSelectedCourseIds(savedIds.filter(id => validIds.includes(id)))

    } catch {
      setConnectionError('Could not reach the server. Please try again.')
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      await fetch('/api/canvas/connect', { method: 'DELETE' })
    } finally {
      stopPolling()
      setIsConnected(false)
      setConnectedDomain('')
      setCourses([])
      setSelectedCourseIds([])
      setImportSummary(null)
      setProgress(null)
      setRecentLogs([])
      setDomain('')
      setToken('')
      localStorage.removeItem(LS_SELECTED)
      localStorage.removeItem(LS_ERRORS)
      localStorage.removeItem(LS_ACTIVE_JOB)
      localStorage.removeItem(LS_FORBIDDEN)
      localStorage.removeItem(LS_SYNCED)
      setCourseErrors({})
      setForbiddenCourses({})
      setSyncedCourses({})
    }
  }

  const handleSync = async () => {
    setIsSyncing(true)
    setImportSummary(null)
    setRecentLogs([])
    try {
      const res  = await fetch('/api/canvas/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.queued) {
        setConnectionError(data.error ?? data.reason ?? t('Sync failed'))
        return
      }
      localStorage.setItem(LS_ACTIVE_JOB, JSON.stringify({ jobId: data.jobId, startedAt: new Date().toISOString() }))
      setIsImporting(true)
      setProgress({ percent: 0, completed: 0, total: 0, downloading: 0, processing: 0 })
      startPolling()
    } catch {
      setConnectionError(t('Sync failed. Please try again.'))
    } finally {
      setIsSyncing(false)
    }
  }

  const toggleCourse = (courseId) => {
    setSelectedCourseIds(prev =>
      prev.includes(courseId)
        ? prev.filter(id => id !== courseId)
        : [...prev, courseId]
    )
  }

  const allSelected  = courses.length > 0 && selectedCourseIds.length === courses.length
  const someSelected = selectedCourseIds.length > 0 && !allSelected

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedCourseIds([])
    } else {
      setSelectedCourseIds(courses.map(c => c.id))
    }
  }

  const getCourseStatus = (courseId) => {
    if ((isImporting || isSyncing) && selectedCourseIds.includes(courseId)) {
      return { status: 'syncing', error: null }
    }
    // forbidden badge is permanent — shown even when not importing
    if (forbiddenCourses[courseId]) {
      return { status: 'forbidden', error: null }
    }
    if (courseErrors[courseId]) {
      return { status: 'error', error: courseErrors[courseId] }
    }
    if (syncedCourses[courseId]) {
      return { status: syncAvailable ? 'outOfSync' : 'synced', error: null }
    }
    return { status: 'idle', error: null }
  }

  /** Poll /api/canvas/status every 2 s while a job is active. */
  const startPolling = () => {
    if (pollRef.current) return
    pollRef.current = setInterval(async () => {
      try {
        const res  = await fetch('/api/canvas/status')
        const data = await res.json()
        if (!res.ok) return

        setProgress(data.progress)
        const logs = data.recentLogs ?? []
        setRecentLogs(logs)

        // track which courses have forbidden files — persist permanently
        const newForbidden = { ...forbiddenCourses }
        let forbiddenChanged = false
        for (const log of logs) {
          if (log.status === 'forbidden' && log.courseId) {
            const key = String(log.courseId)
            if (!newForbidden[key]) {
              newForbidden[key] = true
              forbiddenChanged = true
            }
          }
        }
        if (forbiddenChanged) {
          setForbiddenCourses(newForbidden)
          localStorage.setItem(LS_FORBIDDEN, JSON.stringify(newForbidden))
        }

        if (!data.activeJob) {
          stopPolling()
          setIsImporting(false)
          localStorage.removeItem(LS_ACTIVE_JOB)
          if (data.progress) {
            setImportSummary({
              imported:  data.progress.completed,
              forbidden: data.issues?.forbidden ?? 0,
              failed:    data.issues?.error ?? 0,
              skipped:   0,
            })
            // mark selected courses as synced
            const newSynced = { ...syncedCourses }
            for (const id of selectedCourseIds) newSynced[String(id)] = true
            setSyncedCourses(newSynced)
            localStorage.setItem(LS_SYNCED, JSON.stringify(newSynced))
          }
        }
      } catch {
        // keep polling on transient errors
      }
    }, 2000)
  }

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  useEffect(() => stopPolling, [])

  const handleCancel = async () => {
    try {
      const res = await fetch('/api/canvas/import', { method: 'DELETE' })
      const data = await res.json()
      if (res.ok && data.cancelled) {
        stopPolling()
        setIsImporting(false)
        localStorage.removeItem(LS_ACTIVE_JOB)
        setImportSummary(null)
      }
    } catch {
      // polling will eventually detect the cancelled state
    }
  }

  const handleImport = async () => {
    if (selectedCourseIds.length === 0) return

    setIsImporting(true)
    setImportSummary(null)
    setProgress({ percent: 0, completed: 0, total: 0, downloading: 0, processing: 0 })
    setRecentLogs([])

    try {
      // send full course objects so the worker can use name/course_code/term for folder titles
      const selectedCourses = courses
        .filter(c => selectedCourseIds.includes(c.id))
        .map(c => ({ id: c.id, name: c.name, course_code: c.course_code, term: c.term ?? null }))

      const res  = await fetch('/api/canvas/import', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ courseIds: selectedCourses }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 403 && data.courseId) {
          const updated = { ...courseErrors, [data.courseId]: data.error ?? 'Access denied' }
          setCourseErrors(updated)
          localStorage.setItem(LS_ERRORS, JSON.stringify(updated))
        }
        setConnectionError(data.error ?? t('Import failed'))
        setIsImporting(false)
        return
      }

      // persist the jobId so progress survives a page reload
      localStorage.setItem(LS_ACTIVE_JOB, JSON.stringify({
        jobId: data.jobId,
        startedAt: new Date().toISOString(),
      }))

      startPolling()

    } catch {
      setConnectionError(t('Import failed. Please try again.'))
      setIsImporting(false)
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  function formatTime(secs) {
    if (!secs) return null
    if (secs < 60) return `~${secs}s`
    return `~${Math.ceil(secs / 60)}m`
  }

  function relativeTime(date) {
    const diff = Date.now() - new Date(date).getTime()
    const s = Math.floor(diff / 1000)
    if (s < 5)  return 'just now'
    if (s < 60) return `${s}s ago`
    return `${Math.floor(s / 60)}m ago`
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (isCheckingConnection) {
    return (
      <div className="text-sm text-text-tertiary animate-pulse">
        {t('Checking Canvas connection...')}
      </div>
    )
  }

  const showProgress = (isImporting || importSummary) && progress

  return (
    <div className="grid grid-cols-1 gap-y-8 sm:max-w-xl">

      {/* ── Connection status badge ────────────────────────────────── */}
      {isConnected && (
        <div className="flex items-center gap-2 text-sm text-green-400">
          <CheckCircleIcon className="size-4 shrink-0" />
          <span>{t('Connected to')} <span className="font-medium">{connectedDomain}</span></span>
        </div>
      )}

      {/* ── Expired / invalid token warning ───────────────────────── */}
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
          {/* Collapsible course list */}
          <div className="rounded-md border border-border-subtle">
            <button
              type="button"
              onClick={() => setCourseListOpen(!courseListOpen)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-text-secondary">
                  {t('Courses')}
                </h3>
                {selectedCourseIds.length > 0 && (
                  <span className="text-xs bg-primary-500/20 text-primary-400 px-2 py-0.5 rounded-full">
                    {selectedCourseIds.length} {t('selected')}
                  </span>
                )}
              </div>
              <ChevronDownIcon className="size-4 text-text-tertiary" open={courseListOpen} />
            </button>

            {courseListOpen && (
              <div className="border-t border-border-subtle px-4 py-3 space-y-3 bg-white/2.5">
                {courses.length > 0 && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="text-xs text-primary-400 hover:text-primary-300 font-medium"
                    >
                      {allSelected ? t('Deselect all') : t('Select all')}
                    </button>
                  </div>
                )}
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {courses.map(course => {
                    const { status, error } = getCourseStatus(course.id)
                    return (
                      <label key={course.id} className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedCourseIds.includes(course.id)}
                          onChange={() => toggleCourse(course.id)}
                          className="mt-0.5 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm text-text-secondary">{course.name}</p>
                            <CourseBadge status={status} errorMsg={error} />
                          </div>
                          <p className="text-xs text-text-tertiary">{course.course_code}</p>
                          {course.modules?.length > 0 && (
                            <p className="text-xs text-text-tertiary">
                              {course.modules.length}{' '}
                              {course.modules.length !== 1 ? t('modules') : t('module')}
                            </p>
                          )}
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Import error */}
          {connectionError && (
            <div className="flex items-center gap-2 text-sm text-red-400">
              <ExclamationCircleIcon className="size-4 shrink-0" />
              {connectionError}
            </div>
          )}

          {/* ── Progress panel ─────────────────────────────────────── */}
          {showProgress && (
            <div className="rounded-md border border-border-subtle overflow-hidden">
              {/* Header row */}
              <div className="flex items-center justify-between px-4 py-3 bg-white/2.5">
                <div className="flex items-center gap-2">
                  {isImporting && (
                    <span className="inline-block size-2 rounded-full bg-primary-400 animate-pulse" />
                  )}
                  <span className="text-sm font-medium text-text-secondary">
                    {isImporting
                      ? `${isSyncing ? t('Checking for updates...') : t('Importing...')} (${progress.completed}/${progress.total || '?'})`
                      : t('Import complete')}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {isImporting && progress?.estimatedSecsRemaining && (
                    <span className="text-xs text-text-tertiary tabular-nums">
                      {formatTime(progress.estimatedSecsRemaining)} left
                    </span>
                  )}
                  {importSummary && !isImporting && (
                    <div className="flex items-center gap-2 text-xs tabular-nums">
                      {importSummary.imported > 0 && (
                        <span className="text-green-400">{importSummary.imported} imported</span>
                      )}
                      {importSummary.forbidden > 0 && (
                        <span className="text-orange-400">{importSummary.forbidden} restricted</span>
                      )}
                      {importSummary.failed > 0 && (
                        <span className="text-red-400">{importSummary.failed} failed</span>
                      )}
                    </div>
                  )}
                  <span className="text-sm tabular-nums font-semibold text-text-secondary">
                    {progress.percent ?? 0}%
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 w-full bg-white/10">
                <div
                  className={`h-full transition-all duration-500 ${isImporting ? 'bg-primary-500' : 'bg-green-500'}`}
                  style={{ width: `${progress.percent ?? 0}%` }}
                />
              </div>

              {/* Log panels — success and failed/restricted */}
              {recentLogs.length > 0 && (() => {
                const successLogs  = recentLogs.filter(l => l.status === 'complete')
                const failedLogs   = recentLogs.filter(l => l.status === 'error' || l.status === 'forbidden')
                const activeLogs   = recentLogs.filter(l => l.status === 'downloading' || l.status === 'processing')

                const LogRow = ({ log }) => (
                  <div className={`flex items-start gap-2 px-4 py-1 border-b border-white/5 last:border-0 ${
                    log.status === 'forbidden' ? 'bg-orange-500/5' : log.status === 'error' ? 'bg-red-500/5' : ''
                  }`}>
                    <LogStatusIcon status={log.status} />
                    <span className="flex-1 min-w-0 truncate text-text-tertiary" title={log.filename}>
                      {log.filename}
                    </span>
                    {log.errorMessage && (
                      <span className="text-red-400/80 shrink-0 max-w-[10rem] truncate" title={log.errorMessage}>
                        {log.errorMessage}
                      </span>
                    )}
                    <span className="shrink-0 text-text-tertiary/50">{relativeTime(log.updatedAt)}</span>
                  </div>
                )

                return (
                  <div className="border-t border-border-subtle divide-y divide-border-subtle/50">
                    {/* In-progress files (no toggle — always visible while active) */}
                    {activeLogs.length > 0 && (
                      <div className="font-mono text-xs bg-black/20">
                        {activeLogs.map((log, i) => <LogRow key={i} log={log} />)}
                      </div>
                    )}

                    {/* Failed / restricted */}
                    {failedLogs.length > 0 && (
                      <div>
                        <button
                          type="button"
                          onClick={() => setLogsFailedOpen(o => !o)}
                          className="w-full flex items-center justify-between px-4 py-2 hover:bg-white/5 transition-colors"
                        >
                          <span className="text-xs font-medium text-red-400/80">
                            {t('Failed / Restricted')} ({failedLogs.length})
                          </span>
                          <ChevronDownIcon className="size-3.5 text-text-tertiary" open={logsFailedOpen} />
                        </button>
                        {logsFailedOpen && (
                          <div className="max-h-40 overflow-y-auto font-mono text-xs bg-black/20">
                            {failedLogs.map((log, i) => <LogRow key={i} log={log} />)}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Successful */}
                    {successLogs.length > 0 && (
                      <div>
                        <button
                          type="button"
                          onClick={() => setLogsSuccessOpen(o => !o)}
                          className="w-full flex items-center justify-between px-4 py-2 hover:bg-white/5 transition-colors"
                        >
                          <span className="text-xs font-medium text-green-400/80">
                            {t('Imported')} ({successLogs.length})
                          </span>
                          <ChevronDownIcon className="size-3.5 text-text-tertiary" open={logsSuccessOpen} />
                        </button>
                        {logsSuccessOpen && (
                          <div className="max-h-40 overflow-y-auto font-mono text-xs bg-black/20">
                            {successLogs.map((log, i) => <LogRow key={i} log={log} />)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            {isImporting ? (
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-md bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-400 ring-1 ring-red-500/20 hover:bg-red-500/20"
              >
                {t('Cancel import')}
              </button>
            ) : (
              <button
                type="button"
                disabled={selectedCourseIds.length === 0 || isSyncing}
                onClick={handleImport}
                className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {`${t('Import selected courses')}${selectedCourseIds.length > 0 ? ` (${selectedCourseIds.length})` : ''}`}
              </button>
            )}
            <button
              type="button"
              disabled={isImporting || isSyncing || !syncAvailable}
              onClick={handleSync}
              className="rounded-md bg-white/5 px-3 py-2 text-sm font-semibold text-text-secondary ring-1 ring-white/10 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
              title={t('Check for new files in previously imported courses')}
            >
              {isSyncing ? t('Checking...') : t('Check for updates')}
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
