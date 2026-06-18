#!/usr/bin/env node

// loads .env.mock (+ .env.mock.local) into process.env then runs the given command
// used to point `next dev` and the seed scripts at the disposable local stack

import { spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

function parseEnvFile(path) {
  const values = {};
  if (!existsSync(path)) return values;

  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }

  return values;
}

const cwd = process.cwd();
if (!existsSync(resolve(cwd, ".env.mock"))) {
  console.error(
    "[mock] .env.mock not found. Copy it first:\n  cp .env.mock.example .env.mock",
  );
  process.exit(1);
}

const loaded = {
  ...parseEnvFile(resolve(cwd, ".env.mock")),
  ...parseEnvFile(resolve(cwd, ".env.mock.local")),
};
// real shell env wins so one-off overrides still work
for (const [key, value] of Object.entries(loaded)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("usage: node scripts/dev/run-mock.mjs <command> [...args]");
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
