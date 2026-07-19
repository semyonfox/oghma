import { redirect } from "next/navigation";
import { validateSession } from "@/lib/auth";
import QuizPageClient from "./quiz-page-client";
import { getQuizDashboardData } from "./server-data";

export default async function QuizPage() {
  const user = await validateSession();
  if (!user) redirect("/login?next=/quiz");

  const initialData = await getQuizDashboardData(user.user_id);

  return <QuizPageClient initialData={initialData} />;
}
