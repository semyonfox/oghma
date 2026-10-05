import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ApiError,
  requireAuth,
  requireValidId,
  withErrorHandler,
} from "@/lib/api-error";
import { autoConfigureStudyMap } from "@/lib/study-map/jobs";
import {
  addStudyMaterials,
  reviewStudyMaterial,
  removeStudyMaterial,
} from "@/lib/study-map/mutations";
import {
  materialsAddSchema,
  materialUpdateSchema,
} from "@/lib/study-map/types";
import { readStudyBody, type StudyMapRouteContext } from "@/lib/study-map/api";

export const POST = withErrorHandler(
  async (request, { params }: StudyMapRouteContext) => {
    const user = await requireAuth();
    const input = await readStudyBody(request, materialsAddSchema);
    const mapId = requireValidId((await params).id);
    await addStudyMaterials(user.user_id, mapId, input.noteIds);
    // new material can complete a module's setup, so it should not wait for the worker
    await autoConfigureStudyMap(user.user_id, mapId).catch((error: unknown) => {
      if (!(error instanceof ApiError)) throw error;
    });
    return NextResponse.json({ added: input.noteIds.length });
  },
);

export const PATCH = withErrorHandler(
  async (request, { params }: StudyMapRouteContext) => {
    const user = await requireAuth();
    await reviewStudyMaterial(
      user.user_id,
      requireValidId((await params).id),
      await readStudyBody(request, materialUpdateSchema),
    );
    return NextResponse.json({ saved: true });
  },
);

export const DELETE = withErrorHandler(
  async (request, { params }: StudyMapRouteContext) => {
    const user = await requireAuth();
    const input = await readStudyBody(request, z.object({ noteId: z.uuid() }));
    await removeStudyMaterial(
      user.user_id,
      requireValidId((await params).id),
      input.noteId,
    );
    return NextResponse.json({ removed: true });
  },
);
