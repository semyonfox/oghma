import { create } from "zustand";
import type {
  QuizSessionProgress,
  QuizSessionQuestion,
} from "@/lib/quiz/types";

interface QuizState {
  // active session
  sessionId: string | null;
  cardIds: string[];
  currentIndex: number;
  currentQuestion: QuizSessionQuestion | null;
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
    currentIndex?: number,
    correctCount?: number,
  ) => void;
  setCurrentQuestion: (question: QuizSessionQuestion) => void;
  advanceQuestion: (
    nextQuestion: QuizSessionQuestion,
    progress: QuizSessionProgress,
  ) => void;
  setFatigueWarning: (warning: boolean) => void;
  completeSession: () => void;
  endSession: () => void;
}

const useQuizStore = create<QuizState>((set) => ({
  sessionId: null,
  cardIds: [],
  currentIndex: 0,
  currentQuestion: null,
  sessionProgress: { answered: 0, total: 0, correct: 0 },
  fatigueWarning: false,
  sessionStartTime: 0,
  sessionEndTime: 0,
  sessionCompleted: false,

  startSession: (sessionId, cardIds, question, currentIndex = 0, correctCount = 0) =>
    set({
      sessionId,
      cardIds,
      currentIndex,
      currentQuestion: question,
      sessionProgress: { answered: currentIndex, total: cardIds.length, correct: correctCount },
      fatigueWarning: false,
      sessionStartTime: Date.now(),
      sessionEndTime: 0,
      sessionCompleted: false,
    }),
  setCurrentQuestion: (question) => set({ currentQuestion: question }),
  advanceQuestion: (nextQuestion, progress) =>
    set((state) => ({
      currentQuestion: nextQuestion,
      currentIndex: state.currentIndex + 1,
      sessionProgress: progress,
    })),
  setFatigueWarning: (warning) => set({ fatigueWarning: warning }),
  completeSession: () =>
    set({ sessionCompleted: true, sessionEndTime: Date.now() }),
  endSession: () =>
    set({
      sessionId: null,
      cardIds: [],
      currentIndex: 0,
      currentQuestion: null,
      sessionProgress: { answered: 0, total: 0, correct: 0 },
      fatigueWarning: false,
      sessionStartTime: 0,
      sessionEndTime: 0,
      sessionCompleted: false,
    }),
}));

export default useQuizStore;
