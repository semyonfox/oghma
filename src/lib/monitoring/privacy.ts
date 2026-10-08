import type { ErrorEvent, StreamedSpanJSON } from "@sentry/core";

// unknown path segments can contain note titles, share tokens or storage keys
const routeSegments = new Set(
  "api notes study-maps topics materials jobs classify taxonomy chat messages generate canvas import export upload download extract health search global-search auth login register settings calendar ical files folders vault quizzes quiz assignments dashboard privacy help feedback sentry-check".split(
    " ",
  ),
);

export function monitoringPath(value: string): string {
  try {
    const path = new URL(value, "https://oghmanotes.ie").pathname;
    return path
      .split("/")
      .map((part) => (!part || routeSegments.has(part) ? part : "[id]"))
      .join("/");
  } catch {
    return "/[unknown]";
  }
}

export function sanitizeError(event: ErrorEvent): ErrorEvent {
  const trace = event.contexts?.trace;
  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    level: event.level,
    platform: event.platform,
    release: event.release,
    environment: event.environment,
    sdk: event.sdk,
    debug_meta: event.debug_meta,
    // an absent IP can still be geolocated during ingestion
    user: { ip_address: "0.0.0.0" },
    // messages can contain document text or provider response bodies
    message: event.exception ? undefined : "Application operation failed",
    exception: event.exception && {
      values: event.exception.values?.map((exception) => ({
        type:
          exception.type?.match(/^[A-Za-z][A-Za-z0-9_.]{0,79}$/)?.[0] ??
          "Error",
        value: "Error details withheld; inspect the stack and operation",
        mechanism: exception.mechanism && {
          type: exception.mechanism.type,
          handled: exception.mechanism.handled,
        },
        stacktrace: exception.stacktrace && {
          frames: exception.stacktrace.frames?.map((frame) => ({
            filename: frame.filename?.split(/[?#]/, 1)[0],
            function: frame.function,
            lineno: frame.lineno,
            colno: frame.colno,
            in_app: frame.in_app,
            module: frame.module,
          })),
        },
      })),
    },
    contexts: trace
      ? {
          trace: {
            trace_id: trace.trace_id,
            span_id: trace.span_id,
            parent_span_id: trace.parent_span_id,
            op: trace.op,
            status: trace.status,
          },
        }
      : undefined,
    tags: {
      service: event.tags?.service,
      operation: event.tags?.operation,
    },
    request: event.request && {
      method: event.request.method,
      url: event.request.url ? monitoringPath(event.request.url) : undefined,
    },
  };
}

const spanAttributes = new Set([
  "sentry.op",
  "sentry.origin",
  "sentry.kind",
  "sentry.sample_rate",
  "sentry.segment.name.source",
  "sentry.release",
  "sentry.environment",
  "service.name",
  "deployment.environment.name",
  "http.request.method",
  "http.response.status_code",
  "http.method",
  "http.status_code",
  "db.system",
  "db.system.name",
  "db.operation.name",
  "messaging.system",
  "messaging.operation.name",
  "server.port",
  "gen_ai.operation.name",
  "gen_ai.request.model",
  "gen_ai.response.model",
  "gen_ai.usage.input_tokens",
  "gen_ai.usage.output_tokens",
]);

export function sanitizeSpan(span: StreamedSpanJSON): StreamedSpanJSON {
  const op =
    typeof span.attributes["sentry.op"] === "string"
      ? span.attributes["sentry.op"]
      : "operation";
  const route = span.attributes["http.route"];
  const method =
    span.attributes["http.request.method"] ?? span.attributes["http.method"];
  const manual =
    /^(study\.(classify|taxonomy|paper)|worker\.(canvas|chat)|sentry\.verify)$/.test(
      span.name,
    );
  const name = manual
    ? span.name
    : typeof route === "string"
      ? `${typeof method === "string" ? method : op} ${monitoringPath(route)}`
      : /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) /.test(span.name)
        ? `${span.name.split(" ", 1)[0]} ${monitoringPath(span.name.slice(span.name.indexOf(" ") + 1))}`
        : op === "pageload" || op === "navigation"
          ? `${op} ${monitoringPath(span.name)}`
          : op;
  return {
    trace_id: span.trace_id,
    span_id: span.span_id,
    parent_span_id: span.parent_span_id,
    name,
    start_timestamp: span.start_timestamp,
    end_timestamp: span.end_timestamp,
    status: span.status,
    is_segment: span.is_segment,
    attributes: Object.fromEntries(
      Object.entries(span.attributes).filter(([key]) =>
        spanAttributes.has(key),
      ),
    ),
  };
}

export const privateDataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
  frameContextLines: 0,
};
