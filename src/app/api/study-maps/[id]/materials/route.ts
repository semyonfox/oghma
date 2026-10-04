import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, requireValidId, withErrorHandler } from "@/lib/api-error";
import { addStudyMaterials, reviewStudyMaterial, removeStudyMaterial } from "@/lib/study-map/mutations";
import { materialsAddSchema, materialUpdateSchema } from "@/lib/study-map/types";
import { readStudyBody, type StudyMapRouteContext } from "@/lib/study-map/api";

export const POST = withErrorHandler<StudyMapRouteContext>(async (request, { params }) => {
  const user = await requireAuth();
  const input = await readStudyBody(request, materialsAddSchema);
  await addStudyMaterials(user.user_id, requireValidId((await params).id), input.noteIds);
  return NextResponse.json({ added: input.noteIds.length });
});

export const PATCH = withErrorHandler<StudyMapRouteContext>(async (request, { params }) => {
  const user = await requireAuth();
  await reviewStudyMaterial(user.user_id, requireValidId((await params).id), await readStudyBody(request, materialUpdateSchema));
  return NextResponse.json({ saved: true });
});

export const DELETE = withErrorHandler<StudyMapRouteContext>(async (request, { params }) => {
  const user = await requireAuth();
  const input = await readStudyBody(request, z.object({ noteId: z.uuid() }));
  await removeStudyMaterial(user.user_id, requireValidId((await params).id), input.noteId);
  return NextResponse.json({ removed: true });
});
