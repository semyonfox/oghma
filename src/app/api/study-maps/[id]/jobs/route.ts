import { NextResponse } from "next/server";
import { requireAuth, requireValidId, withErrorHandler } from "@/lib/api-error";
import { enqueueStudyJobs } from "@/lib/study-map/jobs";
import { jobCreateSchema } from "@/lib/study-map/types";
import { readStudyBody, type StudyMapRouteContext } from "@/lib/study-map/api";

export const POST = withErrorHandler(
  async (request, { params }: StudyMapRouteContext) => {
    const user = await requireAuth();
    const queued = await enqueueStudyJobs(
      user.user_id,
      requireValidId((await params).id),
      await readStudyBody(request, jobCreateSchema),
    );
    return NextResponse.json({ queued }, { status: 202 });
  },
);
