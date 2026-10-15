import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createInternalMcpToken } from "@/lib/auth/internal-mcp-token";

const { mockLoadCredentials, mockPropose, mockSafeFetch } = vi.hoisted(() => ({
  mockLoadCredentials: vi.fn(),
  mockPropose: vi.fn(),
  mockSafeFetch: vi.fn(),
}));

vi.mock("@/lib/canvas/credentials", () => ({
  loadCanvasCredentials: mockLoadCredentials,
}));
vi.mock("@/lib/chat/actions", () => ({
  proposeToolAction: mockPropose,
}));
vi.mock("@/lib/canvas/safe-fetch", () => ({
  safeCanvasFetch: mockSafeFetch,
}));
vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { POST } from "@/app/api/mcp/canvas/route";

const USER_ID = "4f0c5b8e-7c1d-4a3e-9b2a-1d2e3f4a5b6c";

function mcpRequest(
  method: string,
  params: unknown,
  authorization: string | null = `Bearer ${createInternalMcpToken(USER_ID)}`,
) {
  return new NextRequest("http://localhost/api/mcp/canvas", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(authorization ? { authorization } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}

type RpcBody = {
  result?: {
    tools?: Array<{ name: string }>;
    content?: Array<{ text: string }>;
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadCredentials.mockResolvedValue({
    domain: "school.instructure.com",
    token: "canvas-token",
  });
  mockSafeFetch.mockImplementation(
    async () => new Response(JSON.stringify({ id: "7", name: "Student" })),
  );
});

describe("POST /api/mcp/canvas", () => {
  it("requires a valid internal token before touching credentials", async () => {
    expect((await POST(mcpRequest("tools/list", {}, null))).status).toBe(401);
    expect(
      (await POST(mcpRequest("tools/list", {}, "Bearer forged"))).status,
    ).toBe(401);
    expect(mockLoadCredentials).not.toHaveBeenCalled();
  });

  it("returns 403 when the user has no Canvas connection", async () => {
    mockLoadCredentials.mockResolvedValue(null);
    const res = await POST(mcpRequest("tools/list", {}));
    expect(res.status).toBe(403);
    expect(mockLoadCredentials).toHaveBeenCalledWith(USER_ID);
  });

  it("lists only the student profile", async () => {
    const res = await POST(mcpRequest("tools/list", {}));
    const names = ((await res.json()) as RpcBody).result?.tools?.map(
      (tool) => tool.name,
    );
    expect(names).toContain("canvas_list_courses");
    expect(names).toContain("canvas_send_conversation");
    expect(names).not.toContain("canvas_create_course");
    expect(names).not.toContain("canvas_grade_submission");
  });

  it("runs read-only tools against the caller's own Canvas connection", async () => {
    const res = await POST(
      mcpRequest("tools/call", { name: "canvas_get_my_profile", arguments: {} }),
    );
    const body = (await res.json()) as RpcBody;

    expect(body.result?.isError).toBeFalsy();
    expect(body.result?.structuredContent).toEqual({
      id: "7",
      name: "Student",
    });
    const [url, headers, , init] = mockSafeFetch.mock.calls[0];
    expect(url).toBe("https://school.instructure.com/api/v1/users/self/profile");
    expect(headers.authorization).toBe("Bearer canvas-token");
    expect(init.method).toBe("GET");
  });

  it("turns a write into a stored proposal without calling Canvas", async () => {
    const proposal = {
      requiresConfirmation: true,
      actionId: "a1",
      reviewUrl: "/chat/actions/a1",
      message: "The action has not run.",
    };
    mockPropose.mockResolvedValue(proposal);

    const res = await POST(
      mcpRequest("tools/call", {
        name: "canvas_send_conversation",
        arguments: { recipients: ["12"], body: "hello" },
      }),
    );
    const body = (await res.json()) as RpcBody;

    expect(body.result?.structuredContent).toEqual(proposal);
    expect(mockPropose).toHaveBeenCalledWith(
      USER_ID,
      null,
      "canvas_send_conversation",
      { recipients: ["12"], body: "hello" },
    );
    expect(mockSafeFetch).not.toHaveBeenCalled();
  });

  it("refuses disabled educator tools outright", async () => {
    const res = await POST(
      mcpRequest("tools/call", {
        name: "canvas_create_course",
        arguments: { account_id: "1", name: "x" },
      }),
    );
    const text = await res.text();

    expect(text).toMatch(/not found|unknown/i);
    expect(mockPropose).not.toHaveBeenCalled();
    expect(mockSafeFetch).not.toHaveBeenCalled();
  });
});
