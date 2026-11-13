import { NextResponse } from "next/server";
import { ApiError, requireAuth, requireValidId, withErrorHandler, type RouteParamsContext } from "@/lib/api-error";
import { checkRateLimit } from "@/lib/rate-limiter";
import { runSectionAction } from "@/lib/notes/section-actions";
import { decodeSectionKey } from "@/lib/notes/sections";

export const POST = withErrorHandler(async (_request, { params }: RouteParamsContext<{ id: string; key: string }>) => {
  const user = await requireAuth();
  const limited = await checkRateLimit("chat", user.user_id);
  if (limited) return limited;
  const { id, key } = await params;
  const sectionKey = decodeSectionKey(key);
  if (!sectionKey) throw new ApiError(404, "Section not found");
  const result = await runSectionAction(user.user_id, requireValidId(id, "note ID"), sectionKey, "cards");
  return NextResponse.json(result, { status: 201 });
});
