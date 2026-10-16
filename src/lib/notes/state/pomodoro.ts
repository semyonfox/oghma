import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

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

  // a running phase ends at a wall-clock instant, so throttled background tabs
  // and reloads can't drift it. null while paused or idle
  phaseEndsAt: number | null;
  // length of the current phase, for the progress bar
  totalSeconds: number;
  // display value while running, source of truth while paused
  secondsRemaining: number;

  // session tracking
  sessionIndex: number;
  totalSessions: number;
  completedFocusSessions: number;
  totalMinutesLogged: number;

  // current pomodoro server-side session id
  activeSessionId: string | null;
  // bumped for every focus phase so a slow start request can't attach its
  // session to a later phase
  focusRun: number;

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
  completePhase: () => void;
}

const FOCUS_MINUTES = 25;
const FOCUS_DURATION = FOCUS_MINUTES * 60;
const SHORT_BREAK = 5 * 60;
const LONG_BREAK = 15 * 60;
const SESSIONS_PER_LONG_BREAK = 4;
const DEFAULT_SESSIONS = 6;
// a phase that ran out this long before the page came back was abandoned
const ABANDONED_AFTER_MS = 10 * 60_000;

function secondsUntil(endsAt: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

function readSessionId(data: unknown): string | null {
  if (!data || typeof data !== "object" || !("id" in data)) return null;
  return typeof data.id === "string" ? data.id : null;
}

function endServerSession(id: string, completed: boolean): void {
  // keepalive lets the request finish when the tab is closing
  fetch("/api/pomodoro", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, completed }),
    keepalive: true,
  }).catch(() => {});
}

const IDLE_STATE = {
  phase: "idle",
  paused: false,
  assignmentId: null,
  assignmentTitle: null,
  courseName: null,
  courseColor: null,
  timeBlockId: null,
  phaseEndsAt: null,
  activeSessionId: null,
} satisfies Partial<PomodoroState>;

const usePomodoroStore = create<PomodoroState>()(
  persist(
    (set, get) => {
      // the server session is bookkeeping only, so the timer runs without it
      const openServerSession = async (run: number): Promise<void> => {
        const { assignmentId, timeBlockId } = get();
        let sessionId: string | null = null;
        try {
          const res = await fetch("/api/pomodoro", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              assignment_id: assignmentId,
              time_block_id: timeBlockId,
              duration_mins: FOCUS_MINUTES,
              type: "focus",
            }),
          });
          if (res.ok) sessionId = readSessionId(await res.json());
        } catch {
          // keep the local timer running
        }
        if (!sessionId) return;

        const current = get();
        if (
          current.phase === "focus" &&
          current.focusRun === run &&
          current.activeSessionId === null
        ) {
          set({ activeSessionId: sessionId });
        } else {
          endServerSession(sessionId, false);
        }
      };

      // a skipped focus phase isn't a completed pomodoro, so it logs nothing
      const advance = (completedNaturally: boolean): void => {
        const state = get();

        if (state.phase === "focus") {
          if (state.activeSessionId) {
            endServerSession(state.activeSessionId, completedNaturally);
          }
          const completedFocusSessions =
            state.completedFocusSessions + (completedNaturally ? 1 : 0);
          const totalMinutesLogged =
            state.totalMinutesLogged + (completedNaturally ? FOCUS_MINUTES : 0);
          const nextIndex = state.sessionIndex + 1;

          if (nextIndex >= state.totalSessions) {
            set({
              phase: "complete",
              paused: false,
              completedFocusSessions,
              totalMinutesLogged,
              secondsRemaining: 0,
              phaseEndsAt: null,
              activeSessionId: null,
            });
            return;
          }

          const isLongBreak = nextIndex % SESSIONS_PER_LONG_BREAK === 0;
          const breakDuration = isLongBreak ? LONG_BREAK : SHORT_BREAK;
          set({
            phase: isLongBreak ? "long_break" : "short_break",
            paused: false,
            completedFocusSessions,
            totalMinutesLogged,
            sessionIndex: nextIndex,
            phaseEndsAt: Date.now() + breakDuration * 1000,
            totalSeconds: breakDuration,
            secondsRemaining: breakDuration,
            activeSessionId: null,
          });
          return;
        }

        if (state.phase === "short_break" || state.phase === "long_break") {
          const run = state.focusRun + 1;
          set({
            phase: "focus",
            paused: false,
            phaseEndsAt: Date.now() + FOCUS_DURATION * 1000,
            totalSeconds: FOCUS_DURATION,
            secondsRemaining: FOCUS_DURATION,
            activeSessionId: null,
            focusRun: run,
          });
          void openServerSession(run);
        }
      };

      return {
        ...IDLE_STATE,
        totalSeconds: FOCUS_DURATION,
        secondsRemaining: FOCUS_DURATION,
        sessionIndex: 0,
        totalSessions: DEFAULT_SESSIONS,
        completedFocusSessions: 0,
        totalMinutesLogged: 0,
        focusRun: 0,

        start: async (opts) => {
          const previous = get();
          if (previous.activeSessionId) {
            endServerSession(previous.activeSessionId, false);
          }

          const run = previous.focusRun + 1;
          // state flips first so the UI responds and repeat clicks see a running timer
          set({
            phase: "focus",
            paused: false,
            assignmentId: opts.assignmentId ?? null,
            assignmentTitle: opts.assignmentTitle ?? null,
            courseName: opts.courseName ?? null,
            courseColor: opts.courseColor ?? null,
            timeBlockId: opts.timeBlockId ?? null,
            phaseEndsAt: Date.now() + FOCUS_DURATION * 1000,
            totalSeconds: FOCUS_DURATION,
            secondsRemaining: FOCUS_DURATION,
            sessionIndex: 0,
            totalSessions: opts.sessions ?? DEFAULT_SESSIONS,
            completedFocusSessions: 0,
            totalMinutesLogged: 0,
            activeSessionId: null,
            focusRun: run,
          });
          await openServerSession(run);
        },

        tick: () => {
          const { phase, paused, phaseEndsAt, secondsRemaining } = get();
          if (phase === "idle" || phase === "complete" || paused || !phaseEndsAt)
            return;

          const remaining = secondsUntil(phaseEndsAt);
          if (remaining <= 0) {
            advance(true);
          } else if (remaining !== secondsRemaining) {
            set({ secondsRemaining: remaining });
          }
        },

        pause: () => {
          const { phaseEndsAt, paused } = get();
          if (paused || !phaseEndsAt) return;
          set({
            paused: true,
            phaseEndsAt: null,
            secondsRemaining: secondsUntil(phaseEndsAt),
          });
        },

        resume: () => {
          const { paused, secondsRemaining } = get();
          if (!paused) return;
          set({
            paused: false,
            phaseEndsAt: Date.now() + secondsRemaining * 1000,
          });
        },

        skip: () => advance(false),

        stop: () => {
          const { activeSessionId } = get();
          if (activeSessionId) endServerSession(activeSessionId, false);
          set(IDLE_STATE);
        },

        completePhase: () => advance(true),
      };
    },
    {
      name: "oghma-pomodoro",
      // per tab, so a reload resumes the timer but two tabs never run (and
      // log) the same pomodoro
      storage: createJSONStorage(() => sessionStorage),
      // the controller rehydrates after mount to keep SSR markup stable
      skipHydration: true,
      partialize: (state) => ({
        phase: state.phase,
        paused: state.paused,
        assignmentId: state.assignmentId,
        assignmentTitle: state.assignmentTitle,
        courseName: state.courseName,
        courseColor: state.courseColor,
        timeBlockId: state.timeBlockId,
        phaseEndsAt: state.phaseEndsAt,
        totalSeconds: state.totalSeconds,
        secondsRemaining: state.secondsRemaining,
        sessionIndex: state.sessionIndex,
        totalSessions: state.totalSessions,
        completedFocusSessions: state.completedFocusSessions,
        totalMinutesLogged: state.totalMinutesLogged,
        activeSessionId: state.activeSessionId,
        focusRun: state.focusRun,
      }),
    },
  ),
);

/**
 * Restores a timer saved in this tab and catches it up to the wall clock.
 * A phase that ended long before the page came back is treated as abandoned.
 */
export async function restorePomodoro(): Promise<void> {
  await usePomodoroStore.persist.rehydrate();
  const { phase, paused, phaseEndsAt, stop, tick } = usePomodoroStore.getState();
  const running = phase !== "idle" && phase !== "complete" && !paused;
  if (running && (!phaseEndsAt || phaseEndsAt < Date.now() - ABANDONED_AFTER_MS)) {
    stop();
    return;
  }
  tick();
}

export default usePomodoroStore;
