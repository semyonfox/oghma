import { NextResponse } from "next/server";
import { requireAuth, requireValidId, withErrorHandler } from "@/lib/api-error";
import { getStudyMapSnapshot } from "@/lib/study-map/repository";
import { updateStudyMap, deleteStudyMap } from "@/lib/study-map/mutations";
import { mapUpdateSchema } from "@/lib/study-map/types";
import { readStudyBody, type StudyMapRouteContext } from "@/lib/study-map/api";

export const GET = withErrorHandler<StudyMapRouteContext>(async (_request, { params }) => {
  const user = await requireAuth();
  return NextResponse.json(await getStudyMapSnapshot(user.user_id, requireValidId((await params).id)));
});

export const PATCH = withErrorHandler<StudyMapRouteContext>(async (request, { params }) => {
  const user = await requireAuth();
  const id = requireValidId((await params).id);
  await updateStudyMap(user.user_id, id, await readStudyBody(request, mapUpdateSchema));
  return NextResponse.json({ saved: true });
});

export const DELETE = withErrorHandler<StudyMapRouteContext>(async (_request, { params }) => {
  const user = await requireAuth();
  await deleteStudyMap(user.user_id, requireValidId((await params).id));
  return NextResponse.json({ deleted: true });
});
