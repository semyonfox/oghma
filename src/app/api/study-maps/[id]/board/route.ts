import { NextResponse } from "next/server";
import { requireAuth, requireValidId, withErrorHandler } from "@/lib/api-error";
import { saveStudyBoard } from "@/lib/study-map/mutations";
import { boardUpdateSchema } from "@/lib/study-map/types";
import { readStudyBody, type StudyMapRouteContext } from "@/lib/study-map/api";

export const PUT = withErrorHandler(async (request, { params }: StudyMapRouteContext) => {
  const user = await requireAuth();
  const version = await saveStudyBoard(user.user_id, requireValidId((await params).id), await readStudyBody(request, boardUpdateSchema));
  return NextResponse.json({ version });
});
