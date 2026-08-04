import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Vast Marker offline plan", () => {
  it("passes the tracked fail-closed guardrails", () => {
    const result = spawnSync(
      process.execPath,
      [resolve(process.cwd(), "scripts/vast-marker-plan.mjs")],
      { encoding: "utf8" },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Offline validation: PASS");
    expect(result.stdout).toContain("BLOCKED AS INTENDED");
  });
});
