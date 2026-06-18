import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { withErrorHandler, tracedError } from "@/lib/api-error";
import sql from "@/database/pgsql.js";
import { getChunkVector, searchChunkVectors } from "@/lib/qdrant";

// distance threshold — lower = more similar
const MAX_DISTANCE = 0.45;

export const GET = withErrorHandler(
  async (
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const user = await validateSession();
    if (!user) return tracedError("Unauthorized", 401);

    const { id: questionId } = await params;
    const userId = user.user_id;

    const [question] = await sql`
      SELECT chunk_id FROM app.quiz_questions
      WHERE id = ${questionId}::uuid AND user_id = ${userId}::uuid
    `;
    if (!question) return tracedError("Not found", 404);

    // use the chunk's own stored vector to find nearest neighbours in Qdrant;
    // no embedding API call needed.
    const vector = await getChunkVector(question.chunk_id);
    if (!vector) return NextResponse.json({ related: [] });

    const hits = await searchChunkVectors({
      userId,
      vector,
      limit: 4,
      maxDistance: MAX_DISTANCE,
      excludeChunkIds: [question.chunk_id],
    });
    const chunkIds = hits.map((hit) => hit.chunkId).slice(0, 3);
    const related =
      chunkIds.length === 0
        ? []
        : await sql`
            SELECT c.id, c.text, n.title
            FROM app.chunks c
            JOIN app.notes n ON n.note_id = c.document_id
            WHERE c.user_id = ${userId}::uuid
              AND c.id = ANY(${chunkIds}::uuid[])
              AND n.deleted_at IS NULL
          `;
    const byChunkId = new Map<string, any>(
      related.map((row: any) => [row.id, row]),
    );

    return NextResponse.json({
      related: chunkIds.flatMap((id) => {
        const row = byChunkId.get(id);
        return row ? [{ text: row.text, title: row.title }] : [];
      }),
    });
  },
);
