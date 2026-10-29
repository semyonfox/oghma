// how long classification has left, worked out from this map's own pace.
// measuring real completions already covers the shared queue and the model's
// speed, so nothing about either needs modelling here

export const MIN_COMPLETIONS = 3;
export const QUEUED_AFTER_MS = 5 * 60_000;
const SMOOTHING = 0.3;
const RISE_THRESHOLD = 1.25;

export interface ClassificationProgress {
  total: number;
  classified: number;
  failed: number;
  /** remaining files that have no text to classify yet */
  waitingForText: number;
  activeJobs: number;
  /** the worker picks up files once their text arrives, but only for maps that sort automatically */
  autoClassify: boolean;
  /** when the oldest active job was queued, null when nothing is queued */
  runStartedAt: string | null;
  /** classified_at of this run's completions */
  completions: string[];
}

export type EtaStep = "under-minute" | 2 | 5 | 10 | 15 | 30 | "under-hour" | "over-hour";

export type EtaLabel =
  | { kind: "estimating" }
  | { kind: "queued" }
  | { kind: "reading" }
  | { kind: "time"; step: EtaStep };

/** files the classifier still has to do. failures stay failed until retried */
export function remainingFiles(progress: ClassificationProgress): number {
  return Math.max(0, progress.total - progress.classified - progress.failed);
}

/** exponentially smoothed gap between completions: new = 0.3 × latest + 0.7 × previous */
export function smoothedGapMs(completions: readonly string[]): number | null {
  const times = completions
    .map((value) => Date.parse(value))
    .filter((time) => Number.isFinite(time))
    .sort((left, right) => left - right);
  let smoothed: number | null = null;
  for (let index = 1; index < times.length; index += 1) {
    const gap = times[index] - times[index - 1];
    smoothed = smoothed === null ? gap : SMOOTHING * gap + (1 - SMOOTHING) * smoothed;
  }
  return smoothed;
}

/** round up to a step people can read at a glance */
export function etaStep(ms: number): EtaStep {
  const minutes = ms / 60_000;
  if (minutes < 1) return "under-minute";
  for (const step of [2, 5, 10, 15, 30] as const) if (minutes <= step) return step;
  return minutes <= 60 ? "under-hour" : "over-hour";
}

/**
 * Only let the shown estimate rise when two polls in a row agree it's at
 * least 25% higher, so it doesn't bounce. Falling is immediate.
 */
export interface EtaMemory {
  shownMs: number | null;
  riseSeen: boolean;
}

export const initialEtaMemory: EtaMemory = { shownMs: null, riseSeen: false };

export function stabiliseEta(memory: EtaMemory, rawMs: number): EtaMemory {
  if (memory.shownMs === null || rawMs <= memory.shownMs) {
    return { shownMs: rawMs, riseSeen: false };
  }
  if (rawMs < memory.shownMs * RISE_THRESHOLD) return { shownMs: memory.shownMs, riseSeen: false };
  return memory.riseSeen
    ? { shownMs: rawMs, riseSeen: false }
    : { shownMs: memory.shownMs, riseSeen: true };
}

/**
 * One poll's label and the memory to carry into the next. The raw estimate
 * is files left × smoothed gap.
 */
export function estimateClassification(
  progress: ClassificationProgress,
  memory: EtaMemory,
  now: number,
): { label: EtaLabel; memory: EtaMemory } {
  const remaining = remainingFiles(progress);
  if (remaining > 0 && progress.waitingForText >= remaining) {
    return { label: { kind: "reading" }, memory };
  }
  const lastActivity = Math.max(
    ...progress.completions.map((value) => Date.parse(value)).filter(Number.isFinite),
    progress.runStartedAt ? Date.parse(progress.runStartedAt) : Number.NEGATIVE_INFINITY,
  );
  // the queue is shared and oldest first, so other imports can be ahead of this one
  if (Number.isFinite(lastActivity) && now - lastActivity >= QUEUED_AFTER_MS) {
    return { label: { kind: "queued" }, memory };
  }
  const gap = smoothedGapMs(progress.completions);
  if (progress.completions.length < MIN_COMPLETIONS || gap === null) {
    return { label: { kind: "estimating" }, memory };
  }
  const next = stabiliseEta(memory, (remaining - progress.waitingForText) * gap);
  return { label: { kind: "time", step: etaStep(next.shownMs ?? 0) }, memory: next };
}

/** the dial shows while files are being sorted, and goes once they're done */
export function showsProgress(progress: ClassificationProgress): boolean {
  return (
    remainingFiles(progress) > 0 &&
    (progress.activeJobs > 0 || (progress.autoClassify && progress.waitingForText > 0))
  );
}

/** poll while a job can finish, or while text is on its way for a map that sorts itself */
export function shouldPollProgress(progress: ClassificationProgress): boolean {
  return showsProgress(progress);
}
