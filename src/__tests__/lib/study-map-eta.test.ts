import { describe, expect, it } from "vitest";
import {
  estimateClassification,
  etaStep,
  initialEtaMemory,
  shouldPollProgress,
  showsProgress,
  smoothedGapMs,
  stabiliseEta,
  type ClassificationProgress,
} from "@/lib/study-map/eta";

const start = Date.parse("2026-10-29T10:00:00Z");
const at = (seconds: number) => new Date(start + seconds * 1000).toISOString();

function progress(overrides: Partial<ClassificationProgress> = {}): ClassificationProgress {
  return {
    total: 61,
    classified: 34,
    failed: 0,
    waitingForText: 0,
    activeJobs: 27,
    autoClassify: true,
    runStartedAt: at(0),
    completions: [at(60), at(80), at(100), at(120)],
    ...overrides,
  };
}

describe("smoothedGapMs", () => {
  it("weights the latest gap at 0.3 against the previous average", () => {
    // gaps of 10s, 20s, 40s: 10 -> 0.3*20+0.7*10 = 13 -> 0.3*40+0.7*13 = 21.1
    expect(smoothedGapMs([at(0), at(10), at(30), at(70)])).toBeCloseTo(21_100);
  });

  it("orders completions by time whatever order they arrive in", () => {
    expect(smoothedGapMs([at(70), at(0), at(30), at(10)])).toBeCloseTo(21_100);
  });

  it("has nothing to say about a single completion", () => {
    expect(smoothedGapMs([at(5)])).toBeNull();
  });
});

describe("etaStep", () => {
  it.each([
    [30_000, "under-minute"],
    [61_000, 2],
    [2 * 60_000, 2],
    [4 * 60_000, 5],
    [6 * 60_000, 10],
    [14 * 60_000, 15],
    [29 * 60_000, 30],
    [45 * 60_000, "under-hour"],
    [90 * 60_000, "over-hour"],
  ] as const)("rounds %d ms up to %s", (ms, step) => {
    expect(etaStep(ms)).toBe(step);
  });
});

describe("stabiliseEta", () => {
  it("drops straight away", () => {
    expect(stabiliseEta({ shownMs: 600_000, riseSeen: false }, 300_000)).toEqual({
      shownMs: 300_000,
      riseSeen: false,
    });
  });

  it("only rises after two polls agree it is at least 25% higher", () => {
    const first = stabiliseEta({ shownMs: 300_000, riseSeen: false }, 400_000);
    expect(first).toEqual({ shownMs: 300_000, riseSeen: true });
    expect(stabiliseEta(first, 390_000)).toEqual({ shownMs: 390_000, riseSeen: false });
  });

  it("ignores a rise that a second poll doesn't confirm", () => {
    const first = stabiliseEta({ shownMs: 300_000, riseSeen: false }, 400_000);
    expect(stabiliseEta(first, 320_000)).toEqual({ shownMs: 300_000, riseSeen: false });
  });

  it("ignores small rises entirely", () => {
    expect(stabiliseEta({ shownMs: 300_000, riseSeen: true }, 360_000)).toEqual({
      shownMs: 300_000,
      riseSeen: false,
    });
  });
});

describe("estimateClassification", () => {
  it("says estimating until three files have finished", () => {
    const { label } = estimateClassification(
      progress({ completions: [at(60), at(80)] }),
      initialEtaMemory,
      start + 90_000,
    );
    expect(label).toEqual({ kind: "estimating" });
  });

  it("multiplies files left by the smoothed gap", () => {
    // 20s gaps, 27 files left: 540s is 9 minutes, which rounds up to 10
    const { label, memory } = estimateClassification(progress(), initialEtaMemory, start + 130_000);
    expect(memory.shownMs).toBe(540_000);
    expect(label).toEqual({ kind: "time", step: 10 });
  });

  it("says queued when nothing has finished for five minutes", () => {
    const { label } = estimateClassification(progress(), initialEtaMemory, start + 120_000 + 5 * 60_000);
    expect(label).toEqual({ kind: "queued" });
  });

  it("says queued when a run has waited five minutes without a first completion", () => {
    const { label } = estimateClassification(
      progress({ completions: [] }),
      initialEtaMemory,
      start + 6 * 60_000,
    );
    expect(label).toEqual({ kind: "queued" });
  });

  it("says reading PDFs when every remaining file is waiting for its text", () => {
    const { label } = estimateClassification(
      progress({ classified: 50, waitingForText: 11 }),
      initialEtaMemory,
      start + 130_000,
    );
    expect(label).toEqual({ kind: "reading" });
  });

  it("leaves failed files out of the estimate", () => {
    const { memory } = estimateClassification(
      progress({ failed: 7 }),
      initialEtaMemory,
      start + 130_000,
    );
    expect(memory.shownMs).toBe(20 * 20_000);
  });
});

describe("showsProgress", () => {
  it("shows while jobs run and goes once every file is done", () => {
    expect(showsProgress(progress())).toBe(true);
    expect(showsProgress(progress({ classified: 61, activeJobs: 0 }))).toBe(false);
  });

  it("stays hidden for files no job will pick up", () => {
    expect(showsProgress(progress({ activeJobs: 0, autoClassify: false, waitingForText: 3 }))).toBe(false);
    expect(showsProgress(progress({ activeJobs: 0, autoClassify: true, waitingForText: 3 }))).toBe(true);
  });

  it("counts failures as finished for the dial", () => {
    expect(showsProgress(progress({ classified: 59, failed: 2, activeJobs: 0 }))).toBe(false);
  });
});

describe("shouldPollProgress", () => {
  it("keeps polling while a self-sorting map waits for PDF text", () => {
    expect(shouldPollProgress(progress({ activeJobs: 0, waitingForText: 5 }))).toBe(true);
  });

  it("stops when nothing can finish", () => {
    expect(shouldPollProgress(progress({ activeJobs: 0, waitingForText: 5, autoClassify: false }))).toBe(false);
    expect(shouldPollProgress(progress({ activeJobs: 0, classified: 61 }))).toBe(false);
  });
});
