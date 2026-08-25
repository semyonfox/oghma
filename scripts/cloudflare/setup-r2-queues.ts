#!/usr/bin/env node

import { execFileSync } from "node:child_process";

type WranglerOptions = {
  capture?: boolean;
};

type CloudflareQueue = Record<string, unknown>;

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? process.env.CF_ACCOUNT_ID;
const expectedEmail = process.env.CLOUDFLARE_EXPECTED_EMAIL ?? "cloudflare@oghmanotes.ie";
const r2Bucket = process.env.R2_BUCKET_NAME ?? process.env.STORAGE_BUCKET ?? "oghma-notes";
const queuePrefix = process.env.CLOUDFLARE_QUEUE_PREFIX ?? "oghma";
const canvasQueue =
  process.env.CLOUDFLARE_CANVAS_IMPORT_QUEUE_NAME ?? `${queuePrefix}-canvas-import`;
const retryQueue =
  process.env.CLOUDFLARE_EXTRACT_RETRY_QUEUE_NAME ?? `${queuePrefix}-extract-retry`;
const markerQueue =
  process.env.CLOUDFLARE_MARKER_DISPATCH_QUEUE_NAME ?? `${queuePrefix}-marker-dispatch`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function commandOutput(value: unknown): string {
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  return "";
}

function failedCommandOutput(error: unknown): string {
  if (!isRecord(error)) return errorMessage(error);
  return [commandOutput(error.stdout), commandOutput(error.stderr)].filter(Boolean).join("\n");
}

function runWrangler(args: string[], options: WranglerOptions = {}): string {
  const fullArgs = ["wrangler", ...args];
  console.log(`$ npx ${fullArgs.join(" ")}`);

  if (options.capture) {
    return execFileSync("npx", fullArgs, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
  }

  execFileSync("npx", fullArgs, {
    encoding: "utf8",
    stdio: "inherit",
    env: process.env,
  });
  return "";
}

function runWranglerAllowExists(args: string[]): boolean {
  try {
    runWrangler(args, { capture: true });
    return true;
  } catch (error) {
    const output = failedCommandOutput(error);
    if (/already exists|already (?:been )?taken|already has a consumer|exists/i.test(output)) {
      console.log("Resource already exists; continuing.");
      return true;
    }
    if (/Please enable R2 through the Cloudflare Dashboard|code: 10042/i.test(output)) {
      console.warn("R2 is not enabled on this account yet; skipping bucket creation.");
      return false;
    }
    throw error;
  }
}

function errorDetail(payload: unknown, fallback: string): string {
  if (!isRecord(payload) || !Array.isArray(payload.errors)) return fallback;

  const messages = payload.errors.flatMap((error) =>
    isRecord(error) && typeof error.message === "string" ? [error.message] : [],
  );
  return messages.join("; ") || fallback;
}

function queueName(queue: CloudflareQueue): string | undefined {
  if (typeof queue.queue_name === "string") return queue.queue_name;
  return typeof queue.name === "string" ? queue.name : undefined;
}

function queueId(queue: CloudflareQueue): string | undefined {
  if (typeof queue.queue_id === "string") return queue.queue_id;
  return typeof queue.id === "string" ? queue.id : undefined;
}

async function cfApi(path: string, init: RequestInit = {}): Promise<CloudflareQueue[]> {
  const token = process.env.CLOUDFLARE_API_TOKEN ?? process.env.CLOUDFLARE_QUEUES_API_TOKEN;
  if (!token) {
    throw new Error("Set CLOUDFLARE_API_TOKEN to look up created queue IDs.");
  }

  const headers = new Headers({
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  });
  new Headers(init.headers).forEach((value, name) => headers.set(name, value));

  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers,
  });
  const payload: unknown = await response.json();
  if (!response.ok || (isRecord(payload) && payload.success === false)) {
    throw new Error(
      `Cloudflare API failed (${response.status}): ${errorDetail(payload, response.statusText)}`,
    );
  }
  if (!isRecord(payload) || !Array.isArray(payload.result) || !payload.result.every(isRecord)) {
    throw new Error("Cloudflare API returned an invalid queue list.");
  }

  return payload.result;
}

async function queueIdByName(name: string, cloudflareAccountId: string): Promise<string> {
  if (!process.env.CLOUDFLARE_API_TOKEN && !process.env.CLOUDFLARE_QUEUES_API_TOKEN) {
    const list = runWrangler(["queues", "list"], { capture: true });
    const row = list
      .split("\n")
      .map((line) => line.match(/│\s*([a-f0-9]{32})\s*│\s*([^│]+?)\s*│/))
      .find((match) => match?.[2]?.trim() === name);
    if (row?.[1]) return row[1];
    throw new Error(`Queue not found after creation: ${name}`);
  }

  const queues = await cfApi(`/accounts/${cloudflareAccountId}/queues`);
  const queue = queues.find((item) => queueName(item) === name);
  const id = queue ? queueId(queue) : undefined;
  if (!id) throw new Error(`Queue not found after creation: ${name}`);
  return id;
}

async function main(): Promise<void> {
  if (!accountId) {
    throw new Error("Set CLOUDFLARE_ACCOUNT_ID or CF_ACCOUNT_ID before running this script.");
  }

  let whoami = "";
  try {
    whoami = runWrangler(["whoami"], { capture: true });
    process.stdout.write(whoami);
  } catch (error) {
    console.error(failedCommandOutput(error) || errorMessage(error));
    throw new Error(
      "Wrangler is not authenticated. Run `npx wrangler login` or set CLOUDFLARE_API_TOKEN.",
    );
  }

  if (expectedEmail && !whoami.includes(expectedEmail) && !process.env.CLOUDFLARE_API_TOKEN) {
    throw new Error(
      `Wrangler is not authenticated as ${expectedEmail}. Set CLOUDFLARE_EXPECTED_EMAIL to override this guard.`,
    );
  }

  const r2Ready = runWranglerAllowExists(["r2", "bucket", "create", r2Bucket]);
  runWranglerAllowExists(["queues", "create", canvasQueue]);
  runWranglerAllowExists(["queues", "create", retryQueue]);
  runWranglerAllowExists(["queues", "create", markerQueue]);
  runWranglerAllowExists([
    "queues",
    "consumer",
    "http",
    "add",
    canvasQueue,
    "--batch-size",
    process.env.CLOUDFLARE_QUEUE_BATCH_SIZE ?? "10",
    "--message-retries",
    process.env.CLOUDFLARE_QUEUE_MESSAGE_RETRIES ?? "3",
    "--visibility-timeout-secs",
    process.env.CLOUDFLARE_QUEUE_VISIBILITY_TIMEOUT_SECS ?? `${12 * 60 * 60}`,
    "--retry-delay-secs",
    process.env.CLOUDFLARE_QUEUE_RETRY_DELAY_SECONDS ?? "60",
  ]);
  runWranglerAllowExists([
    "queues",
    "consumer",
    "http",
    "add",
    markerQueue,
    "--batch-size",
    process.env.CLOUDFLARE_MARKER_QUEUE_BATCH_SIZE ?? "3",
    "--message-retries",
    process.env.CLOUDFLARE_QUEUE_MESSAGE_RETRIES ?? "3",
    "--visibility-timeout-secs",
    process.env.CLOUDFLARE_QUEUE_VISIBILITY_TIMEOUT_SECS ?? `${12 * 60 * 60}`,
    "--retry-delay-secs",
    process.env.CLOUDFLARE_QUEUE_RETRY_DELAY_SECONDS ?? "60",
  ]);
  runWranglerAllowExists([
    "queues",
    "consumer",
    "http",
    "add",
    retryQueue,
    "--batch-size",
    process.env.CLOUDFLARE_QUEUE_BATCH_SIZE ?? "10",
    "--message-retries",
    process.env.CLOUDFLARE_QUEUE_MESSAGE_RETRIES ?? "3",
    "--visibility-timeout-secs",
    process.env.CLOUDFLARE_QUEUE_VISIBILITY_TIMEOUT_SECS ?? `${12 * 60 * 60}`,
    "--retry-delay-secs",
    process.env.CLOUDFLARE_QUEUE_RETRY_DELAY_SECONDS ?? "60",
  ]);

  const canvasQueueId = await queueIdByName(canvasQueue, accountId);
  const retryQueueId = await queueIdByName(retryQueue, accountId);
  const markerQueueId = await queueIdByName(markerQueue, accountId);

  console.log("\nCloudflare resources ready. Add these to the Jenkins env files:");
  if (r2Ready) {
    console.log(`STORAGE_ENDPOINT=https://${accountId}.r2.cloudflarestorage.com`);
    console.log(`STORAGE_BUCKET=${r2Bucket}`);
    console.log("STORAGE_REGION=auto");
    console.log("STORAGE_PATH_STYLE=true");
  } else {
    console.log(
      "# R2 bucket was not created. Enable R2 in the Cloudflare dashboard, then rerun this script.",
    );
  }
  console.log("QUEUE_PROVIDER=cloudflare");
  console.log(`CLOUDFLARE_CANVAS_IMPORT_QUEUE_ID=${canvasQueueId}`);
  console.log(`CLOUDFLARE_EXTRACT_RETRY_QUEUE_ID=${retryQueueId}`);
  console.log(`CLOUDFLARE_MARKER_DISPATCH_QUEUE_ID=${markerQueueId}`);
  console.log("CLOUDFLARE_QUEUES_API_TOKEN=<token with Account Queues Edit>");
}

main().catch((error: unknown) => {
  console.error(errorMessage(error));
  process.exit(1);
});
