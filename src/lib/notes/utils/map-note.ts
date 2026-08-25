export interface DatabaseNoteRow {
  note_id: string;
  title: string;
  content?: string;
  is_folder: boolean;
  s3_key: string | null;
  mime_type?: string | null;
  shared: number;
  pinned: number;
  created_at: Date | string | null;
  updated_at: Date | string | null;
}

export interface MappedNote {
  id: string;
  title: string;
  content?: string;
  isFolder: boolean;
  s3Key: string | null;
  mimeType: string | null | undefined;
  deleted: 0;
  shared: number;
  pinned: number;
  editorsize: null;
  createdAt?: string;
  updatedAt?: string;
}

/** Maps a database note row from snake_case to the API's note shape. */
export function mapNoteFromDB(dbRow: DatabaseNoteRow): MappedNote {
  return {
    id: dbRow.note_id,
    title: dbRow.title,
    content: dbRow.content,
    isFolder: dbRow.is_folder,
    s3Key: dbRow.s3_key,
    mimeType: dbRow.mime_type,
    deleted: 0,
    shared: dbRow.shared,
    pinned: dbRow.pinned,
    editorsize: null,
    createdAt: dbRow.created_at ? new Date(dbRow.created_at).toISOString() : undefined,
    updatedAt: dbRow.updated_at ? new Date(dbRow.updated_at).toISOString() : undefined,
  };
}
