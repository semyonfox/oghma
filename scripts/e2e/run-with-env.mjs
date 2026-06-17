#!/usr/bin/env node

import { spawn } from "child_process";
import { loadE2EEnvFiles } from "./lib/env.mjs";

loadE2EEnvFiles();

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("usage: node scripts/e2e/run-with-env.mjs <command> [...args]");
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

