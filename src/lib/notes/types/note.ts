// extracted from Notea (MIT License)

import { NOTE_DELETED, NOTE_PINNED, NOTE_SHARED } from "./meta";

/** A folder that only holds one PDF and the Markdown extracted from it. */
export interface DocumentBundle {
  pdfId: string;
  noteId: string | null;
}

/** one study-map topic on a file, as the tree marks it */
export interface TopicMark {
  mapId: string;
  topicId: string;
  name: string;
  /** position in the map's topic list, which is also where its colour comes from */
  topicIndex: number;
  /** the core topic. at most one per file per map */
  main: boolean;
  /** waiting for review: a classifier suggestion or a correction gone stale */
  suggested: boolean;
}

export type CanvasCourseStatus = "current" | "past" | "pending" | "inaccessible";

/** finished-course facts for a top-level folder */
export interface CourseState {
  /** null when this isn't a canvas course, or canvas hasn't said yet */
  canvasStatus: CanvasCourseStatus | null;
  isCanvasCourse: boolean;
  /** true marks it finished, false keeps it active, null follows canvas */
  override: boolean | null;
  /** canvas academic year as stored on the folder, like "2526" */
  academicYear: string | null;
}

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
  bundle?: DocumentBundle;
  topics?: TopicMark[];
  course?: CourseState;
  deleted: NOTE_DELETED;
  shared: NOTE_SHARED;
  pinned: NOTE_PINNED;
}
