import { NextResponse } from "next/server";
import {
  ApiError,
  requireAuth,
  requireValidId,
  withErrorHandler,
} from "@/lib/api-error";
import { checkRateLimit } from "@/lib/rate-limiter";
import { BodyTooLargeError, readBoundedBody } from "@/lib/http/bounded-body";
import {
  examPaperImportSchema,
  MAX_EXAM_IMPORT_BYTES,
} from "@/lib/study-map/paper-import-format";
import { importExamPaper } from "@/lib/study-map/import-paper";
import type { StudyMapRouteContext } from "@/lib/study-map/api";

export const runtime = "nodejs";

export const POST = withErrorHandler(
  async (request, { params }: StudyMapRouteContext) => {
    const user = await requireAuth();
    const mapId = requireValidId((await params).id);
    const limited = await checkRateLimit("upload", user.user_id);
    if (limited) return limited;
    if (
      request.headers.get("content-type")?.split(";")[0].trim() !==
      "application/json"
    )
      throw new ApiError(415, "Choose an OghmaNotes exam import file");
    let body: unknown;
    try {
      body = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          await readBoundedBody(request, MAX_EXAM_IMPORT_BYTES),
        ),
      );
    } catch (error) {
      if (error instanceof BodyTooLargeError)
        throw new ApiError(413, "Exam import file is too large");
      throw new ApiError(400, "Invalid exam import file");
    }
    const result = examPaperImportSchema.safeParse(body);
    if (!result.success)
      throw new ApiError(
        400,
        result.error.issues[0]?.message ?? "Invalid exam import file",
      );
    return NextResponse.json(
      await importExamPaper(user.user_id, mapId, result.data),
    );
  },
);
