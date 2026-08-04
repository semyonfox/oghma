// extracted from Notea (MIT License)

import { NOTE_DELETED, NOTE_PINNED, NOTE_SHARED } from "./meta";
import { parseInternalNoteHref } from "@/lib/notes/internal-links";

export interface NoteModel {
  id: string; // UUID v7 format
  title: string;
  /**
   * Parent ID (UUID v7)
   */
  pid?: string;
  content?: string;
  pic?: string;
  date?: string;
  createdAt?: string; // ISO 8601 timestamp
  updatedAt?: string; // ISO 8601 timestamp
  isFolder?: boolean; // true if this note is a folder/directory
  s3Key?: string; // S3 storage path for attached files/PDFs
  mimeType?: string; // Persisted attachment MIME type; independent of editable title
  deleted: NOTE_DELETED;
  shared: NOTE_SHARED;
  pinned: NOTE_PINNED;
}

/**
 * @deprecated Use parseInternalNoteHref for canonical `/notes/<uuid>` links.
 * This wrapper accepts legacy UUID versions as well as current v7 note IDs.
 */
export const isNoteLink = (str: string) => Boolean(parseInternalNoteHref(str));

// Strict UUID v7 pattern for newly generated note IDs.
export const NOTE_ID_REGEXP =
  "[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
