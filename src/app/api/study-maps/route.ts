import { NextResponse } from "next/server";
import {
  ApiError,
  requireAuth,
  requireValidId,
  withErrorHandler,
} from "@/lib/api-error";
import { listStudyMaps, getNoteStudyMaps } from "@/lib/study-map/repository";
import { createStudyMap } from "@/lib/study-map/mutations";
import { autoConfigureStudyMap } from "@/lib/study-map/jobs";
import { mapCreateSchema } from "@/lib/study-map/types";
import { readStudyBody } from "@/lib/study-map/api";

export const GET = withErrorHandler(async (request) => {
  const user = await requireAuth();
  const noteId = new URL(request.url).searchParams.get("noteId");
  if (noteId)
    return NextResponse.json(
      await getNoteStudyMaps(user.user_id, requireValidId(noteId, "note ID")),
    );
  return NextResponse.json(await listStudyMaps(user.user_id));
});

export const POST = withErrorHandler(async (request) => {
  const user = await requireAuth();
  const input = await readStudyBody(request, mapCreateSchema);
  const mapId = await createStudyMap(user.user_id, input);
  let warning: string | null = null;
  try {
    await autoConfigureStudyMap(user.user_id, mapId);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    warning = error.userMessage;
  }
  return NextResponse.json({ mapId, warning }, { status: 201 });
});
