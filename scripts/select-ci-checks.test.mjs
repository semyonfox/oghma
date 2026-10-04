import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { allChecks, checksForRun, selectChecks } from "./select-ci-checks.mjs";

test("mobile changes retain root lint without selecting web tests and builds", () => {
  assert.deepEqual(
    selectChecks([
      "apps/mobile/src/app/(tabs)/notes/[id].tsx",
      "docs/mobile.md",
    ]),
    ["lint"],
  );
  assert.deepEqual(selectChecks(["apps/mobile/package-lock.json"]), ["lint"]);
});

test("isolated Marker Python and packaging changes leave web checks to their owners", () => {
  assert.deepEqual(
    selectChecks([
      "oghma_marker/pipeline.py",
      "infra/runpod-marker/handler.py",
      "infra/runpod-marker/requirements.txt",
      "infra/runpod-marker/Dockerfile",
      "infra/runpod-marker/run.sh",
      "scripts/tests/test_openai_compatible_vision.py",
      "scripts/package-marker-plus-plus.sh",
    ]),
    [],
  );
});

test("documentation skips web checks without treating arbitrary Markdown as documentation", () => {
  assert.deepEqual(selectChecks(["README.md", "docs/deploy/README.md"]), []);
  assert.deepEqual(selectChecks([]), []);
  assert.deepEqual(selectChecks(["src/prompts/summary.md"]), ["lint", "web"]);
  assert.deepEqual(selectChecks(["docs/example.ts"]), ["lint", "web"]);
});

test("shared, web and unknown changes retain all checks even alongside isolated components", () => {
  for (const path of [
    "src/app/page.tsx",
    "tests/e2e/notes.spec.ts",
    "database/migrations/100-example.sql",
    "public/logo.svg",
    "package.json",
    "package-lock.json",
    "eslint.config.mjs",
    ".github/workflows/build.yml",
    "scripts/select-ci-checks.mjs",
    "oghma_marker/schema.json",
    "infra/runpod-marker/contract.json",
    "infra/runpod-marker/new-handler.py",
    "new-component/main.py",
    "Jenkinsfile",
  ]) {
    assert.deepEqual(
      selectChecks([
        "apps/mobile/src/theme.ts",
        "oghma_marker/pipeline.py",
        path,
      ]),
      ["lint", "web"],
      path,
    );
  }
});

function repository(t) {
  const root = mkdtempSync(join(tmpdir(), "oghma-ci-selection-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cwd = join(root, "source");
  mkdirSync(cwd);
  const git = (...args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_AUTHOR_NAME: "CI fixture",
        GIT_AUTHOR_EMAIL: "ci@example.test",
        GIT_COMMITTER_NAME: "CI fixture",
        GIT_COMMITTER_EMAIL: "ci@example.test",
      },
    }).trim();
  const write = (path, content = path) => {
    const target = join(cwd, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  };
  const commit = () => {
    git("add", "--all");
    git("commit", "--quiet", "-m", "test fixture");
    return git("rev-parse", "HEAD");
  };
  git("init", "--quiet", "--initial-branch=main");
  write("README.md");
  commit();
  return { root, cwd, git, write, commit };
}

test("a shallow PR merge includes every PR commit and excludes unrelated base changes", (t) => {
  const repo = repository(t);
  repo.git("switch", "-c", "feature");
  repo.write("apps/mobile/src/changed.ts");
  repo.commit();
  repo.write("docs/feature.md");
  repo.commit();
  repo.git("switch", "main");
  repo.write("src/unrelated-base-change.ts");
  repo.commit();
  repo.git("merge", "--no-ff", "feature", "-m", "PR merge fixture");
  const shallow = join(repo.root, "shallow");
  repo.git(
    "clone",
    "--quiet",
    "--depth=2",
    pathToFileURL(repo.cwd).href,
    shallow,
  );
  const run = {
    eventName: "pull_request",
    ref: "refs/pull/1/merge",
    sha: repo.git("rev-parse", "HEAD"),
    cwd: shallow,
  };
  assert.deepEqual(checksForRun(run).checks, ["lint"]);
  assert.deepEqual(
    checksForRun({ ...run, sha: repo.git("rev-parse", "feature") }).checks,
    allChecks,
  );
  assert.deepEqual(
    checksForRun({ ...run, ref: "refs/pull/1/head" }).checks,
    allChecks,
  );
});

test("a PR checkout without merge parents cannot skip checks", (t) => {
  const repo = repository(t);
  repo.write("docs/feature.md");
  const sha = repo.commit();
  assert.deepEqual(
    checksForRun({
      eventName: "pull_request",
      ref: "refs/pull/1/merge",
      sha,
      cwd: repo.cwd,
    }).checks,
    allChecks,
  );
});

test("dev pushes compare every pushed commit and fetch a missing shallow base", (t) => {
  const repo = repository(t);
  const before = repo.git("rev-parse", "HEAD");
  repo.write("apps/mobile/src/changed.ts");
  repo.commit();
  repo.write("docs/last-commit.md");
  repo.commit();
  const shallow = join(repo.root, "shallow");
  repo.git(
    "clone",
    "--quiet",
    "--depth=1",
    pathToFileURL(repo.cwd).href,
    shallow,
  );
  assert.throws(() =>
    repo.git("-C", shallow, "cat-file", "-e", `${before}^{commit}`),
  );
  assert.deepEqual(
    checksForRun({
      eventName: "push",
      ref: "refs/heads/dev",
      before,
      cwd: shallow,
    }).checks,
    ["lint"],
  );
  assert.doesNotThrow(() =>
    repo.git("-C", shallow, "cat-file", "-e", `${before}^{commit}`),
  );
});

test("renaming web source into an isolated component still checks the removed web source", (t) => {
  const repo = repository(t);
  const original = "src/old-module.py";
  repo.write(original);
  const before = repo.commit();
  const destination = join(repo.cwd, "oghma_marker/moved.py");
  mkdirSync(dirname(destination), { recursive: true });
  renameSync(join(repo.cwd, original), destination);
  repo.commit();
  assert.deepEqual(
    checksForRun({
      eventName: "push",
      ref: "refs/heads/dev",
      before,
      cwd: repo.cwd,
    }).checks,
    allChecks,
  );
});

test("deleted mobile source with Unicode and a newline in its filename still selects lint", (t) => {
  const repo = repository(t);
  const path = "apps/mobile/src/nótaí with\na newline.ts";
  repo.write(path);
  const before = repo.commit();
  rmSync(join(repo.cwd, path));
  repo.commit();
  assert.deepEqual(
    checksForRun({
      eventName: "push",
      ref: "refs/heads/dev",
      before,
      cwd: repo.cwd,
    }).checks,
    ["lint"],
  );
});

test("production, scheduled, manual and unknown events always select all checks", (t) => {
  const repo = repository(t);
  const before = repo.git("rev-parse", "HEAD");
  repo.write("docs/only-change.md");
  repo.commit();
  for (const run of [
    { eventName: "push", ref: "refs/heads/main" },
    { eventName: "schedule" },
    { eventName: "workflow_dispatch" },
    { eventName: "push", ref: "refs/heads/other" },
    { eventName: "pull_request_target" },
  ]) {
    assert.deepEqual(
      checksForRun({ ...run, before, cwd: repo.cwd }).checks,
      allChecks,
    );
  }
});

test("malformed events and unavailable comparisons retain every check", (t) => {
  const repo = repository(t);
  for (const before of [
    undefined,
    null,
    123,
    "0".repeat(40),
    "f".repeat(40),
    "--unsafe",
  ]) {
    assert.deepEqual(
      checksForRun({
        eventName: "push",
        ref: "refs/heads/dev",
        before,
        cwd: repo.cwd,
      }).checks,
      allChecks,
    );
  }
  assert.deepEqual(
    checksForRun({ eventName: "pull_request", cwd: repo.cwd }).checks,
    allChecks,
  );
  assert.deepEqual(
    checksForRun({
      eventName: "push",
      ref: "refs/heads/dev",
      before: repo.git("rev-parse", "HEAD"),
      cwd: repo.root,
    }).checks,
    allChecks,
  );
});

function runCommand(repo, eventContents) {
  const output = join(repo.root, "output");
  const summary = join(repo.root, "summary");
  const event = join(repo.root, "event.json");
  writeFileSync(event, eventContents);
  writeFileSync(output, "existing=value\n");
  execFileSync(
    process.execPath,
    [fileURLToPath(new URL("./select-ci-checks.mjs", import.meta.url))],
    {
      cwd: repo.cwd,
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: "push",
        GITHUB_REF: "refs/heads/dev",
        GITHUB_EVENT_PATH: event,
        GITHUB_OUTPUT: output,
        GITHUB_STEP_SUMMARY: summary,
      },
    },
  );
  return {
    output: readFileSync(output, "utf8"),
    summary: readFileSync(summary, "utf8"),
  };
}

test("the command appends parseable Actions output and explains selected and skipped checks", (t) => {
  const repo = repository(t);
  const before = repo.git("rev-parse", "HEAD");
  repo.write("apps/mobile/src/changed.ts");
  repo.commit();
  const { output, summary } = runCommand(repo, JSON.stringify({ before }));
  assert.equal(output, 'existing=value\nchecks=["lint"]\n');
  assert.match(summary, /Selected: lint\./);
  assert.match(summary, /Skipped: web\./);
  assert.match(summary, /mobile and Marker retain their own workflows/);
});

test("invalid event JSON falls back to the full suite in the command", (t) => {
  const repo = repository(t);
  const { output, summary } = runCommand(repo, "{invalid");
  assert.equal(output, 'existing=value\nchecks=["lint","web"]\n');
  assert.match(summary, /comparison is unavailable/);
  assert.match(summary, /Skipped: none\./);
});
