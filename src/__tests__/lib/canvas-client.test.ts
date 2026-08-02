import { afterEach, describe, expect, it, vi } from "vitest";
import { CanvasClient } from "@/lib/canvas/client.js";

const STRING_IDS_ACCEPT = "application/json+canvas-string-ids";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CanvasClient string-ID requests", () => {
  it("requests and preserves string IDs for a single response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "9007199254740993" }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new CanvasClient(
      "example.instructure.com",
      "token",
    ).getCourse("9007199254740993");

    expect(result.data.id).toBe("9007199254740993");
    expect(fetchMock.mock.calls[0][1].headers.Accept).toBe(STRING_IDS_ACCEPT);
  });

  it("sends the string-ID Accept header on every paginated request", async () => {
    const nextUrl = "https://example.instructure.com/api/v1/courses?page=2";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: "9007199254740993" }]), {
          status: 200,
          headers: { Link: `<${nextUrl}>; rel="next"` },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: "9007199254740994" }]), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new CanvasClient(
      "example.instructure.com",
      "token",
    ).getCourses();

    expect(result.data.map((course: { id: string }) => course.id)).toEqual([
      "9007199254740993",
      "9007199254740994",
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.headers.Accept).toBe(STRING_IDS_ACCEPT);
    }
  });
});
