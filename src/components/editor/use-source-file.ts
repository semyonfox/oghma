import { useEffect, useState } from "react";
import type { FileSpec } from "@/lib/notes/state/layout";
import { buildFileSpec } from "@/lib/notes/utils/file-spec";

function parseSourceFile(value: unknown): FileSpec | null {
  if (!value || typeof value !== "object" || !("sourceFile" in value)) return null;
  const source = value.sourceFile;
  if (
    !source ||
    typeof source !== "object" ||
    !("id" in source) ||
    !("title" in source) ||
    !("s3Key" in source) ||
    typeof source.id !== "string" ||
    typeof source.title !== "string" ||
    typeof source.s3Key !== "string"
  ) {
    return null;
  }
  const mimeType =
    "mimeType" in source && typeof source.mimeType === "string"
      ? source.mimeType
      : null;
  return buildFileSpec({
    id: source.id,
    title: source.title,
    s3Key: source.s3Key,
    mimeType,
  });
}

/**
 * The original file (usually a PDF) an extracted note was made from, or null.
 * Failures resolve to null: the button is a shortcut, not something to retry.
 */
export function useSourceFile(noteId: string | undefined): FileSpec | null {
  const [source, setSource] = useState<{ noteId: string; file: FileSpec | null } | null>(null);

  useEffect(() => {
    if (!noteId) return;
    const controller = new AbortController();
    fetch(`/api/notes/${encodeURIComponent(noteId)}?fields=sourceFile`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) =>
        response.ok ? parseSourceFile(await response.json()) : null,
      )
      .catch(() => null)
      .then((file) => {
        if (!controller.signal.aborted) setSource({ noteId, file });
      });
    return () => controller.abort();
  }, [noteId]);

  return source && source.noteId === noteId ? source.file : null;
}
