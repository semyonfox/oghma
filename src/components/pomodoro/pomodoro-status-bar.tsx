"use client";

import { useEffect, useState } from "react";
import {
  PauseIcon,
  PlayIcon,
  ForwardIcon,
  XMarkIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import type { PomodoroPhase } from "@/lib/notes/state/pomodoro";
import useI18n from "@/lib/notes/hooks/use-i18n";

interface PomodoroStatusBarProps {
  phase: PomodoroPhase;
  paused: boolean;
  assignmentTitle: string | null;
  courseName: string | null;
  courseColor: string | null;
  secondsRemaining: number;
  totalSeconds: number;
  completedFocusSessions: number;
  totalSessions: number;
  totalMinutesLogged: number;
  tick: () => void;
  pause: () => void;
  resume: () => void;
  skip: () => void;
  stop: () => void;
}

export default function PomodoroStatusBar({
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
}: PomodoroStatusBarProps) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);

  const isBreak = phase === "short_break" || phase === "long_break";
  const isComplete = phase === "complete";
  const isFocus = phase === "focus";
  const isActive = isFocus || isBreak;

  // progress as percentage of elapsed time
  const progress =
    totalSeconds > 0
      ? Math.min(100, ((totalSeconds - secondsRemaining) / totalSeconds) * 100)
      : 0;

  // format countdown
  const countdown = `${Math.floor(secondsRemaining / 60)}:${String(secondsRemaining % 60).padStart(2, "0")}`;

  // animate in
  useEffect(() => {
    if (phase !== "idle") {
      requestAnimationFrame(() => setVisible(true));
    } else {
      requestAnimationFrame(() => setVisible(false));
    }
  }, [phase]);

  // tick interval
  useEffect(() => {
    if (phase === "idle" || phase === "complete" || paused) return;
    const interval = setInterval(() => tick(), 1000);
    return () => clearInterval(interval);
  }, [phase, paused, tick]);

  // auto-hide after completion
  useEffect(() => {
    if (isComplete) {
      let innerTimer: ReturnType<typeof setTimeout>;
      const outerTimer = setTimeout(() => {
        setVisible(false);
        innerTimer = setTimeout(stop, 300);
      }, 6000);
      return () => {
        clearTimeout(outerTimer);
        clearTimeout(innerTimer);
      };
    }
  }, [isComplete, stop]);

  if (phase === "idle") return null;

  // progress bar color
  const barColor = isFocus ? "bg-accent" : "bg-neutral-400";

  // status dot
  const dotColor = isFocus ? "bg-accent" : "bg-neutral-400";

  // build status text
  let statusText: React.ReactNode;
  if (isFocus) {
    statusText = (
      <span className="flex items-center gap-1.5 min-w-0 truncate">
        {assignmentTitle && (
          <span className="text-text-secondary truncate">
            {assignmentTitle}
          </span>
        )}
        {courseName && (
          <span className="flex shrink-0 items-center gap-1 rounded-radius-sm bg-accent-soft px-1.5 py-0.5 font-mono text-xs font-medium text-accent-soft-text">
            {courseColor && (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: courseColor }}
                aria-hidden="true"
              />
            )}
            {courseName}
          </span>
        )}
        {!assignmentTitle && !courseName && (
          <span className="text-text-tertiary">{t("Focus session")}</span>
        )}
      </span>
    );
  } else if (phase === "short_break") {
    statusText = <span className="text-text-tertiary">{t("Short break")}</span>;
  } else if (phase === "long_break") {
    statusText = <span className="text-text-tertiary">{t("Long break")}</span>;
  } else if (isComplete) {
    statusText = (
      <span className="text-success-700 dark:text-success-400">
        {t("{count}m logged", { count: totalMinutesLogged })}
      </span>
    );
  }

  return (
    <div
      aria-live="polite"
      data-focus-bar
      className={`fixed bottom-0 left-0 right-0 z-40 bg-background/95 pb-[var(--safe-bottom)] backdrop-blur-sm transition-transform duration-300 ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
    >
      {/* progress track */}
      <div className="h-0.5 w-full bg-subtle">
        <div
          className={`h-full ${isComplete ? "bg-success-500" : barColor} transition-all duration-700 ease-out`}
          style={{ width: `${isComplete ? 100 : progress}%` }}
        />
      </div>

      {/* info strip */}
      <div className="flex h-8 items-center justify-between px-4 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          {/* status dot or check icon */}
          {isComplete ? (
            <CheckCircleIcon className="w-3.5 h-3.5 text-success-700 dark:text-success-400 shrink-0" />
          ) : (
            <span
              className={`shrink-0 w-1.5 h-1.5 rounded-full ${dotColor} ${isFocus ? "animate-pulse" : ""}`}
            />
          )}
          {statusText}
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-3">
          {/* countdown */}
          {isActive && (
            <span className="font-mono tabular-nums text-text-tertiary">
              {countdown}
            </span>
          )}

          {/* session counter (focus only) */}
          {isFocus && (
            <span className="font-mono tabular-nums text-text-tertiary">
              {completedFocusSessions + 1}/{totalSessions}
            </span>
          )}

          {/* pause/resume button */}
          {isActive && (
            <button
              onClick={paused ? resume : pause}
              className="text-text-tertiary hover:text-text p-0.5"
              aria-label={paused ? t("Resume") : t("Pause")}
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
              className="text-text-tertiary hover:text-text p-0.5"
              aria-label={t("Skip")}
            >
              <ForwardIcon className="w-3.5 h-3.5" />
            </button>
          )}

          {/* close button */}
          <button
            onClick={() => {
              setVisible(false);
              setTimeout(stop, 300);
            }}
            className="text-text-tertiary hover:text-text p-0.5"
            aria-label={t("Close")}
          >
            <XMarkIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
