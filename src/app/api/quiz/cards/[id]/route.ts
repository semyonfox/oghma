import { NextResponse } from "next/server";
import {
  requireAuth,
  requireValidId,
  type RouteParamsContext,
  withErrorHandler,
  tracedError,
} from "@/lib/api-error";
import { loadSessionQuestion } from "@/lib/quiz/session-question";

export const GET = withErrorHandler(
  async (
    _request,
    { params }: RouteParamsContext<{ id: string }>,
  ) => {
    const user = await requireAuth();

    const cardId = requireValidId((await params).id, "card ID");
    const question = await loadSessionQuestion(user.user_id, cardId);
    if (!question) return tracedError("Card not found", 404);

    return NextResponse.json({ question });
  },
);
