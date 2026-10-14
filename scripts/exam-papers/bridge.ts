import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
  type Server,
} from "node:http";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
export const ARCHIVE = "https://regexam.nuigalway.ie";
export const BRIDGE = "http://127.0.0.1:18763";
const allowedPaths = new Set([
  "/regexam/paper_index_search_form.asp",
  "/regexam/paper_index_search_results.asp",
  "/regexam/paper_index_download.asp",
]);
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function archiveUrl(value: string): URL {
  const url = new URL(value, ARCHIVE);
  if (
    url.origin !== ARCHIVE ||
    !allowedPaths.has(url.pathname) ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new Error("Unsupported archive URL");
  return url;
}
export interface ArchiveJob {
  kind: "form" | "search" | "pdf";
  url: string;
  body?: Record<string, string>;
}
function validateJob(value: unknown): ArchiveJob {
  if (
    !isRecord(value) ||
    !["form", "search", "pdf"].includes(String(value.kind)) ||
    typeof value.url !== "string"
  )
    throw new Error("Invalid archive job");
  const url = archiveUrl(value.url);
  if (
    (value.kind === "form" &&
      !url.pathname.endsWith("paper_index_search_form.asp")) ||
    (value.kind === "search" &&
      !url.pathname.endsWith("paper_index_search_results.asp")) ||
    (value.kind === "pdf" && !url.pathname.endsWith("paper_index_download.asp"))
  )
    throw new Error("Job URL does not match its kind");
  const kind =
    value.kind === "form" ? "form" : value.kind === "search" ? "search" : "pdf";
  let body: Record<string, string> | undefined;
  if (value.body !== undefined) {
    if (kind !== "search" || !isRecord(value.body))
      throw new Error("Invalid search body");
    body = {};
    for (const [key, entry] of Object.entries(value.body)) {
      if (
        !["module", "module_title_and_or_ind", "ay_1", "ay_2"].includes(key) ||
        typeof entry !== "string" ||
        entry.length > 80
      )
        throw new Error("Invalid search field");
      body[key] = entry;
    }
  }
  return { kind, url: url.href, ...(body ? { body } : {}) };
}
async function bodyJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    length += bytes.length;
    if (length > 46 * 1024 * 1024) throw new Error("Result too large");
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export function createBridgeServer(): Server {
  type Pending = {
    job: ArchiveJob;
    response: ServerResponse;
    timer: NodeJS.Timeout;
    delivered: boolean;
  };
  const jobs = new Map<string, Pending>();
  const server = createServer((request, response) => {
    const run = async (): Promise<void> => {
      const origin = request.headers.origin;
      const address = server.address();
      const expectedHost =
        address && typeof address !== "string"
          ? `127.0.0.1:${address.port}`
          : "";
      if (
        request.headers.host !== expectedHost ||
        (origin !== undefined && origin !== ARCHIVE)
      ) {
        response.writeHead(403).end();
        return;
      }
      if (origin === ARCHIVE) {
        response.setHeader("Access-Control-Allow-Origin", ARCHIVE);
        response.setHeader(
          "Access-Control-Allow-Methods",
          "GET, POST, OPTIONS",
        );
        response.setHeader("Access-Control-Allow-Headers", "Content-Type");
        response.setHeader("Access-Control-Allow-Private-Network", "true");
        response.setHeader("Vary", "Origin");
      }
      response.setHeader("Cache-Control", "no-store");
      if (request.method === "OPTIONS") {
        response.writeHead(204).end();
        return;
      }
      if (request.url === "/client.js" && request.method === "GET") {
        response.setHeader("Content-Type", "application/javascript");
        response.end(
          await readFile(new URL("./archive-client.js", import.meta.url)),
        );
        return;
      }
      if (request.url === "/health" && request.method === "GET") {
        response.end("exam-library");
        return;
      }
      if (
        request.url === "/request" &&
        request.method === "POST" &&
        origin === undefined &&
        !request.headers["sec-fetch-site"]
      ) {
        const job = validateJob(await bodyJson(request));
        const id = randomUUID();
        const timer = setTimeout(() => {
          jobs.delete(id);
          if (!response.destroyed)
            response.writeHead(504).end(
              JSON.stringify({
                error:
                  "Archive browser did not respond. Reconnect the signed-in archive tab.",
              }),
            );
        }, 120000);
        jobs.set(id, { job, response, timer, delivered: false });
        response.on("close", () => {
          clearTimeout(timer);
          jobs.delete(id);
        });
        return;
      }
      if (
        request.url === "/next" &&
        request.method === "GET" &&
        origin === ARCHIVE
      ) {
        const pending = [...jobs.entries()].find(([, item]) => !item.delivered);
        if (!pending) {
          response.writeHead(204).end();
          return;
        }
        pending[1].delivered = true;
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ id: pending[0], ...pending[1].job }));
        return;
      }
      if (
        request.url?.startsWith("/result/") &&
        request.method === "POST" &&
        origin === ARCHIVE
      ) {
        const id = request.url.slice("/result/".length),
          pending = jobs.get(id);
        if (!pending?.delivered) {
          request.resume();
          response.writeHead(204).end();
          return;
        }
        const result = await bodyJson(request);
        clearTimeout(pending.timer);
        jobs.delete(id);
        pending.response.setHeader("Content-Type", "application/json");
        pending.response.end(JSON.stringify(result));
        response.writeHead(204).end();
        return;
      }
      response.writeHead(404).end();
    };
    void run().catch((error) => {
      if (!response.headersSent)
        response.writeHead(400, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          error:
            error instanceof Error ? error.message : "Invalid bridge request",
        }),
      );
    });
  });
  return server;
}

export function startBridge(): void {
  const server = createBridgeServer();
  server.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  server.listen(18763, "127.0.0.1", () => {
    console.log(
      `Bridge listening on ${BRIDGE}. In the signed-in exam archive DevTools console, run:`,
    );
    console.log(
      `fetch('${BRIDGE}/client.js').then(r => r.text()).then(code => (0,eval)(code))`,
    );
    console.log(
      "Allow the browser to connect to this local application if prompted. Ctrl+C stops the bridge.",
    );
  });
}
export async function requestArchive(job: ArchiveJob): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(BRIDGE + "/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validateJob(job)),
      signal: AbortSignal.timeout(125000),
    });
  } catch {
    throw new Error(
      "Cannot reach the archive bridge. Run connect on the laptop, then attach its signed-in archive tab.",
    );
  }
  let result: unknown;
  try {
    result = JSON.parse(await response.text());
  } catch {
    throw new Error(
      `Archive bridge returned an invalid response (HTTP ${response.status})`,
    );
  }
  if (isRecord(result) && typeof result.error === "string")
    throw new Error(result.error);
  if (!response.ok) throw new Error(`Archive bridge HTTP ${response.status}`);
  return result;
}
