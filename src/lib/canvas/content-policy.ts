import { ApiError } from "@/lib/api-errors";

// lecturers own their course material, so canvas content (files, pages, the
// syllabus, assignment briefs, chat's canvas tools) stays out of notes and ai
// unless this is turned on. deadlines and the calendar keep syncing either way
export function canvasContentEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.CANVAS_CONTENT_IMPORT === "on";
}

export function assertCanvasContentEnabled(): void {
  if (!canvasContentEnabled()) {
    throw new ApiError(403, "Canvas file import is paused. Deadlines still sync.");
  }
}
