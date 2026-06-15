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

export function loadE2EEnvFiles(cwd = process.cwd()) {
  const loaded = {
    ...parseEnvFile(resolve(cwd, ".env.e2e")),
    ...parseEnvFile(resolve(cwd, ".env.e2e.local")),
  };

  for (const [key, value] of Object.entries(loaded)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }

  return loaded;
}

