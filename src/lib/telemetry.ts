const COUNT_NAMES = ["app_open", "screen_view", "action_completed", "action_failed"] as const;
const ERROR_NAMES = ["unexpected_error", "request_failed", "render_failed", "storage_failed", "permission_failed", "media_failed", "validation_failed"] as const;
const ROUTES = ["app", "home", "settings", "help", "onboarding", "login", "dashboard", "editor", "training", "attendance", "results", "analysis", "game", "library", "search", "upload", "download", "popup", "workspace"] as const;

export type TelemetryRoute = (typeof ROUTES)[number];
export type TelemetryObservation = (
  | { kind: "count"; name: (typeof COUNT_NAMES)[number] }
  | { kind: "error"; name: (typeof ERROR_NAMES)[number] }
) & { route: TelemetryRoute };
export type TelemetryEvent = TelemetryObservation & { version: 1; app: "oghmanotes"; surface: "web" };

export function telemetryEvent(observation: TelemetryObservation): TelemetryEvent {
  const common = { version: 1, app: "oghmanotes", surface: "web", route: observation.route } as const;
  return observation.kind === "count"
    ? { ...common, kind: "count", name: observation.name }
    : { ...common, kind: "error", name: observation.name };
}

export function parseTelemetryEvent(value: unknown): TelemetryEvent | null {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const keys = ["version", "app", "kind", "name", "surface", "route"];
    if (Object.keys(value).length !== keys.length || !keys.every((key) => Object.hasOwn(value, key))) return null;
    const version: unknown = Reflect.get(value, "version");
    const app: unknown = Reflect.get(value, "app");
    const kind: unknown = Reflect.get(value, "kind");
    const name: unknown = Reflect.get(value, "name");
    const surface: unknown = Reflect.get(value, "surface");
    const route: unknown = Reflect.get(value, "route");
    if (version !== 1 || app !== "oghmanotes" || surface !== "web") return null;
    const approvedRoute = ROUTES.find((candidate) => candidate === route);
    if (!approvedRoute) return null;
    if (kind === "count") {
      const approvedName = COUNT_NAMES.find((candidate) => candidate === name);
      return approvedName ? telemetryEvent({ kind, name: approvedName, route: approvedRoute }) : null;
    }
    if (kind === "error") {
      const approvedName = ERROR_NAMES.find((candidate) => candidate === name);
      return approvedName ? telemetryEvent({ kind, name: approvedName, route: approvedRoute }) : null;
    }
    return null;
  } catch { return null; }
}

export function telemetryEndpoint(value: string | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("//") && /^\/[a-zA-Z0-9/_-]+$/.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash ? url.href : null;
  } catch { return null; }
}

export function hasPrivacySignal(request: Request): boolean {
  const dnt = request.headers.get("dnt")?.toLowerCase();
  return request.headers.get("sec-gpc") === "1" || dnt === "1" || dnt === "yes";
}

// counts are aggregated by the configured collector, retained for 30 days or 14 for errors
export function createTelemetrySender(configuration: () => { enabled: boolean; endpoint?: string; allowed: boolean }, mode: "client" | "proxy" = "client") {
  let inFlight = false;
  let total = 0;
  let windowStart = 0;
  let windowCount = 0;
  const errors = new Map<string, number>();
  return async (input: unknown): Promise<boolean> => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let acquired = false;
    try {
      const config = configuration();
      const endpoint = telemetryEndpoint(config.endpoint);
      if (!config.enabled || !config.allowed || !endpoint || inFlight || (mode === "client" && total >= 200)) return false;
      const event = parseTelemetryEvent(input);
      if (!event) return false;
      const now = Date.now();
      if (now - windowStart >= 60_000) { windowStart = now; windowCount = 0; }
      if (windowCount >= 20) return false;
      const key = `${event.name}:${event.route}`;
      const previousError = errors.get(key);
      if (mode === "client" && event.kind === "error" && previousError !== undefined && now - previousError < 60_000) return false;
      const body = JSON.stringify(event);
      if (new TextEncoder().encode(body).byteLength > 1024) return false;
      const controller = new AbortController();
      inFlight = acquired = true;
      total += 1;
      windowCount += 1;
      if (mode === "client" && event.kind === "error") errors.set(key, now);
      timeout = setTimeout(() => controller.abort(), 2000);
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" }, body,
        credentials: "omit", referrerPolicy: "no-referrer", redirect: "error", signal: controller.signal,
      });
      return response.ok;
    } catch { return false; }
    finally {
      if (timeout !== undefined) clearTimeout(timeout);
      if (acquired) inFlight = false;
    }
  };
}
