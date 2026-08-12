#!/usr/bin/env -S npx tsx

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Manual env loader (loads before sql import)
function loadEnv(): void {
  const candidates = [".env.local", ".env"];
  for (const file of candidates) {
    const filePath = join(process.cwd(), file);
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, "utf8");
      content.split(/\r?\n/).forEach((line) => {
        if (!line || line.startsWith("#")) return;
        const eq = line.indexOf("=");
        if (eq === -1) return;
        const key = line.slice(0, eq).trim();
        const value = line.slice(eq + 1).trim();
        if (!process.env[key]) process.env[key] = value;
      });
      break;
    }
  }
}

loadEnv();

console.log(
  "DATABASE_URL visible to script:",
  process.env.DATABASE_URL ? "set" : "missing",
);
// redact credentials from connection string for safe logging
const redacted = (process.env.DATABASE_URL || "").replace(
  /:\/\/[^@]+@/,
  "://***:***@",
);
console.log("DATABASE_URL (redacted):", redacted);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  try {
    const { default: sql } = await import("../src/database/pgsql.ts");
    const rows = await sql<{ value: number }[]>`SELECT 1 as value;`;
    console.log("DB test rows:", rows);
  } catch (error: unknown) {
    console.error("DB test error:", errorMessage(error));
    console.error("Error object:", error);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exitCode = 1;
  }
}

void main();
