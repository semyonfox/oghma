import fs from "fs";
import path from "path";

// Manual env loader (loads before sql import)
function loadEnv() {
  const candidates = [".env.local", ".env"];
  for (const file of candidates) {
    const p = path.join(process.cwd(), file);
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, "utf8");
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

async function main() {
  try {
    const { default: sql } = await import("../src/database/pgsql.js");
    const rows = await sql`SELECT 1 as value;`;
    console.log("DB test rows:", rows);
    process.exit(0);
  } catch (e) {
    console.error("DB test error:", e.message);
    console.error("Error object:", e);
    console.error(e.stack);
    process.exit(1);
  }
}

main();
