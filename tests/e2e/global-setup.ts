import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

async function runNodeScript(script: string) {
  await execFileAsync("node", ["--experimental-strip-types", script], {
    cwd: process.cwd(),
    env: process.env,
    maxBuffer: 1024 * 1024,
  });
}

export default async function globalSetup() {
  if (process.env.E2E_RESET_DB !== "0") {
    await runNodeScript("scripts/e2e/reset-db.ts");
  }

  if (process.env.E2E_CREATE_STORAGE_BUCKET !== "0") {
    await runNodeScript("scripts/e2e/create-storage-bucket.ts");
  }
}
