import { create } from "zustand";
import type {
  QuizSessionProgress,
  QuizSessionQuestion,
} from "@/lib/quiz/types";

interface SessionResume {
  currentIndex: number;
  answered: number;
  correct: number;
}

interface QuizState {
  // active session
  sessionId: string | null;
  cardIds: string[];
  // position of the current card in cardIds; skips move it without a review
  currentIndex: number;
  currentQuestion: QuizSessionQuestion | null;
  // reviews actually recorded by the server, used for the summary
  sessionProgress: QuizSessionProgress;
  fatigueWarning: boolean;
  sessionStartTime: number;
  sessionEndTime: number;
  sessionCompleted: boolean;

  // actions
  startSession: (
    sessionId: string,
    cardIds: string[],
    question: QuizSessionQuestion | null,
    resume?: SessionResume,
  ) => void;
  showQuestion: (question: QuizSessionQuestion) => void;
  setProgress: (progress: QuizSessionProgress) => void;
  setFatigueWarning: (warning: boolean) => void;
  completeSession: () => void;
  endSession: () => void;
}

const EMPTY_SESSION = {
  sessionId: null,
  cardIds: [],
  currentIndex: 0,
  currentQuestion: null,
  sessionProgress: { answered: 0, total: 0, correct: 0 },
  fatigueWarning: false,
  sessionStartTime: 0,
  sessionEndTime: 0,
  sessionCompleted: false,
} satisfies Partial<QuizState>;

const useQuizStore = create<QuizState>((set) => ({
  ...EMPTY_SESSION,

  startSession: (sessionId, cardIds, question, resume) =>
    set({
      sessionId,
      cardIds,
      currentIndex: resume?.currentIndex ?? 0,
      currentQuestion: question,
      sessionProgress: {
        answered: resume?.answered ?? 0,
        total: cardIds.length,
        correct: resume?.correct ?? 0,
      },
      fatigueWarning: false,
      sessionStartTime: Date.now(),
      sessionEndTime: 0,
      sessionCompleted: false,
    }),
  showQuestion: (question) =>
    set((state) => {
      const index = state.cardIds.indexOf(question.card_id);
      return {
        currentQuestion: question,
        currentIndex: index >= 0 ? index : state.currentIndex,
      };
    }),
  setProgress: (progress) => set({ sessionProgress: progress }),
  setFatigueWarning: (warning) => set({ fatigueWarning: warning }),
  completeSession: () =>
    set({ sessionCompleted: true, sessionEndTime: Date.now() }),
  endSession: () => set(EMPTY_SESSION),
}));

export default useQuizStore;
