import type { CanvasRecord } from "./client";

export interface RawExportClient {
  getPath(path: string): Promise<{
    data: unknown;
    forbidden: boolean;
    error?: string;
  }>;
  getPaginatedPath(path: string): Promise<{
    data: unknown;
    forbidden: boolean;
    error?: string;
  }>;
}

export interface RawExportDownloadClient {
  downloadFile(url: string): Promise<{
    buffer: Buffer | null;
    forbidden: boolean;
    error?: string;
  }>;
}

export interface DownloadableFile extends CanvasRecord {
  url: string;
}

export interface DownloadEntry {
  path: string;
  file: DownloadableFile;
}

export interface TextEntry {
  path: string;
  content: string;
}

export interface CourseSummary {
  id: string;
  title: string;
  sources: Record<string, number>;
}

interface RawExportManifest {
  generated_at: string;
  export_type: string;
  courses: CourseSummary[];
  course_discovery?: unknown;
}

export interface CanvasRawExportArchive {
  downloads: DownloadEntry[];
  textEntries: TextEntry[];
  skipped: string[];
  manifest: RawExportManifest;
}

export interface RawExportState {
  seenPaths: Set<string>;
  seenFileIds: Set<string>;
  seenGroupIds: Set<string>;
  skipped: string[];
}

export interface RawExportOptions {
  skipped?: string[];
  courseDiscovery?: unknown;
}

export interface CourseExportContext {
  client: RawExportClient;
  courseId: string;
  coursePath: string;
  archive: CanvasRawExportArchive;
  state: RawExportState;
  summary: CourseSummary;
}

export type QueryValue =
  string | number | boolean | readonly unknown[] | null | undefined;
