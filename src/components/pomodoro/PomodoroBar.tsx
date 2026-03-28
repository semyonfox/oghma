'use client'

import { useEffect, useState } from 'react'
import { PauseIcon, PlayIcon, ForwardIcon, XMarkIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import type { PomodoroPhase } from '@/lib/notes/state/pomodoro.zustand'

interface PomodoroBarProps {
  phase: PomodoroPhase
  paused: boolean
  assignmentTitle: string | null
  courseName: string | null
  courseColor: string | null
  secondsRemaining: number
  totalSeconds: number
  completedFocusSessions: number
  totalSessions: number
  totalMinutesLogged: number
  tick: () => void
  pause: () => void
  resume: () => void
  skip: () => void
  stop: () => void
}

export default function PomodoroBar({
  phase,
  paused,
  assignmentTitle,
  courseName,
  courseColor,
  secondsRemaining,
  totalSeconds,
  completedFocusSessions,
  totalSessions,
  totalMinutesLogged,
  tick,
  pause,
  resume,
  skip,
  stop,
}: PomodoroBarProps) {
  const [visible, setVisible] = useState(false)

  const isBreak = phase === 'short_break' || phase === 'long_break'
  const isComplete = phase === 'complete'
  const isFocus = phase === 'focus'
  const isActive = isFocus || isBreak

  // progress as percentage of elapsed time
  const progress = totalSeconds > 0
    ? Math.min(100, ((totalSeconds - secondsRemaining) / totalSeconds) * 100)
    : 0

  // format countdown
  const countdown = `${Math.floor(secondsRemaining / 60)}:${String(secondsRemaining % 60).padStart(2, '0')}`

  // animate in
  /* eslint-disable react-hooks/set-state-in-effect -- rAF-driven animation toggle */
  useEffect(() => {
    if (phase !== 'idle') {
      requestAnimationFrame(() => setVisible(true))
    } else {
      requestAnimationFrame(() => setVisible(false))
    }
  }, [phase])
  /* eslint-enable react-hooks/set-state-in-effect */

  // tick interval
  useEffect(() => {
    if (phase === 'idle' || phase === 'complete' || paused) return
    const interval = setInterval(() => tick(), 1000)
    return () => clearInterval(interval)
  }, [phase, paused, tick])

  // auto-hide after completion (same pattern as CanvasImportToast)
  useEffect(() => {
    if (isComplete) {
      let innerTimer: ReturnType<typeof setTimeout>
      const outerTimer = setTimeout(() => {
        setVisible(false)
        innerTimer = setTimeout(stop, 300)
      }, 6000)
      return () => {
        clearTimeout(outerTimer)
        clearTimeout(innerTimer)
      }
    }
  }, [isComplete, stop])

  if (phase === 'idle') return null

  // progress bar color
  const barColor = isFocus ? 'bg-primary-500' : 'bg-green-500'

  // status dot
  const dotColor = isFocus ? 'bg-primary-400' : 'bg-green-400'

  // build status text
  let statusText: React.ReactNode
  if (isFocus) {
    statusText = (
      <span className="flex items-center gap-1.5 min-w-0 truncate">
        {assignmentTitle && (
          <span className="text-text-secondary truncate">{assignmentTitle}</span>
        )}
        {courseName && (
          <span
            className="shrink-0 rounded px-1 py-0.5 text-[10px] font-medium"
            style={{
              backgroundColor: courseColor ? `${courseColor}20` : 'rgba(139,92,246,0.12)',
              color: courseColor || '#a78bfa',
            }}
          >
            {courseName}
          </span>
        )}
        {!assignmentTitle && !courseName && (
          <span className="text-text-tertiary">Focus session</span>
        )}
      </span>
    )
  } else if (phase === 'short_break') {
    statusText = <span className="text-text-tertiary">Short break</span>
  } else if (phase === 'long_break') {
    statusText = <span className="text-text-tertiary">Long break</span>
  } else if (isComplete) {
    statusText = <span className="text-green-400">{totalMinutesLogged}m logged</span>
  }

  return (
    <div
      aria-live="polite"
      className={`fixed bottom-0 left-0 right-0 z-40 transition-transform duration-300 ${
        visible ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      {/* progress track */}
      <div className="h-0.5 w-full bg-white/5">
        <div
          className={`h-full ${isComplete ? 'bg-green-500' : barColor} transition-all duration-700 ease-out`}
          style={{ width: `${isComplete ? 100 : progress}%` }}
        />
      </div>

      {/* info strip */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-gray-900/95 backdrop-blur-sm border-t border-white/5 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          {/* status dot or check icon */}
          {isComplete ? (
            <CheckCircleIcon className="w-3.5 h-3.5 text-green-400 shrink-0" />
          ) : (
            <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${dotColor} ${isFocus ? 'animate-pulse' : ''}`} />
          )}
          {statusText}
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-3">
          {/* countdown */}
          {isActive && (
            <span className="tabular-nums text-text-tertiary/60">{countdown}</span>
          )}

          {/* session counter (focus only) */}
          {isFocus && (
            <span className="text-text-tertiary/40">
              {completedFocusSessions + 1}/{totalSessions}
            </span>
          )}

          {/* pause/resume button */}
          {isActive && (
            <button
              onClick={paused ? resume : pause}
              className="text-text-tertiary hover:text-text-secondary p-0.5"
              aria-label={paused ? 'Resume' : 'Pause'}
            >
              {paused ? (
                <PlayIcon className="w-3.5 h-3.5" />
              ) : (
                <PauseIcon className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          {/* skip button */}
          {isActive && (
            <button
              onClick={skip}
              className="text-text-tertiary hover:text-text-secondary p-0.5"
              aria-label="Skip"
            >
              <ForwardIcon className="w-3.5 h-3.5" />
            </button>
          )}

          {/* close button */}
          <button
            onClick={() => { setVisible(false); setTimeout(stop, 300) }}
            className="text-text-tertiary hover:text-text-secondary p-0.5"
            aria-label="Close"
          >
            <XMarkIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
