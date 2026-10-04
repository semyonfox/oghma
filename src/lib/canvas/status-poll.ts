export const DEFAULT_CANVAS_POLL_MS = 3_000;
const requests = new Map<string, Promise<Response>>();

export function canvasPollInterval(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1_000 && value <= 60_000
    ? value : DEFAULT_CANVAS_POLL_MS;
}

/** Settings and the global indicator share an in-flight status request. */
export async function fetchCanvasStatus(url: string, signal: AbortSignal): Promise<Response> {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  let request = requests.get(url);
  if (!request) {
    request = fetch(url).finally(() => requests.delete(url));
    requests.set(url, request);
  }
  const response = await request;
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  return response.clone();
}
