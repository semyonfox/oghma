import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Vast Marker offline plan", () => {
  it("passes the tracked fail-closed guardrails", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        resolve(process.cwd(), "scripts/vast-marker-plan.ts"),
      ],
      { encoding: "utf8" },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Offline validation: PASS");
    expect(result.stdout).toContain("BLOCKED AS INTENDED");
  });

  it("renders activation flags the pinned Vast CLI accepts", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        resolve(process.cwd(), "scripts/vast-marker-plan.ts"),
        "--template-hash",
        "abc123",
      ],
      { encoding: "utf8" },
    );

    expect(result.status, result.stderr).toBe(0);
    const workergroup = result.stdout
      .split("\n")
      .find((line) => line.includes(" create workergroup "));
    // newer CLIs reject these flags and the API then defaults both to 3 paid workers
    expect(workergroup).toMatch(/^uvx --from vastai==1\.5\.0 vastai /);
    expect(workergroup).toContain("--test_workers 1");
    expect(workergroup).toContain("--cold_workers 0");
    expect(result.stdout).not.toContain("--min_workers");
  });
});
