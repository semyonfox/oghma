import { NextResponse } from "next/server";
import { requireAuth, requireValidId, withErrorHandler } from "@/lib/api-error";
import { syncStudyMaterials } from "@/lib/study-map/mutations";
import type { StudyMapRouteContext } from "@/lib/study-map/api";

export const POST = withErrorHandler<StudyMapRouteContext>(async (_request, { params }) => {
  const user = await requireAuth();
  await syncStudyMaterials(user.user_id, requireValidId((await params).id));
  return NextResponse.json({ refreshed: true });
});
