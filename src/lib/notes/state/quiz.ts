import { create } from "zustand";

interface QuizState {
  // dashboard
  dashboardLoading: boolean;
  dashboardData: {
    dueCount: number;
    totalCards: number;
    mastery: number;
    reviewedToday: number;
    weekAccuracy: number;
    currentStreak: number;
    longestStreak: number;
  } | null;
  courses: {
    courseId: number;
    courseName: string;
    totalCards: number;
    dueCount: number;
    mastery: number;
  }[];

  // active session
  sessionId: string | null;
  cardIds: string[];
  currentIndex: number;
  currentQuestion: any | null;
  sessionProgress: { answered: number; total: number; correct: number };
  fatigueWarning: boolean;
  sessionStartTime: number;
  sessionEndTime: number;
  sessionCompleted: boolean;

  // actions
  setDashboard: (data: QuizState["dashboardData"]) => void;
  setCourses: (courses: QuizState["courses"]) => void;
  setDashboardLoading: (loading: boolean) => void;
  startSession: (sessionId: string, cardIds: string[], question: any) => void;
  setCurrentQuestion: (question: any) => void;
  advanceQuestion: (
    nextQuestion: any,
    progress: QuizState["sessionProgress"],
  ) => void;
  setFatigueWarning: (warning: boolean) => void;
  completeSession: () => void;
  endSession: () => void;
}

const useQuizStore = create<QuizState>((set) => ({
  dashboardLoading: false,
  dashboardData: null,
  courses: [],
  sessionId: null,
  cardIds: [],
  currentIndex: 0,
  currentQuestion: null,
  sessionProgress: { answered: 0, total: 0, correct: 0 },
  fatigueWarning: false,
  sessionStartTime: 0,
  sessionEndTime: 0,
  sessionCompleted: false,

  setDashboard: (data) => set({ dashboardData: data }),
  setCourses: (courses) => set({ courses }),
  setDashboardLoading: (loading) => set({ dashboardLoading: loading }),
  startSession: (sessionId, cardIds, question) =>
    set({
      sessionId,
      cardIds,
      currentIndex: 0,
      currentQuestion: question,
      sessionProgress: { answered: 0, total: cardIds.length, correct: 0 },
      fatigueWarning: false,
      sessionStartTime: Date.now(),
      sessionEndTime: 0,
      sessionCompleted: false,
    }),
  setCurrentQuestion: (question) => set({ currentQuestion: question }),
  advanceQuestion: (nextQuestion, progress) =>
    set((state) => ({
      currentIndex: state.currentIndex + 1,
      currentQuestion: nextQuestion,
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
