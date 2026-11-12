import { ApiError } from "@/lib/api-errors";

// controls new content imports and canvas tools, while deadlines keep syncing
// previously imported notes remain available to retrieval and quizzes
export function canvasContentEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.CANVAS_CONTENT_IMPORT === "on";
}

export function assertCanvasContentEnabled(): void {
  if (!canvasContentEnabled()) {
    throw new ApiError(403, "Canvas file import is paused. Deadlines still sync.");
  }
}

// while paused, canvas worker messages are acked without running. their rows
// stay queued or pending in the database, and the recovery steps pick them up
// again once the switch is back on
export function unlessCanvasPaused<A extends unknown[]>(
  work: (...args: A) => Promise<unknown>,
): (...args: A) => Promise<void> {
  return async (...args) => {
    if (canvasContentEnabled()) await work(...args);
  };
}
