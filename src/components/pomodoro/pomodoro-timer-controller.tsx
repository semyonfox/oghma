'use client'

import { useEffect, useRef } from "react";
import usePomodoroStore, { restorePomodoro } from '@/lib/notes/state/pomodoro'
import { triggerCelebration } from "@/lib/celebration";
import PomodoroStatusBar from "./pomodoro-status-bar";

/**
 * Wrapper component that manages Pomodoro timer globally.
 * Thin client boundary that reads timer state and renders the status bar.
 */
export default function PomodoroTimerController() {
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

  useEffect(() => {
    void restorePomodoro();
    // declared after the celebration effect: session storage hydrates
    // synchronously and restored progress isn't a new pomodoro
    prevCompletedRef.current = usePomodoroStore.getState().completedFocusSessions;
    // background tabs throttle intervals, so catch up as soon as the tab is back
    const catchUp = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', catchUp);
    return () => document.removeEventListener('visibilitychange', catchUp);
  }, [tick]);

  if (phase === 'idle') return null

  return (
    <PomodoroStatusBar
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
