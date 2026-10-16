#!/usr/bin/env node

// loads .env.mock (+ .env.mock.local) into process.env then runs the given command
// used to point `next dev` and the seed scripts at the disposable local stack

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFiles } from "../e2e/lib/env.ts";

if (!existsSync(resolve(process.cwd(), ".env.mock"))) {
  console.error(
    "[mock] .env.mock not found. Copy it first:\n  cp .env.mock.example .env.mock",
  );
  process.exit(1);
}

// real shell env wins so one-off overrides still work
loadEnvFiles([".env.mock", ".env.mock.local"]);

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error(
    "usage: node --experimental-strip-types scripts/dev/run-mock.ts <command> [...args]",
  );
  process.exit(1);
}

const child = spawn(command, args, {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
