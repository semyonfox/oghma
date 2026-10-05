import { NextResponse } from "next/server";
import {
  ApiError,
  requireAuth,
  requireValidId,
  withErrorHandler,
} from "@/lib/api-error";
import { getStudyMapSnapshot } from "@/lib/study-map/repository";
import { updateStudyMap, deleteStudyMap } from "@/lib/study-map/mutations";
import { autoConfigureStudyMap } from "@/lib/study-map/jobs";
import { mapUpdateSchema } from "@/lib/study-map/types";
import { readStudyBody, type StudyMapRouteContext } from "@/lib/study-map/api";

export const GET = withErrorHandler(
  async (_request, { params }: StudyMapRouteContext) => {
    const user = await requireAuth();
    return NextResponse.json(
      await getStudyMapSnapshot(
        user.user_id,
        requireValidId((await params).id),
      ),
    );
  },
);

export const PATCH = withErrorHandler(
  async (request, { params }: StudyMapRouteContext) => {
    const user = await requireAuth();
    const id = requireValidId((await params).id);
    await updateStudyMap(
      user.user_id,
      id,
      await readStudyBody(request, mapUpdateSchema),
    );
    // a newly chosen syllabus or folder should start working without another click
    await autoConfigureStudyMap(user.user_id, id).catch((error: unknown) => {
      if (!(error instanceof ApiError)) throw error;
    });
    return NextResponse.json({ saved: true });
  },
);

export const DELETE = withErrorHandler(
  async (_request, { params }: StudyMapRouteContext) => {
    const user = await requireAuth();
    await deleteStudyMap(user.user_id, requireValidId((await params).id));
    return NextResponse.json({ deleted: true });
  },
);
