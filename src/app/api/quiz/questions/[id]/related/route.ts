import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { withErrorHandler, tracedError } from "@/lib/api-error";
import sql from "@/database/pgsql.js";

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

    // use the chunk's own stored embedding to find nearest neighbours —
    // no embedding API call needed
    const related = await sql`
      SELECT c.text, n.title,
        (e.embedding <=> (
          SELECT embedding FROM app.embeddings WHERE chunk_id = ${question.chunk_id}::uuid LIMIT 1
        )) AS distance
      FROM app.embeddings e
      JOIN app.chunks c ON c.id = e.chunk_id
      JOIN app.notes n ON n.note_id = c.document_id
      WHERE c.user_id = ${userId}::uuid
        AND c.id != ${question.chunk_id}::uuid
        AND (e.embedding <=> (
          SELECT embedding FROM app.embeddings WHERE chunk_id = ${question.chunk_id}::uuid LIMIT 1
        )) < ${MAX_DISTANCE}
      ORDER BY distance
      LIMIT 3
    `;

    return NextResponse.json({
      related: related.map((r: any) => ({ text: r.text, title: r.title })),
    });
  },
);
