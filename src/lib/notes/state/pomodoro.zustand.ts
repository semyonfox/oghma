import { create } from "zustand";

export type PomodoroPhase =
  | "idle"
  | "focus"
  | "short_break"
  | "long_break"
  | "complete";

interface PomodoroState {
  phase: PomodoroPhase;
  paused: boolean;
  assignmentId: string | null;
  assignmentTitle: string | null;
  courseName: string | null;
  courseColor: string | null;
  timeBlockId: string | null;

  // timing — use startedAt + elapsed for accuracy across background tabs
  startedAt: number | null;
  totalSeconds: number;
  secondsRemaining: number;

  // session tracking
  sessionIndex: number;
  totalSessions: number;
  completedFocusSessions: number;
  totalMinutesLogged: number;

  // current pomodoro server-side session id
  activeSessionId: string | null;

  // actions
  start: (opts: {
    assignmentId?: string;
    assignmentTitle?: string;
    courseName?: string;
    courseColor?: string;
    timeBlockId?: string;
    sessions?: number;
  }) => Promise<void>;
  tick: () => void;
  pause: () => void;
  resume: () => void;
  skip: () => void;
  stop: () => void;
  completePhase: () => Promise<void>;
}

const FOCUS_DURATION = 25 * 60;
const SHORT_BREAK = 5 * 60;
const LONG_BREAK = 15 * 60;

const usePomodoroStore = create<PomodoroState>()((set, get) => ({
  phase: "idle",
  paused: false,
  assignmentId: null,
  assignmentTitle: null,
  courseName: null,
  courseColor: null,
  timeBlockId: null,
  startedAt: null,
  totalSeconds: FOCUS_DURATION,
  secondsRemaining: FOCUS_DURATION,
  sessionIndex: 0,
  totalSessions: 6,
  completedFocusSessions: 0,
  totalMinutesLogged: 0,
  activeSessionId: null,

  start: async (opts) => {
    const sessions = opts.sessions ?? 6;

    // create server-side session
    let sessionId = null;
    try {
      const res = await fetch("/api/pomodoro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignment_id: opts.assignmentId,
          time_block_id: opts.timeBlockId,
          duration_mins: 25,
          type: "focus",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        sessionId = data.id;
      }
    } catch {
      // continue without server session
    }

    set({
      phase: "focus",
      paused: false,
      assignmentId: opts.assignmentId ?? null,
      assignmentTitle: opts.assignmentTitle ?? null,
      courseName: opts.courseName ?? null,
      courseColor: opts.courseColor ?? null,
      timeBlockId: opts.timeBlockId ?? null,
      startedAt: Date.now(),
      totalSeconds: FOCUS_DURATION,
      secondsRemaining: FOCUS_DURATION,
      sessionIndex: 0,
      totalSessions: sessions,
      completedFocusSessions: 0,
      totalMinutesLogged: 0,
      activeSessionId: sessionId,
    });
  },

  tick: () => {
    const { phase, paused, startedAt, totalSeconds } = get();
    if (phase === "idle" || phase === "complete" || paused || !startedAt)
      return;

    // compute from wall clock for accuracy
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    const remaining = Math.max(0, totalSeconds - elapsed);

    if (remaining <= 0) {
      get().completePhase();
    } else {
      set({ secondsRemaining: remaining });
    }
  },

  pause: () => {
    const {
      startedAt: _startedAt,
      totalSeconds: _totalSeconds,
      secondsRemaining: _secondsRemaining,
    } = get();
    set({ paused: true });
  },

  resume: () => {
    const { secondsRemaining } = get();
    // reset startedAt so remaining time is preserved
    set({
      paused: false,
      startedAt: Date.now(),
      totalSeconds: secondsRemaining,
    });
  },

  skip: () => {
    get().completePhase();
  },

  stop: () => {
    // end current server session without completing
    const { activeSessionId } = get();
    if (activeSessionId) {
      fetch("/api/pomodoro", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activeSessionId, completed: false }),
      }).catch(() => {});
    }

    set({
      phase: "idle",
      paused: false,
      assignmentId: null,
      assignmentTitle: null,
      courseName: null,
      courseColor: null,
      timeBlockId: null,
      startedAt: null,
      activeSessionId: null,
    });
  },

  completePhase: async () => {
    const state = get();
    const {
      phase,
      sessionIndex,
      totalSessions,
      completedFocusSessions,
      activeSessionId,
      assignmentId,
    } = state;

    if (phase === "focus") {
      // complete the server-side session
      if (activeSessionId) {
        try {
          await fetch("/api/pomodoro", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: activeSessionId, completed: true }),
          });
        } catch {
          // silent
        }
      }

      const newCompleted = completedFocusSessions + 1;
      const newMinutes = state.totalMinutesLogged + 25;
      const nextIndex = sessionIndex + 1;

      // all sessions done
      if (nextIndex >= totalSessions) {
        set({
          phase: "complete",
          completedFocusSessions: newCompleted,
          totalMinutesLogged: newMinutes,
          secondsRemaining: 0,
          startedAt: null,
          activeSessionId: null,
        });
        return;
      }

      // transition to break
      const isLongBreak = newCompleted % 4 === 0;
      const breakDuration = isLongBreak ? LONG_BREAK : SHORT_BREAK;

      set({
        phase: isLongBreak ? "long_break" : "short_break",
        completedFocusSessions: newCompleted,
        totalMinutesLogged: newMinutes,
        sessionIndex: nextIndex,
        startedAt: Date.now(),
        totalSeconds: breakDuration,
        secondsRemaining: breakDuration,
        activeSessionId: null,
      });
    } else if (phase === "short_break" || phase === "long_break") {
      // transition back to focus — create new server session
      let sessionId = null;
      try {
        const res = await fetch("/api/pomodoro", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assignment_id: assignmentId,
            time_block_id: state.timeBlockId,
            duration_mins: 25,
            type: "focus",
          }),
        });
        if (res.ok) {
          const data = await res.json();
          sessionId = data.id;
        }
      } catch {
        // continue
      }

      set({
        phase: "focus",
        startedAt: Date.now(),
        totalSeconds: FOCUS_DURATION,
        secondsRemaining: FOCUS_DURATION,
        activeSessionId: sessionId,
      });
    }
  },
}));

export default usePomodoroStore;
