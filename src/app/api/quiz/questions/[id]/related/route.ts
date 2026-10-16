import { NextResponse } from "next/server";
import {
  requireAuth,
  requireValidId,
  type RouteParamsContext,
  withErrorHandler,
  tracedError,
} from "@/lib/api-error";
import sql from "@/database/pgsql";
import logger from "@/lib/logger";
import { getChunkVector, searchChunkVectors } from "@/lib/qdrant";

// distance threshold — lower = more similar
const MAX_DISTANCE = 0.45;

interface QuestionChunkRow {
  chunk_id: string;
}

interface RelatedChunkRow {
  id: string;
  text: string;
  title: string | null;
}

export const GET = withErrorHandler(
  async (
    _request,
    { params }: RouteParamsContext<{ id: string }>,
  ) => {
    const user = await requireAuth();

    const questionId = requireValidId((await params).id, "question ID");
    const userId = user.user_id;

    const [question] = await sql<QuestionChunkRow[]>`
      SELECT chunk_id FROM app.quiz_questions
      WHERE id = ${questionId}::uuid AND user_id = ${userId}::uuid
    `;
    if (!question) return tracedError("Not found", 404);

    // use the chunk's own stored vector to find nearest neighbours in Qdrant;
    // no embedding API call needed.
    // related notes are an optional extra under the feedback, so a vector
    // store outage degrades to an empty list instead of an error
    let chunkIds: string[];
    try {
      const vector = await getChunkVector(question.chunk_id);
      if (!vector) return NextResponse.json({ related: [] });

      const hits = await searchChunkVectors({
        userId,
        vector,
        limit: 4,
        maxDistance: MAX_DISTANCE,
        excludeChunkIds: [question.chunk_id],
      });
      chunkIds = hits.map((hit) => hit.chunkId).slice(0, 3);
    } catch (error) {
      logger.warn("quiz related notes unavailable", {
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json({ related: [] });
    }
    const related =
      chunkIds.length === 0
        ? []
        : await sql<RelatedChunkRow[]>`
            SELECT c.id, c.text, n.title
            FROM app.chunks c
            JOIN app.notes n ON n.note_id = c.document_id
            WHERE c.user_id = ${userId}::uuid
              AND c.id = ANY(${chunkIds}::uuid[])
              AND n.deleted_at IS NULL
          `;
    const byChunkId = new Map<string, RelatedChunkRow>(
      related.map((row) => [row.id, row]),
    );

    return NextResponse.json({
      related: chunkIds.flatMap((id) => {
        const row = byChunkId.get(id);
        return row ? [{ text: row.text, title: row.title }] : [];
      }),
    });
  },
);
