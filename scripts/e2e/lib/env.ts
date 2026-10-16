import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function parseEnvFile(path: string): Record<string, string> {
  const values: Record<string, string> = {};
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

/** Load env files in order, later files winning; the real shell env always wins. */
export function loadEnvFiles(
  names: readonly string[],
  cwd = process.cwd(),
): Record<string, string> {
  const loaded: Record<string, string> = {};
  for (const name of names) Object.assign(loaded, parseEnvFile(resolve(cwd, name)));

  for (const [key, value] of Object.entries(loaded)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }

  return loaded;
}

export function loadE2EEnvFiles(cwd = process.cwd()): Record<string, string> {
  return loadEnvFiles([".env.e2e", ".env.e2e.local"], cwd);
}
