import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const allChecks = ["lint", "web"];

export function selectChecks(paths) {
  const selected = new Set();
  for (const path of paths) {
    if (/^[^/]+\.md$/.test(path) || /^docs\/.*\.md$/.test(path)) {
      continue;
    }
    if (path.startsWith("apps/mobile/")) {
      // the root ESLint configuration also checks mobile source files
      selected.add("lint");
      continue;
    }
    if (
      /^oghma_marker\/.*\.py$/.test(path) ||
      [
        "Dockerfile",
        "handler.py",
        "prefetch_models.py",
        "server.py",
        "test_handler.py",
        "run.sh",
        "requirements.txt",
        "constraints-marker-full.txt",
        "constraints-markerpp.txt",
        "constraints-vllm.txt",
        "requirements-test.txt",
      ].some((file) => path === `infra/runpod-marker/${file}`) ||
      path === "scripts/tests/test_openai_compatible_vision.py" ||
      path === "scripts/package-marker-plus-plus.sh"
    ) {
      // the separate Marker workflow covers these Python and packaging inputs
      continue;
    }
    // web source, shared tooling and unknown paths retain every web check
    return allChecks;
  }
  return allChecks.filter((check) => selected.has(check));
}

export function checksForRun({
  eventName,
  ref,
  sha,
  before,
  cwd = process.cwd(),
}) {
  if (eventName === "push" && ref === "refs/heads/main") {
    return {
      checks: allChecks,
      reason: "full suite for the production commit",
    };
  }
  if (
    eventName !== "pull_request" &&
    !(eventName === "push" && ref === "refs/heads/dev")
  ) {
    return {
      checks: allChecks,
      reason: "full suite for an unrecognized event",
    };
  }

  const git = (args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
      maxBuffer: 16 * 1024 * 1024,
    });

  try {
    let base;
    if (eventName === "pull_request") {
      // checkout uses GitHub's merge commit; its first parent is the PR base
      if (
        !/^refs\/pull\/\d+\/merge$/.test(ref) ||
        git(["rev-parse", "HEAD"]).trim() !== sha
      ) {
        throw new Error("checkout is not the PR merge commit");
      }
      git(["rev-parse", "--verify", "HEAD^2"]);
      base = "HEAD^1";
    } else {
      if (
        typeof before !== "string" ||
        !/^(?!0{40}$)[a-f0-9]{40}$/.test(before)
      ) {
        throw new Error("push base is unavailable");
      }
      try {
        git(["cat-file", "-e", `${before}^{commit}`]);
      } catch {
        git(["fetch", "--no-tags", "--depth=1", "origin", before]);
      }
      base = before;
    }

    // treat renames as deletion + addition so both components get checked
    const paths = git([
      "diff",
      "--name-only",
      "--no-renames",
      "-z",
      base,
      "HEAD",
      "--",
    ])
      .split("\0")
      .filter(Boolean);
    return {
      checks: selectChecks(paths),
      reason: `checks selected from ${paths.length} changed paths`,
    };
  } catch {
    return {
      checks: allChecks,
      reason: "full suite because the Git comparison is unavailable",
    };
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  let before;
  if (
    process.env.GITHUB_EVENT_NAME === "push" &&
    process.env.GITHUB_EVENT_PATH
  ) {
    try {
      before = JSON.parse(
        readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"),
      )?.before;
    } catch {
      // an unreadable event falls back to the full suite
    }
  }
  const { checks, reason } = checksForRun({
    eventName: process.env.GITHUB_EVENT_NAME,
    ref: process.env.GITHUB_REF,
    sha: process.env.GITHUB_SHA,
    before,
  });
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `checks=${JSON.stringify(checks)}\n`,
  );
  if (process.env.GITHUB_STEP_SUMMARY) {
    const skipped = allChecks.filter((check) => !checks.includes(check));
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## CI checks\n\n${reason}. Selection applies to web checks; mobile and Marker retain their own workflows.\n\n` +
        `Selected: ${checks.join(", ") || "none"}.\n\n` +
        `Skipped: ${skipped.join(", ") || "none"}.\n`,
    );
  }
}
