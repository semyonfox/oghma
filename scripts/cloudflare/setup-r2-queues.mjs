#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? process.env.CF_ACCOUNT_ID;
const expectedEmail = process.env.CLOUDFLARE_EXPECTED_EMAIL ?? "cloudflare@oghmanotes.ie";
const r2Bucket = process.env.R2_BUCKET_NAME ?? process.env.STORAGE_BUCKET ?? "oghma-notes";
const queuePrefix = process.env.CLOUDFLARE_QUEUE_PREFIX ?? "oghma";
const canvasQueue = process.env.CLOUDFLARE_CANVAS_IMPORT_QUEUE_NAME ?? `${queuePrefix}-canvas-import`;
const retryQueue = process.env.CLOUDFLARE_EXTRACT_RETRY_QUEUE_NAME ?? `${queuePrefix}-extract-retry`;

function runWrangler(args, options = {}) {
  const fullArgs = ["wrangler", ...args];
  console.log(`$ npx ${fullArgs.join(" ")}`);
  return execFileSync("npx", fullArgs, {
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: process.env,
  });
}

function runWranglerAllowExists(args) {
  try {
    runWrangler(args, { capture: true });
    return true;
  } catch (error) {
    const output = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
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

async function cfApi(path, init = {}) {
  const token = process.env.CLOUDFLARE_API_TOKEN ?? process.env.CLOUDFLARE_QUEUES_API_TOKEN;
  if (!token) {
    throw new Error("Set CLOUDFLARE_API_TOKEN to look up created queue IDs.");
  }

  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    const detail = payload.errors?.map((err) => err.message).join("; ") || response.statusText;
    throw new Error(`Cloudflare API failed (${response.status}): ${detail}`);
  }
  return payload.result;
}

async function queueIdByName(name) {
  if (!process.env.CLOUDFLARE_API_TOKEN && !process.env.CLOUDFLARE_QUEUES_API_TOKEN) {
    const list = runWrangler(["queues", "list"], { capture: true });
    const row = list
      .split("\n")
      .map((line) => line.match(/│\s*([a-f0-9]{32})\s*│\s*([^│]+?)\s*│/))
      .find((match) => match?.[2]?.trim() === name);
    if (row?.[1]) return row[1];
    throw new Error(`Queue not found after creation: ${name}`);
  }

  const queues = await cfApi(`/accounts/${accountId}/queues`);
  const queue = queues.find((item) => item.queue_name === name || item.name === name);
  if (!queue) throw new Error(`Queue not found after creation: ${name}`);
  return queue.queue_id ?? queue.id;
}

async function main() {
  if (!accountId) {
    throw new Error("Set CLOUDFLARE_ACCOUNT_ID or CF_ACCOUNT_ID before running this script.");
  }

  let whoami = "";
  try {
    whoami = runWrangler(["whoami"], { capture: true });
    process.stdout.write(whoami);
  } catch (error) {
    console.error(error.stderr || error.message);
    throw new Error("Wrangler is not authenticated. Run `npx wrangler login` or set CLOUDFLARE_API_TOKEN.");
  }

  if (expectedEmail && !whoami.includes(expectedEmail) && !process.env.CLOUDFLARE_API_TOKEN) {
    throw new Error(
      `Wrangler is not authenticated as ${expectedEmail}. Set CLOUDFLARE_EXPECTED_EMAIL to override this guard.`,
    );
  }

  const r2Ready = runWranglerAllowExists(["r2", "bucket", "create", r2Bucket]);
  runWranglerAllowExists(["queues", "create", canvasQueue]);
  runWranglerAllowExists(["queues", "create", retryQueue]);
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

  const canvasQueueId = await queueIdByName(canvasQueue);
  const retryQueueId = await queueIdByName(retryQueue);

  console.log("\nCloudflare resources ready. Add these to the Jenkins env files:");
  if (r2Ready) {
    console.log(`STORAGE_ENDPOINT=https://${accountId}.r2.cloudflarestorage.com`);
    console.log(`STORAGE_BUCKET=${r2Bucket}`);
    console.log("STORAGE_REGION=auto");
    console.log("STORAGE_PATH_STYLE=true");
  } else {
    console.log("# R2 bucket was not created. Enable R2 in the Cloudflare dashboard, then rerun this script.");
  }
  console.log("QUEUE_PROVIDER=cloudflare");
  console.log(`CLOUDFLARE_CANVAS_IMPORT_QUEUE_ID=${canvasQueueId}`);
  console.log(`CLOUDFLARE_EXTRACT_RETRY_QUEUE_ID=${retryQueueId}`);
  console.log("CLOUDFLARE_QUEUES_API_TOKEN=<token with Account Queues Edit>");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
