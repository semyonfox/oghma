import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const script = resolve("scripts/check-deploy-commit.sh");
let repo: string;
let tree: string;

function commit(message: string) {
  return execFileSync(
    "git",
    ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test",
      "commit-tree", tree, "-m", message],
    { cwd: repo, encoding: "utf8" },
  ).trim();
}

function check(revision: string) {
  return spawnSync("bash", [script], {
    cwd: repo,
    env: { ...process.env, GIT_COMMIT: revision },
    encoding: "utf8",
  });
}

describe("deployment commit guard", () => {
  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), "oghma-deploy-commit-"));
    execFileSync("git", ["init", "--quiet", repo]);
    tree = execFileSync("git", ["mktree"], {
      cwd: repo, input: "", encoding: "utf8",
    }).trim();
  });

  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  it.each([
    "Release [skip ci]", "Release [ci skip]", "Release [no ci]",
    "Release [skip actions]", "Release [actions skip]", "Release [SKIP CI]",
    "Release\n\n\nskip-checks:true", "Release\n\n\nskip-checks: true",
    "Release\n\nBody contains [skip ci]",
  ])("rejects suppressed checks in %s", (message) => {
    const result = check(commit(message));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("this commit skips required GitHub checks");
  });

  it.each(["Release Android alpha", "Release\n\n\nskip-checks: false"])(
    "accepts %s", (message) => {
      expect(check(commit(message)).status).toBe(0);
    },
  );

  it("checks the requested revision rather than a different checkout HEAD", () => {
    const good = commit("Release");
    execFileSync("git", ["update-ref", "HEAD", good], { cwd: repo });
    expect(check(commit("Release [skip ci]")).status).toBe(1);
    expect(check("").status).toBe(0);
  });

  it("fails when the requested revision cannot be inspected", () => {
    expect(check("missing-revision").status).not.toBe(0);
  });
});
