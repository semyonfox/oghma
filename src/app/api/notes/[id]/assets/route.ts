import { NextRequest, NextResponse } from "next/server";
import sql from "@/database/pgsql.js";
import {
  requireAuth,
  requireValidId,
  tracedError,
  withErrorHandler,
} from "@/lib/api-error";
import { markerAssetKey, sanitizeMarkerAssetName } from "@/lib/marker-output";
import { getStorageProvider } from "@/lib/storage/init";

function dirname(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

export const GET = withErrorHandler(
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const session = await requireAuth();
    const { id } = await params;
    const noteId = requireValidId(id, "note ID");

    const assetName = sanitizeMarkerAssetName(
      request.nextUrl.searchParams.get("name") ?? "",
    );
    if (!assetName) return tracedError("Invalid asset name", 400);

    const noteRows = await sql`
      SELECT note_id, s3_key
      FROM app.notes
      WHERE note_id = ${noteId}::uuid
        AND user_id = ${session.user_id}::uuid
        AND deleted_at IS NULL
      LIMIT 1
    `;

    const note = noteRows[0] as
      | { note_id: string; s3_key: string | null }
      | undefined;
    if (!note) return tracedError("Note not found", 404);

    const storage = getStorageProvider();

    // First check the canonical Marker image location.
    const markerKey = markerAssetKey(session.user_id, noteId, assetName);
    if (await storage.hasObject(markerKey)) {
      const signedUrl = await storage.getSignUrl(markerKey, 300);
      return NextResponse.redirect(signedUrl, {
        status: 307,
        headers: { "Cache-Control": "private, max-age=60" },
      });
    }

    // Fallback for previously ingested assets stored as note attachments or
    // directly under note-scoped S3 paths.
    const attachmentRows = await sql`
      SELECT s3_key
      FROM app.attachments
      WHERE note_id = ${noteId}::uuid
        AND user_id = ${session.user_id}::uuid
        AND filename = ${assetName}
      ORDER BY created_at DESC
      LIMIT 1
    `;

    let resolvedKey: string | null = null;
    if (attachmentRows.length > 0 && attachmentRows[0]?.s3_key) {
      resolvedKey = attachmentRows[0].s3_key as string;
    } else {
      const candidates = new Set<string>([
        `notes/${noteId}/${assetName}`,
        `notes/${noteId}/assets/${assetName}`,
      ]);

      if (note.s3_key) {
        const baseDir = dirname(note.s3_key);
        if (baseDir) {
          candidates.add(`${baseDir}/${assetName}`);
          candidates.add(`${baseDir}/assets/${assetName}`);
        }
      }

      for (const key of candidates) {
        if (await storage.hasObject(key)) {
          resolvedKey = key;
          break;
        }
      }
    }

    if (!resolvedKey) return tracedError("Asset not found", 404);

    const signedUrl = await storage.getSignUrl(resolvedKey, 300);
    return NextResponse.redirect(signedUrl, {
      status: 307,
      headers: { "Cache-Control": "private, max-age=60" },
    });
  },
);
