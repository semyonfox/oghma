// extract API route — document ingestion pipeline
// The HTTP POST handler remains for manual/admin triggers only
import { runExtraction } from "@/lib/ingestion/run-extraction";
import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import sql from "@/database/pgsql";
import { withErrorHandler } from "@/lib/api-error";
import { ApiError } from "@/lib/api-error";
import { checkRateLimit } from "@/lib/rateLimiter";

function isAllowedUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const h = parsed.hostname.toLowerCase();
  if (h === "169.254.169.254" || h === "metadata.google.internal") return false;
  return !/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|localhost|::1|\[::1\])/.test(
    h,
  );
}

// HTTP handler — kept for manual/admin use, not called by normal upload flow
export const POST = withErrorHandler(async (request: NextRequest) => {
  const session = await validateSession();
  if (!session) throw new ApiError(401, "Unauthorized");

  const userId = session.user_id;
  const limited = await checkRateLimit("extract", userId);
  if (limited) return limited;

  const { url, documentId } = await request.json();
  if (!url || !documentId)
    throw new ApiError(400, "url and documentId are required");
  if (!isAllowedUrl(url)) throw new ApiError(400, "Invalid or disallowed URL");

  const s3Key = new URL(url).pathname.replace(/^\//, "");
  // only extract files recorded for this note, not arbitrary objects in its storage path
  const [ownedNote] = await sql`
    SELECT s3_key FROM app.notes
    WHERE note_id = ${documentId}::uuid
      AND user_id = ${userId}::uuid
      AND deleted_at IS NULL
    LIMIT 1
  `;
  if (!ownedNote) throw new ApiError(404, "Note not found");

  if (ownedNote.s3_key !== s3Key) {
    const [attachment] = await sql`
      SELECT 1 FROM app.attachments
      WHERE note_id = ${documentId}::uuid
        AND user_id = ${userId}::uuid
        AND s3_key = ${s3Key}
      LIMIT 1
    `;
    if (!attachment) throw new ApiError(400, "Invalid file URL");
  }
  const mimeType = "application/pdf";

  const result = await runExtraction(documentId, userId, s3Key, mimeType);
  return NextResponse.json({ success: true, ...result });
});
