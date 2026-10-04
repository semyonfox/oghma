import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ configured: true, forward: vi.fn() }));
vi.mock("@/lib/marketing/events", () => ({ telemetryServerConfigured: () => mocks.configured, forwardTelemetry: mocks.forward }));
import { POST } from "@/app/api/marketing/events/route";
const event = { version: 1, app: "oghmanotes", kind: "count", name: "screen_view", surface: "web", route: "home" };
function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/marketing/events", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}
beforeEach(() => { vi.clearAllMocks(); mocks.configured = true; mocks.forward.mockResolvedValue(false); });
describe("anonymous ingestion privacy boundary", () => {
  it.each<Record<string, string>>([{ DNT: "1" }, { DNT: "YES" }, { "Sec-GPC": "1" }])("accepts privacy signals without forwarding", async (headers) => {
    expect((await POST(request(event, headers))).status).toBe(204);
    expect(mocks.forward).not.toHaveBeenCalled();
  });
  it("does not read the request body while disabled", async () => {
    mocks.configured = false;
    const input = request(event);
    const read = vi.fn(() => { throw new Error("body must stay unread"); });
    Object.defineProperty(input, "body", { get: read });
    expect((await POST(input)).status).toBe(204);
    expect(read).not.toHaveBeenCalled();
    expect(mocks.forward).not.toHaveBeenCalled();
  });
  it("forwards exactly the six fields and fails harmlessly when the collector is unavailable", async () => {
    expect((await POST(request(event))).status).toBe(204);
    expect(mocks.forward).toHaveBeenCalledExactlyOnceWith(event);
  });
  it("rejects identity, URL and free-text fields rather than filtering them into storage", async () => {
    expect((await POST(request({ ...event, userId: "private-user", path: "/notes/private", referrer: "https://private.example", message: "private note" }))).status).toBe(400);
    expect(mocks.forward).not.toHaveBeenCalled();
  });
});
