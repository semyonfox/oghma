import { NextResponse } from "next/server";
import { requireAuth, requireValidId, withErrorHandler } from "@/lib/api-error";
import { saveStudyTopics } from "@/lib/study-map/mutations";
import { topicsUpdateSchema } from "@/lib/study-map/types";
import { readStudyBody, type StudyMapRouteContext } from "@/lib/study-map/api";

export const PUT = withErrorHandler(
  async (request, { params }: StudyMapRouteContext) => {
    const user = await requireAuth();
    await saveStudyTopics(
      user.user_id,
      requireValidId((await params).id),
      await readStudyBody(request, topicsUpdateSchema),
    );
    return NextResponse.json({ saved: true });
  },
);
