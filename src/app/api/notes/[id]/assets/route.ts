import { NextRequest, NextResponse } from "next/server";
import sql from "@/database/pgsql.js";
import {
  requireAuth,
  requireValidId,
  tracedError,
  withErrorHandler,
} from "@/lib/api-error";
import { getStorageProvider } from "@/lib/storage/init";
import { markerAssetKey, sanitizeMarkerAssetName } from "@/lib/marker-output";

export const GET = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const session = await requireAuth();
    const { id } = await params;
    const noteId = requireValidId(id, "note ID");

    const assetName = sanitizeMarkerAssetName(
      request.nextUrl.searchParams.get("name") ?? "",
    );
    if (!assetName) return tracedError("Invalid asset name", 400);

    const [owned] = await sql`
      SELECT 1
      FROM app.notes
      WHERE note_id = ${noteId}::uuid
        AND user_id = ${session.user_id}::uuid
        AND deleted = 0
        AND deleted_at IS NULL
      LIMIT 1
    `;
    if (!owned) return tracedError("Note not found", 404);

    const storage = getStorageProvider();
    const key = markerAssetKey(session.user_id, noteId, assetName);
    const exists = await storage.hasObject(key);
    if (!exists) return tracedError("Asset not found", 404);

    const signedUrl = await storage.getSignUrl(key, 300);
    return NextResponse.redirect(signedUrl, { status: 307 });
  },
);
