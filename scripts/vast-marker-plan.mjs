#!/usr/bin/env node

// Offline-only plan renderer. It never imports an HTTP client or contacts Vast.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const planPath = path.join(
  repositoryRoot,
  "infra",
  "vast-marker",
  "serverless-plan.json",
);
const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
const portableProfilePath = path.join(
  repositoryRoot,
  "infra",
  "vast-marker",
  "profiles",
  "portable-24gb.env.example",
);

function fail(message) {
  console.error(`Vast Marker plan invalid: ${message}`);
  process.exit(1);
}

function requireEqual(object, field, expected) {
  if (object[field] !== expected) {
    fail(`${field} must be ${JSON.stringify(expected)}`);
  }
}

if (plan.schemaVersion !== 2) fail("schemaVersion must be 2");
if (!plan.template?.name) fail("template.name is required");
if (!plan.template?.image) fail("template.image is required");
requireEqual(plan.template, "launch_mode", "args");
requireEqual(plan.template, "disk_space_gb", 80);
if (plan.template.environment?.PYWORKER_REPO) {
  fail("the immutable image must not set PYWORKER_REPO");
}
const portableProfile = Object.fromEntries(
  fs
    .readFileSync(portableProfilePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const separator = line.indexOf("=");
      if (separator <= 0) fail(`invalid portable profile line: ${line}`);
      return [line.slice(0, separator), line.slice(separator + 1)];
    }),
);
const plannedProfile = { ...plan.template.environment };
delete plannedProfile.MARKER_ALLOWED_OBJECT_HOSTS;
if (
  JSON.stringify(Object.entries(plannedProfile).sort()) !==
  JSON.stringify(Object.entries(portableProfile).sort())
) {
  fail("template.environment must match profiles/portable-24gb.env.example");
}
if (!plan.endpoint?.endpoint_name) fail("endpoint.endpoint_name is required");
if (plan.workergroup?.endpoint_name !== plan.endpoint.endpoint_name) {
  fail("workergroup and endpoint names must match");
}
requireEqual(plan.endpoint, "min_load", 0);
requireEqual(plan.endpoint, "min_cold_load", 0);
requireEqual(plan.endpoint, "min_workers", 0);
requireEqual(plan.endpoint, "cold_workers", 0);
requireEqual(plan.endpoint, "cold_mult", 0);
requireEqual(plan.endpoint, "max_workers", 1);
requireEqual(plan.workergroup, "test_workers", 1);
requireEqual(plan.workergroup, "cold_workers", 0);
const requiredSearchParams = [
  ["gpu_name=RTX_4090", "initial workergroup must stay on the measured RTX_4090 family"],
  ["cuda_max_good>=12.9", "portable cu129 image requires cuda_max_good>=12.9"],
  ["disk_bw>=500", "initial workergroup requires at least 500 MB/s disk read bandwidth"],
  ["disk_space>=80", "initial workergroup requires at least 80 GB available disk"],
  ["allocated_storage=80", "offer pricing must include the template's 80 GB allocation"],
  ["inet_down>=200", "initial workergroup requires Vast-reported inet_down>=200"],
  ["inet_up>=100", "initial workergroup requires Vast-reported inet_up>=100"],
  ["inet_down_cost<=0.005", "download bandwidth price must be capped at $0.005/GB"],
  ["inet_up_cost<=0.005", "upload bandwidth price must be capped at $0.005/GB"],
  ["dph_total<=0.45", "total recruited-worker price must be capped at $0.45/hour"],
];
const searchParamTokens = new Set(
  plan.workergroup.search_params.trim().split(/\s+/),
);
for (const [parameter, message] of requiredSearchParams) {
  if (!searchParamTokens.has(parameter)) {
    fail(message);
  }
}
requireEqual(plan.endpoint, "inactivity_timeout", 300);
if (
  !Number.isFinite(plan.endpoint.target_util) ||
  plan.endpoint.target_util <= 0 ||
  plan.endpoint.target_util > 1
) {
  fail("target_util must be within (0, 1]");
}
requireEqual(plan.application, "dispatch_concurrency", 1);
requireEqual(plan.application, "dispatch_consumer_enabled", true);
requireEqual(plan.application, "dispatch_attempts", 1);
if (
  plan.application?.dispatch_concurrency >
  Number(plan.template.environment.MARKER_ADMISSION_CONCURRENCY)
) {
  fail("application dispatch concurrency must not exceed worker admission");
}

function flagValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) fail(`${flag} requires a value`);
  return value;
}

const suppliedHash = flagValue("--template-hash");
if (
  suppliedHash &&
  (suppliedHash.includes("<") ||
    suppliedHash.includes(">") ||
    /\s/.test(suppliedHash))
) {
  fail("--template-hash must be a concrete template hash");
}
const templateHash = suppliedHash ?? plan.workergroup.template_hash;

const image = flagValue("--image") ?? plan.template.image;
if (
  !image.startsWith("<") &&
  (!image.split("/").at(-1)?.includes(":") || image.endsWith(":latest"))
) {
  fail("--image must use a unique, explicit image tag (never latest)");
}

const suppliedObjectHost = flagValue("--object-host");
if (
  suppliedObjectHost &&
  (suppliedObjectHost.includes("://") ||
    suppliedObjectHost.includes("/") ||
    /\s/.test(suppliedObjectHost))
) {
  fail("--object-host must be a hostname without a scheme or path");
}
const templateEnvironment = {
  ...plan.template.environment,
  MARKER_ALLOWED_OBJECT_HOSTS:
    suppliedObjectHost ??
    plan.template.environment.MARKER_ALLOWED_OBJECT_HOSTS,
};

function shellQuote(value) {
  const text = String(value);
  return `'${text.replaceAll("'", "'\\''")}'`;
}

const endpoint = plan.endpoint;
const worker = plan.workergroup;
const templateOptions = Object.entries(templateEnvironment)
  .map(([name, value]) => `-e ${name}=${value}`)
  .join(" ");
const templateCommand = [
  "vastai create template",
  `--name ${shellQuote(plan.template.name)}`,
  `--image ${shellQuote(image)}`,
  `--env ${shellQuote(templateOptions)}`,
  `--search_params ${shellQuote(worker.search_params)}`,
  `--disk_space ${plan.template.disk_space_gb}`,
  "--no-default",
].join(" ");
const endpointCommand = [
  "vastai create endpoint",
  `--endpoint_name ${shellQuote(endpoint.endpoint_name)}`,
  `--min_load ${endpoint.min_load}`,
  `--min_cold_load ${endpoint.min_cold_load}`,
  `--min_workers ${endpoint.min_workers}`,
  `--target_util ${endpoint.target_util}`,
  `--cold_mult ${endpoint.cold_mult}`,
  `--cold_workers ${endpoint.cold_workers}`,
  `--max_workers ${endpoint.max_workers}`,
  `--max_queue_time ${endpoint.max_queue_time}`,
  `--target_queue_time ${endpoint.target_queue_time}`,
  `--inactivity_timeout ${endpoint.inactivity_timeout}`,
].join(" ");

const workergroupCommand = [
  "vastai create workergroup",
  `--endpoint_name ${shellQuote(worker.endpoint_name)}`,
  `--template_hash ${shellQuote(templateHash)}`,
  `--test_workers ${worker.test_workers}`,
  `--cold_workers ${worker.cold_workers}`,
  `--gpu_ram ${worker.gpu_ram}`,
  `--search_params ${shellQuote(worker.search_params)}`,
  "--no-default",
].join(" ");

console.log("Offline validation: PASS");
console.log(JSON.stringify(plan, null, 2));
if (!suppliedHash) {
  console.log(
    "\nFunding-time template command (review before running; this mutates Vast):",
  );
  console.log(templateCommand);
  console.log(
    "\nAfter creating the private template, rerun with --template-hash <HASH> to render endpoint/workergroup activation.",
  );
}
if (suppliedHash) {
  console.log(
    "\nFunding-time activation commands (review before running; the workergroup starts one paid test worker):",
  );
  console.log(endpointCommand);
  console.log(workergroupCommand);
  console.log("vastai show endpoints");
  console.log("vastai show workergroups");
}
if (
  !suppliedHash &&
  (image.startsWith("<") ||
    templateEnvironment.MARKER_ALLOWED_OBJECT_HOSTS.startsWith("<"))
) {
  console.log(
    "\nBLOCKED AS INTENDED: supply --image and --object-host before creating the private template.",
  );
}
