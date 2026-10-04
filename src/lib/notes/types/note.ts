// extracted from Notea (MIT License)

import { NOTE_DELETED, NOTE_PINNED, NOTE_SHARED } from "./meta";

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
