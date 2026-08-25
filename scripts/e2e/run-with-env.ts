#!/usr/bin/env node

import { spawn } from "node:child_process";
import { loadE2EEnvFiles } from "./lib/env.ts";

loadE2EEnvFiles();

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error(
    "usage: node --experimental-strip-types scripts/e2e/run-with-env.ts <command> [...args]",
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
