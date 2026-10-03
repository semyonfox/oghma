import { NextResponse } from "next/server";
import { ApiError, requireAuth, withErrorHandler } from "@/lib/api-error";
import { searchStudyMaterials, studySearchFiltersSchema } from "@/lib/study-map/search";
import { checkRateLimit } from "@/lib/rateLimiter";

export const GET = withErrorHandler(async (request) => {
  const user = await requireAuth();
  const limited = await checkRateLimit("global-search", user.user_id);
  if (limited) return limited;
  const params = new URL(request.url).searchParams;
  const input: Record<string, string | number> = {};
  for (const [key, value] of params) input[key] = key === "limit" || key === "offset" ? Number(value) : value;
  const parsed = studySearchFiltersSchema.safeParse(input);
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid search filters");
  return NextResponse.json(await searchStudyMaterials(user.user_id, parsed.data));
});
