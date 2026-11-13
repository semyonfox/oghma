import { NextResponse } from "next/server";
import { requireAuth, requireValidId, withErrorHandler, type RouteParamsContext } from "@/lib/api-error";
import { checkRateLimit } from "@/lib/rate-limiter";
import { runSectionAction } from "@/lib/notes/section-actions";

export const POST = withErrorHandler(async (_request, { params }: RouteParamsContext<{ id: string; key: string }>) => {
  const user = await requireAuth();
  const limited = await checkRateLimit("chat", user.user_id);
  if (limited) return limited;
  const { id, key } = await params;
  const result = await runSectionAction(user.user_id, requireValidId(id, "note ID"), key, "summary");
  return NextResponse.json(result, { status: 201 });
});
