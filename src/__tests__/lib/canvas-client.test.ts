import { afterEach, describe, expect, it, vi } from "vitest";
import { CanvasClient } from "@/lib/canvas/client.js";

const STRING_IDS_ACCEPT = "application/json+canvas-string-ids";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.CANVAS_MAX_FILE_BYTES;
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

  it("follows an opaque next Link when rel is not its first parameter", async () => {
    const nextUrl = "https://example.instructure.com/api/v1/courses?page=2&opaque=a%2Cb";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: "9007199254740993" }]), {
          status: 200,
          headers: {
            Link: `<https://example.instructure.com/api/v1/courses?page=1>; rel="current", <${nextUrl}>; type="application/json"; rel="next"`,
          },
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
    expect(fetchMock.mock.calls[1][0]).toBe(nextUrl);
  });

  it("enumerates self enrollments with the complete non-deleted state contract", async () => {
    const nextUrl =
      "https://example.instructure.com/api/v1/users/self/enrollments?opaque=next";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([{ id: "1", course_id: "9007199254740993" }]),
          {
            status: 200,
            headers: { Link: `<${nextUrl}>; rel="next"` },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([{ id: "2", course_id: "9007199254740994" }]),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new CanvasClient(
      "example.instructure.com",
      "token",
    ).getSelfEnrollments();

    const initialUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(initialUrl.pathname).toBe("/api/v1/users/self/enrollments");
    expect(initialUrl.searchParams.getAll("state[]")).toEqual([
      "current_and_future",
      "completed",
      "inactive",
    ]);
    expect(initialUrl.searchParams.get("per_page")).toBe("100");
    expect(initialUrl.href).not.toContain("current_future_and_restricted");
    expect(result.data.map((enrollment: { course_id: string }) => enrollment.course_id)).toEqual([
      "9007199254740993",
      "9007199254740994",
    ]);
    expect(fetchMock.mock.calls[1][0]).toBe(nextUrl);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.headers.Accept).toBe(STRING_IDS_ACCEPT);
      expect(init.headers.Authorization).toBe("Bearer token");
    }
  });

  it("rejects a cross-origin next Link before sending Canvas authorization", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ id: "1", course_id: "42" }]), {
        status: 200,
        headers: {
          Link: '<https://attacker.example/api/v1/enrollments?page=2>; rel="next"',
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new CanvasClient(
      "example.instructure.com",
      "token",
    ).getSelfEnrollments();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      data: [{ id: "1", course_id: "42" }],
      forbidden: false,
      error: "Canvas API returned an unsafe pagination URL",
    });
  });

  it("returns a structured unauthorized flag for an expired enrollment token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await new CanvasClient(
      "example.instructure.com",
      "token",
    ).getSelfEnrollments();

    expect(result).toEqual({
      data: [],
      forbidden: false,
      unauthorized: true,
      error: "Invalid or expired Canvas token",
    });
  });

  it("retries a rate-limited 403 when Canvas reports no remaining quota", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 403,
          headers: {
            "X-Rate-Limit-Remaining": "0",
            "Retry-After": "0",
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: "1", course_id: "42" }]), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new CanvasClient(
      "example.instructure.com",
      "token",
    ).getSelfEnrollments();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      data: [{ id: "1", course_id: "42" }],
      forbidden: false,
    });
  });

  it("merges active, pending, and completed courses without duplicating IDs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: "1", name: "Current" }]), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: "2", name: "Pending" }]), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { id: "1", name: "Current" },
            { id: "3", name: "Completed" },
          ]),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new CanvasClient(
      "example.instructure.com",
      "token",
    ).getDiscoverableCourses();

    expect(result.data.map((course: { id: string }) => course.id)).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      expect.stringContaining("enrollment_state=active"),
      expect.stringContaining("enrollment_state=invited_or_pending"),
      expect.stringContaining("enrollment_state=completed"),
    ]);
  });

  it("uses the paginated Files inventory for standalone course documents", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ id: "9007199254740995" }]), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new CanvasClient(
      "example.instructure.com",
      "token",
    ).getCourseFiles("9007199254740993");

    expect(result.data).toEqual([{ id: "9007199254740995" }]);
    expect(fetchMock.mock.calls[0][0]).toContain(
      "/courses/9007199254740993/files?per_page=100",
    );
  });

  it("stops an unknown-length file download once the byte cap is crossed", async () => {
    process.env.CANVAS_MAX_FILE_BYTES = "4";
    vi.resetModules();
    const { CanvasClient: BoundedCanvasClient } = await import(
      "@/lib/canvas/client.js"
    );
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.enqueue(new Uint8Array([4, 5, 6]));
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await new BoundedCanvasClient(
      "example.instructure.com",
      "token",
    ).downloadFile("https://files.example/document.pdf");

    expect(result).toMatchObject({
      buffer: null,
      forbidden: false,
      error: expect.stringContaining("CANVAS_MAX_FILE_BYTES"),
    });
  });
});
