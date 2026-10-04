import { NextResponse } from "next/server";
import { requireAuth, requireValidId, withErrorHandler } from "@/lib/api-error";
import { saveStudyPaper } from "@/lib/study-map/mutations";
import { paperUpdateSchema } from "@/lib/study-map/types";
import { readStudyBody, type StudyMapRouteContext } from "@/lib/study-map/api";

export const PUT = withErrorHandler<StudyMapRouteContext>(async (request, { params }) => {
  const user = await requireAuth();
  await saveStudyPaper(user.user_id, requireValidId((await params).id), await readStudyBody(request, paperUpdateSchema));
  return NextResponse.json({ saved: true });
});
