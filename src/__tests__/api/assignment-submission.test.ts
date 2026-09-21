import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ sql: vi.fn(), auth: vi.fn(), credentials: vi.fn(), assignment: vi.fn(), fetch: vi.fn() }));
vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));
vi.mock("@/lib/auth", () => ({ validateSession: mocks.auth, validateSessionLite: mocks.auth }));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/canvas/credentials", () => ({ loadCanvasCredentials: mocks.credentials }));
vi.mock("@/lib/canvas/client", () => ({ CanvasClient: class {
  baseUrl = "https://school.instructure.com/api/v1";
  token = "test-token";
  getAssignment = mocks.assignment;
} }));
import { GET, POST } from "@/app/api/assignments/[id]/canvas/route";
const id = "123e4567-e89b-42d3-a456-426614174001";
const userId = "123e4567-e89b-42d3-a456-426614174002";
const context = { params: Promise.resolve({ id }) };
function request(body: unknown) {
  return new NextRequest(`http://localhost/api/assignments/${id}/canvas`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
}
describe("Canvas assignment submissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.auth.mockResolvedValue({ user_id: userId, email: "student@example.com" });
    mocks.sql.mockResolvedValue([{ canvas_course_id: "123", canvas_assignment_id: "456" }]);
    mocks.credentials.mockResolvedValue({ domain: "school.instructure.com", token: "test-token" });
    mocks.assignment.mockResolvedValue({ data: { id: "456", name: "Essay", submission_types: ["online_text_entry", "online_url"] } });
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ id: "789", workflow_state: "submitted" }), { status: 201 }));
  });
  afterEach(() => vi.unstubAllGlobals());
  it("returns details without credentials and scopes the lookup to the user", async () => {
    const response = await GET(new NextRequest(`http://localhost/api/assignments/${id}/canvas`), context);
    expect(await response.json()).toEqual({ url: "https://school.instructure.com/courses/123/assignments/456", description: null, types: ["online_text_entry", "online_url"], locked: false, submittedAt: null });
    expect(mocks.sql.mock.calls[0]).toContain(userId);
  });
  it("does not access Canvas for another user's or missing assignment", async () => {
    mocks.sql.mockResolvedValue([]);
    expect((await POST(request({ type: "online_text_entry", content: "Essay" }), context)).status).toBe(404);
    expect(mocks.credentials).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it.each([
    { type: "online_url", content: "javascript:alert(1)" },
    { type: "online_text_entry", content: "   " },
    { type: "online_upload", content: "123" },
  ])("rejects invalid input %j", async body => {
    expect((await POST(request(body), context)).status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("rechecks the accepted type before sending", async () => {
    mocks.assignment.mockResolvedValue({ data: { submission_types: ["online_upload"] } });
    expect((await POST(request({ type: "online_text_entry", content: "Essay" }), context)).status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("rejects locked assignments", async () => {
    mocks.assignment.mockResolvedValue({ data: { locked_for_user: true, submission_types: ["online_text_entry"] } });
    expect((await POST(request({ type: "online_text_entry", content: "Essay" }), context)).status).toBe(409);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("submits text as escaped HTML to the stored assignment", async () => {
    expect((await POST(request({ type: "online_text_entry", content: "a < b\n& c" }), context)).status).toBe(200);
    expect(mocks.fetch).toHaveBeenCalledWith("https://school.instructure.com/api/v1/courses/123/assignments/456/submissions", expect.objectContaining({ method: "POST", body: JSON.stringify({ submission: { submission_type: "online_text_entry", body: "<p>a &lt; b<br>&amp; c</p>" } }) }));
  });
  it("submits a website URL", async () => {
    expect((await POST(request({ type: "online_url", content: "https://example.com/work" }), context)).status).toBe(200);
    expect(mocks.fetch.mock.calls[0][1].body).toBe(JSON.stringify({ submission: { submission_type: "online_url", url: "https://example.com/work" } }));
  });
  it("does not retry a write after a lost response", async () => {
    mocks.fetch.mockRejectedValue(new Error("connection lost"));
    const response = await POST(request({ type: "online_text_entry", content: "Essay" }), context);
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("Check Canvas") });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
});
