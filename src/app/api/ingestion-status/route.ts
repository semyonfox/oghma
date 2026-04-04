// ingestion-status API route
// returns the extraction status for a given note so the frontend can poll
import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { withErrorHandler, tracedError } from "@/lib/api-error";
import { isValidUUID } from "@/lib/uuid-validation";
import sql from "@/database/pgsql.js";

export const GET = withErrorHandler(async (request: NextRequest) => {
    const session = await validateSession();
    if (!session) return tracedError("Unauthorized", 401);

    const noteId = request.nextUrl.searchParams.get("noteId");
    if (!noteId || !isValidUUID(noteId)) return tracedError("Invalid noteId", 400);

    // only return jobs belonging to this user
    let job;
    try {
        [job] = await sql`
        SELECT status, chunks_stored, error, created_at, updated_at
        FROM app.ingestion_jobs
        WHERE note_id = ${noteId}::uuid
          AND user_id = ${session.user_id}::uuid
        ORDER BY created_at DESC
        LIMIT 1
    `;
    } catch {
        return NextResponse.json({ status: "none" });
    }

    if (!job) {
        return NextResponse.json({ status: "none" });
    }

    return NextResponse.json({
        status: job.status,           // pending | processing | done | failed
        chunksStored: job.chunks_stored ?? 0,
        error: job.error ?? null,
        createdAt: job.created_at,
        updatedAt: job.updated_at,
    });
});
