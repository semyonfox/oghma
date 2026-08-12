#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance as nodePerformance } from "node:perf_hooks";
import { chromium, devices } from "@playwright/test";
import type {
  Browser,
  BrowserContext,
  Page,
  Request as PlaywrightRequest,
  Response as PlaywrightResponse,
} from "@playwright/test";

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

type RouteGroup = "public" | "auth" | "extra" | "manual";

type AuditRoute = {
  path: string;
  group: RouteGroup;
};

type BrowserLongTask = {
  name: string;
  startTime: number;
  duration: number;
};

type BrowserCustomMetrics = {
  cls: number;
  lcpMs: number | null;
  longTasks: BrowserLongTask[];
};

type NavigationMetrics = {
  requestStart?: number;
  responseStart?: number;
  domContentLoadedEventEnd?: number;
  loadEventEnd?: number;
};

type BrowserMetrics = {
  error?: string;
  nav: NavigationMetrics | null;
  paints: Record<string, number>;
  custom: BrowserCustomMetrics;
  resources: BrowserResourceTiming[];
};

type BrowserResourceTiming = {
  name: string;
  initiatorType: string;
  startTime: number;
  duration: number;
  transferSize: number;
  encodedBodySize: number;
  decodedBodySize: number;
};

type NetworkRequestResult = {
  route: string;
  routeGroup: RouteGroup;
  iteration: number;
  url: string;
  method: string;
  resourceType: string;
  status: number | null;
  ok: boolean;
  failed: boolean;
  canceled: boolean;
  failure: string | null;
  durationMs: number | null;
  responseBytes: number;
  requestBytes: number;
};

type PageResult = {
  route: string;
  routeGroup: RouteGroup;
  iteration: number;
  status: number | null;
  ok: boolean;
  navigationError: string | null;
  networkIdleReached: boolean;
  elapsedMs: number | null;
  ttfbMs: number | null;
  domContentLoadedMs: number | null;
  loadMs: number | null;
  firstPaintMs: number | null;
  fcpMs: number | null;
  lcpMs: number | null;
  cls: number | null;
  longTaskCount: number;
  longTaskTotalMs: number | null;
  requestCount: number;
  failedRequestCount: number;
  canceledRequestCount: number;
  apiRequestCount: number;
  apiTotalMs: number | null;
  totalResponseKb: number | null;
  documentKb: number | null;
  scriptKb: number | null;
  stylesheetKb: number | null;
  imageKb: number | null;
  fontKb: number | null;
  slowestRequestMs: number | null;
  slowestRequestUrl: string | null;
  consoleErrorCount: number;
  pageErrorCount: number;
  consoleErrors: { type: string; text: string }[];
  pageErrors: string[];
  browserMetricsError: string | null;
};

type RequestSummary = {
  responseBytes: number;
  bytesByType: Record<ByteType, number>;
  apiCount: number;
  apiTotalMs: number | null;
  failedCount: number;
  canceledCount: number;
  slowestRequest: NetworkRequestResult | null;
};

type ByteType = "document" | "script" | "stylesheet" | "image" | "font" | "xhr" | "fetch" | "other";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const DEFAULT_PUBLIC_ROUTES = [
  "/",
  "/about",
  "/ai",
  "/blog",
  "/contact",
  "/cookies",
  "/forgot-password",
  "/info",
  "/login",
  "/pricing",
  "/privacy",
  "/register",
  "/reset-password",
  "/syntax-guide",
  "/terms",
  "/verify-email",
];

const DEFAULT_AUTH_ROUTES = [
  "/notes",
  "/chat",
  "/calendar",
  "/quiz",
  "/settings",
];

const BASE_URL =
  process.env.PERF_BASE_URL ||
  process.env.PLAYWRIGHT_BASE_URL ||
  process.env.E2E_BASE_URL ||
  "http://127.0.0.1:3310";

const RUN_AUTH = parseBoolean(process.env.PERF_AUTH);
const ITERATIONS = positiveInteger(process.env.PERF_ITERATIONS, 1);
const POST_LOAD_WAIT_MS = positiveInteger(process.env.PERF_POST_LOAD_WAIT_MS, 1000);
const NAVIGATION_TIMEOUT_MS = positiveInteger(process.env.PERF_NAVIGATION_TIMEOUT_MS, 45_000);
const DEVICE = process.env.PERF_DEVICE || "desktop";
const OUTPUT_DIR =
  process.env.PERF_OUTPUT_DIR ||
  path.join("logs", "perf", new Date().toISOString().replace(/[:.]/g, "-"));

const EXTRA_ROUTES = parseRouteList(process.env.PERF_EXTRA_ROUTES);
const ONLY_ROUTES = parseRouteList(process.env.PERF_ROUTES);

const PUBLIC_ROUTES = routeObjects(DEFAULT_PUBLIC_ROUTES, "public");
const AUTH_ROUTES = routeObjects(DEFAULT_AUTH_ROUTES, "auth");
const EXTRA_ROUTE_OBJECTS = routeObjects(EXTRA_ROUTES, "extra");
const ROUTES = ONLY_ROUTES.length
  ? routeObjects(ONLY_ROUTES, "manual")
  : [...PUBLIC_ROUTES, ...(RUN_AUTH ? AUTH_ROUTES : []), ...EXTRA_ROUTE_OBJECTS];

const AUTH_EMAIL = process.env.E2E_SEED_USER_EMAIL || "student.e2e@example.com";
const AUTH_PASSWORD = process.env.E2E_SEED_USER_PASSWORD || "E2ePassword123!";

if (!ROUTES.length) {
  throw new Error("No routes configured. Set PERF_ROUTES or PERF_EXTRA_ROUTES.");
}

const browser = await chromium.launch({ headless: true });

try {
  const storageState = RUN_AUTH ? await createAuthStorageState(browser) : undefined;
  const pageResults: PageResult[] = [];
  const requestResults: NetworkRequestResult[] = [];

  for (const route of ROUTES) {
    for (let iteration = 1; iteration <= ITERATIONS; iteration += 1) {
      const result = await auditRoute(browser, route, iteration, storageState);
      pageResults.push(result.page);
      requestResults.push(...result.requests);

      const status = result.page.ok ? "ok" : "slow/error";
      const load = formatMs(result.page.loadMs);
      const lcp = formatMs(result.page.lcpMs);
      const requests = result.page.requestCount;
      console.log(`${status.padEnd(10)} ${route.path.padEnd(24)} load=${load} lcp=${lcp} requests=${requests}`);
    }
  }

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(
    path.join(OUTPUT_DIR, "full.json"),
    JSON.stringify(
      {
        baseUrl: BASE_URL,
        createdAt: new Date().toISOString(),
        device: DEVICE,
        iterations: ITERATIONS,
        runAuth: RUN_AUTH,
        routes: ROUTES,
        pages: pageResults,
        requests: requestResults,
      },
      null,
      2,
    ),
  );
  await writeFile(path.join(OUTPUT_DIR, "pages.csv"), toCsv(pageResults));
  await writeFile(path.join(OUTPUT_DIR, "requests.csv"), toCsv(requestResults));
  await writeFile(path.join(OUTPUT_DIR, "summary.md"), renderSummary(pageResults, requestResults));

  console.log(`\nWrote performance report to ${OUTPUT_DIR}`);
  console.log(`Open ${path.join(OUTPUT_DIR, "summary.md")} first, then inspect pages.csv and requests.csv.`);
} finally {
  await browser.close();
}

function routeObjects(routes: readonly string[], group: RouteGroup): AuditRoute[] {
  return [...new Set(routes)].map((routePath) => ({
    path: routePath.startsWith("/") ? routePath : `/${routePath}`,
    group,
  }));
}

function parseRouteList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBoolean(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function createAuthStorageState(browserInstance: Browser): Promise<StorageState> {
  const context = await newContext(browserInstance);
  const page = await context.newPage();

  try {
    await page.goto("/login", { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    await page.getByLabel("Email address").fill(AUTH_EMAIL);
    await page.getByLabel("Password").fill(AUTH_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/notes(?:\/.*)?$/, { timeout: NAVIGATION_TIMEOUT_MS });
    return await context.storageState();
  } catch (error) {
    throw new Error(
      `PERF_AUTH=1 was set, but login failed for ${AUTH_EMAIL}. ` +
        `Seed the E2E user or run without PERF_AUTH=1. Cause: ${errorMessage(error)}`,
    );
  } finally {
    await context.close();
  }
}

async function auditRoute(
  browserInstance: Browser,
  route: AuditRoute,
  iteration: number,
  storageState: StorageState | undefined,
): Promise<{ page: PageResult; requests: NetworkRequestResult[] }> {
  const context = await newContext(browserInstance, storageState);
  const page = await context.newPage();
  const requests: NetworkRequestResult[] = [];
  const requestStarts = new Map<PlaywrightRequest, number>();
  const requestCollection: Promise<void>[] = [];
  const consoleErrors: { type: string; text: string }[] = [];
  const pageErrors: string[] = [];

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleErrors.push({ type: message.type(), text: message.text() });
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    requestStarts.set(request, nodePerformance.now());
  });
  page.on("requestfinished", (request) => {
    requestCollection.push(recordFinishedRequest(route, iteration, request, requestStarts, requests));
  });
  page.on("requestfailed", (request) => {
    const start = requestStarts.get(request) ?? nodePerformance.now();
    requestStarts.delete(request);
    const failure = request.failure()?.errorText || "request failed";
    const canceled = failure.includes("ERR_ABORTED");
    requests.push({
      route: route.path,
      routeGroup: route.group,
      iteration,
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      status: null,
      ok: false,
      failed: true,
      canceled,
      failure,
      durationMs: round(nodePerformance.now() - start),
      responseBytes: 0,
      requestBytes: 0,
    });
  });

  await installBrowserMetrics(page);
  const client = await context.newCDPSession(page);
  await client.send("Network.enable");
  await client.send("Network.setCacheDisabled", { cacheDisabled: true });

  const startedAt = nodePerformance.now();
  let mainResponse: PlaywrightResponse | null = null;
  let navigationError: string | null = null;
  let networkIdleReached = false;

  try {
    mainResponse = await page.goto(route.path, {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    await page.waitForLoadState("load", { timeout: NAVIGATION_TIMEOUT_MS }).catch(() => {});
    await page
      .waitForLoadState("networkidle", { timeout: Math.min(10_000, NAVIGATION_TIMEOUT_MS) })
      .then(() => {
        networkIdleReached = true;
      })
      .catch(() => {});
    await page.waitForTimeout(POST_LOAD_WAIT_MS);
  } catch (error) {
    navigationError = errorMessage(error);
  }

  await Promise.allSettled(requestCollection);
  const elapsedMs = nodePerformance.now() - startedAt;
  const browserMetrics = await readBrowserMetrics(page).catch((error): BrowserMetrics => ({
    error: errorMessage(error),
    nav: null,
    paints: {},
    custom: { cls: 0, lcpMs: null, longTasks: [] },
    resources: [],
  }));

  await context.close();

  const summary = summarizeRequests(requests);
  const nav = browserMetrics.nav || {};
  const paints = browserMetrics.paints || {};
  const custom = browserMetrics.custom || {};
  const status = mainResponse?.status() ?? null;
  const ok = !navigationError && status !== null && status < 400;

  return {
    page: {
      route: route.path,
      routeGroup: route.group,
      iteration,
      status,
      ok,
      navigationError,
      networkIdleReached,
      elapsedMs: round(elapsedMs),
      ttfbMs: nav.responseStart && nav.requestStart ? round(nav.responseStart - nav.requestStart) : null,
      domContentLoadedMs: nav.domContentLoadedEventEnd ? round(nav.domContentLoadedEventEnd) : null,
      loadMs: nav.loadEventEnd ? round(nav.loadEventEnd) : round(elapsedMs),
      firstPaintMs: paints["first-paint"] ? round(paints["first-paint"]) : null,
      fcpMs: paints["first-contentful-paint"] ? round(paints["first-contentful-paint"]) : null,
      lcpMs: custom.lcpMs ? round(custom.lcpMs) : null,
      cls: custom.cls ? round(custom.cls, 4) : 0,
      longTaskCount: custom.longTasks?.length || 0,
      longTaskTotalMs: round((custom.longTasks || []).reduce((total, task) => total + task.duration, 0)),
      requestCount: requests.length,
      failedRequestCount: summary.failedCount,
      canceledRequestCount: summary.canceledCount,
      apiRequestCount: summary.apiCount,
      apiTotalMs: summary.apiTotalMs,
      totalResponseKb: bytesToKb(summary.responseBytes),
      documentKb: bytesToKb(summary.bytesByType.document),
      scriptKb: bytesToKb(summary.bytesByType.script),
      stylesheetKb: bytesToKb(summary.bytesByType.stylesheet),
      imageKb: bytesToKb(summary.bytesByType.image),
      fontKb: bytesToKb(summary.bytesByType.font),
      slowestRequestMs: summary.slowestRequest?.durationMs ?? null,
      slowestRequestUrl: summary.slowestRequest?.url ?? null,
      consoleErrorCount: consoleErrors.length,
      pageErrorCount: pageErrors.length,
      consoleErrors: consoleErrors.slice(0, 10),
      pageErrors: pageErrors.slice(0, 10),
      browserMetricsError: browserMetrics.error || null,
    },
    requests,
  };
}

async function newContext(
  browserInstance: Browser,
  storageState?: StorageState,
): Promise<BrowserContext> {
  const device =
    DEVICE === "mobile"
      ? devices["Pixel 7"]
      : {
          viewport: { width: 1440, height: 900 },
          deviceScaleFactor: 1,
          isMobile: false,
          hasTouch: false,
        };

  return browserInstance.newContext({
    ...device,
    baseURL: BASE_URL,
    storageState,
    serviceWorkers: "block",
    ignoreHTTPSErrors: true,
  });
}

async function installBrowserMetrics(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const pageWindow = window as typeof window & { __oghmaPerf?: BrowserCustomMetrics };
    pageWindow.__oghmaPerf = {
      cls: 0,
      lcpMs: null,
      longTasks: [],
    };

    if (!("PerformanceObserver" in window)) return;

    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const latest = entries[entries.length - 1];
        if (latest) pageWindow.__oghmaPerf!.lcpMs = latest.startTime;
      });
      lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
    } catch {}

    try {
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const layoutShift = entry as PerformanceEntry & {
            hadRecentInput?: boolean;
            value?: number;
          };
          if (!layoutShift.hadRecentInput) {
            pageWindow.__oghmaPerf!.cls += layoutShift.value ?? 0;
          }
        }
      });
      clsObserver.observe({ type: "layout-shift", buffered: true });
    } catch {}

    try {
      const longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          pageWindow.__oghmaPerf!.longTasks.push({
            name: entry.name,
            startTime: entry.startTime,
            duration: entry.duration,
          });
        }
      });
      longTaskObserver.observe({ type: "longtask", buffered: true });
    } catch {}
  });
}

async function readBrowserMetrics(page: Page): Promise<BrowserMetrics> {
  return page.evaluate<BrowserMetrics>(() => {
    const navigation = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    const paints = Object.fromEntries(
      performance.getEntriesByType("paint").map((entry) => [entry.name, entry.startTime]),
    );
    const resources = performance.getEntriesByType("resource").map((entry) => {
      const resource = entry as PerformanceResourceTiming;
      return {
        name: resource.name,
        initiatorType: resource.initiatorType,
        startTime: resource.startTime,
        duration: resource.duration,
        transferSize: resource.transferSize,
        encodedBodySize: resource.encodedBodySize,
        decodedBodySize: resource.decodedBodySize,
      };
    });
    const pageWindow = window as typeof window & { __oghmaPerf?: BrowserCustomMetrics };

    return {
      nav: navigation?.toJSON ? navigation.toJSON() : null,
      paints,
      custom: pageWindow.__oghmaPerf ?? { cls: 0, lcpMs: null, longTasks: [] },
      resources,
    };
  });
}

async function recordFinishedRequest(
  route: AuditRoute,
  iteration: number,
  request: PlaywrightRequest,
  requestStarts: Map<PlaywrightRequest, number>,
  requests: NetworkRequestResult[],
): Promise<void> {
  const start = requestStarts.get(request) ?? nodePerformance.now();
  requestStarts.delete(request);

  const response = await request.response().catch(() => null);
  const sizes = await request.sizes().catch(() => null);
  const responseBytes = sizes ? sizes.responseBodySize + sizes.responseHeadersSize : 0;
  const requestBytes = sizes ? sizes.requestBodySize + sizes.requestHeadersSize : 0;

  requests.push({
    route: route.path,
    routeGroup: route.group,
    iteration,
    url: request.url(),
    method: request.method(),
    resourceType: request.resourceType(),
    status: response?.status() ?? null,
    ok: response ? response.status() < 400 : false,
    failed: false,
    canceled: false,
    failure: null,
    durationMs: round(nodePerformance.now() - start),
    responseBytes,
    requestBytes,
  });
}

function resourceByteType(resourceType: string): ByteType {
  switch (resourceType) {
    case "document":
    case "script":
    case "stylesheet":
    case "image":
    case "font":
    case "xhr":
    case "fetch":
      return resourceType;
    default:
      return "other";
  }
}

function summarizeRequests(requests: readonly NetworkRequestResult[]): RequestSummary {
  const bytesByType: Record<ByteType, number> = {
    document: 0,
    script: 0,
    stylesheet: 0,
    image: 0,
    font: 0,
    xhr: 0,
    fetch: 0,
    other: 0,
  };
  let responseBytes = 0;
  let apiCount = 0;
  let apiTotalMs = 0;
  let failedCount = 0;
  let canceledCount = 0;
  let slowestRequest: NetworkRequestResult | null = null;

  for (const request of requests) {
    responseBytes += request.responseBytes || 0;
    const type = resourceByteType(request.resourceType);
    bytesByType[type] += request.responseBytes || 0;

    if (request.canceled) canceledCount += 1;
    if ((!request.ok || request.failed) && !request.canceled) failedCount += 1;
    if (isApiRequest(request.url)) {
      apiCount += 1;
      apiTotalMs += request.durationMs || 0;
    }
    if (!slowestRequest || (request.durationMs || 0) > (slowestRequest.durationMs || 0)) {
      slowestRequest = request;
    }
  }

  return {
    responseBytes,
    bytesByType,
    apiCount,
    apiTotalMs: round(apiTotalMs),
    failedCount,
    canceledCount,
    slowestRequest,
  };
}

function isApiRequest(url: string): boolean {
  try {
    return new URL(url).pathname.startsWith("/api/");
  } catch {
    return url.includes("/api/");
  }
}

function renderSummary(
  pages: readonly PageResult[],
  requests: readonly NetworkRequestResult[],
): string {
  const completedRequests = requests.filter((request) => !request.canceled);
  const slowestPages = [...pages]
    .sort((a, b) => (b.loadMs || b.elapsedMs || 0) - (a.loadMs || a.elapsedMs || 0))
    .slice(0, 15);
  const slowestRequests = [...completedRequests]
    .sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0))
    .slice(0, 25);
  const largestRequests = [...completedRequests]
    .sort((a, b) => (b.responseBytes || 0) - (a.responseBytes || 0))
    .slice(0, 25);

  return [
    "# Performance Audit Summary",
    "",
    `Base URL: ${BASE_URL}`,
    `Device: ${DEVICE}`,
    `Iterations: ${ITERATIONS}`,
    `Authenticated routes: ${RUN_AUTH ? "yes" : "no"}`,
    "",
    "## Slowest Pages",
    "",
    toMarkdownTable(
      ["route", "status", "load", "LCP", "FCP", "CLS", "requests", "KB", "slowest request"],
      slowestPages.map((page) => [
        page.route,
        page.status ?? "error",
        formatMs(page.loadMs),
        formatMs(page.lcpMs),
        formatMs(page.fcpMs),
        page.cls,
        page.requestCount,
        page.totalResponseKb,
        compactUrl(page.slowestRequestUrl),
      ]),
    ),
    "",
    "## Slowest Network Requests",
    "",
    toMarkdownTable(
      ["route", "status", "type", "duration", "KB", "url"],
      slowestRequests.map((request) => [
        request.route,
        request.status ?? "failed",
        request.resourceType,
        formatMs(request.durationMs),
        bytesToKb(request.responseBytes),
        compactUrl(request.url),
      ]),
    ),
    "",
    "## Largest Network Requests",
    "",
    toMarkdownTable(
      ["route", "status", "type", "duration", "KB", "url"],
      largestRequests.map((request) => [
        request.route,
        request.status ?? "failed",
        request.resourceType,
        formatMs(request.durationMs),
        bytesToKb(request.responseBytes),
        compactUrl(request.url),
      ]),
    ),
    "",
    "Raw files:",
    "",
    "- `full.json`: complete page and request data",
    "- `pages.csv`: sortable per-page metrics",
    "- `requests.csv`: sortable request waterfall data",
    "",
  ].join("\n");
}

function toMarkdownTable(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const header = `| ${headers.join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.map(markdownCell).join(" | ")} |`);
  return [header, separator, ...body].join("\n");
}

function markdownCell(value: unknown): string {
  return String(value ?? "").replace(/\|/g, "\\|");
}

function toCsv<TRow extends object>(rows: readonly TRow[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(flattenForCsv(rows[0]));
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => csvCell(flattenForCsv(row)[header]))
        .join(","),
    ),
  ];
  return `${lines.join("\n")}\n`;
}

function flattenForCsv(row: object): Record<string, unknown> {
  const flattened: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (Array.isArray(value) || (value && typeof value === "object")) {
      flattened[key] = JSON.stringify(value);
    } else {
      flattened[key] = value;
    }
  }
  return flattened;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function bytesToKb(bytes: number): number | null {
  return round((bytes || 0) / 1024, 1);
}

function round(value: number, decimals = 0): number | null {
  if (!Number.isFinite(value)) return null;
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function formatMs(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}ms` : "n/a";
}

function compactUrl(value: string | null | undefined): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}`;
  } catch {
    return value;
  }
}
