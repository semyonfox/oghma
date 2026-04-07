'use client'

import { useEffect, useRef } from "react";
import usePomodoroStore from '@/lib/notes/state/pomodoro.zustand'
import { triggerCelebration } from "@/lib/celebration";
import PomodoroBar from './pomodoro/PomodoroBar'

/**
 * Wrapper component that manages Pomodoro timer globally.
 * Mirrors the CanvasIntegration pattern -- thin client boundary
 * that reads Zustand state and renders the bottom bar.
 */
export default function PomodoroIntegration() {
  const {
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
  } = usePomodoroStore()
  const prevCompletedRef = useRef(completedFocusSessions);

  useEffect(() => {
    if (completedFocusSessions > prevCompletedRef.current) {
      void triggerCelebration("pomodoro");
    }
    prevCompletedRef.current = completedFocusSessions;
  }, [completedFocusSessions]);

  if (phase === 'idle') return null

  return (
    <PomodoroBar
      phase={phase}
      paused={paused}
      assignmentTitle={assignmentTitle}
      courseName={courseName}
      courseColor={courseColor}
      secondsRemaining={secondsRemaining}
      totalSeconds={totalSeconds}
      completedFocusSessions={completedFocusSessions}
      totalSessions={totalSessions}
      totalMinutesLogged={totalMinutesLogged}
      tick={tick}
      pause={pause}
      resume={resume}
      skip={skip}
      stop={stop}
    />
  )
}
