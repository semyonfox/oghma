import "server-only";

import {
  getQuizDashboardCourses,
  getQuizDashboardSummary,
} from "@/lib/quiz/dashboard";
import type {
  QuizDashboardCourse,
  QuizDashboardSummary,
} from "@/lib/quiz/types";

export interface QuizDashboardInitialData {
  dashboard: QuizDashboardSummary;
  courses: QuizDashboardCourse[];
}

// the server render has no browser zone, so "reviewed today" starts in UTC
// until the client refreshes with its own zone
export async function getQuizDashboardData(
  userId: string,
): Promise<QuizDashboardInitialData> {
  const [dashboard, courses] = await Promise.all([
    getQuizDashboardSummary(userId),
    getQuizDashboardCourses(userId),
  ]);
  return { dashboard, courses };
}
