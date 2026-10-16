import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  agentOptions: null as unknown,
  fetch: vi.fn(),
  lookup: vi.fn(),
}));

vi.mock("undici", () => ({
  Agent: vi.fn(function Agent(options: unknown) {
    mocks.agentOptions = options;
  }),
  fetch: mocks.fetch,
}));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));

import {
  CanvasRequestTimeoutError,
  isPublicIpv4,
  safeCanvasFetch,
} from "@/lib/canvas/safe-fetch";

beforeEach(() => {
  mocks.fetch.mockReset();
  mocks.lookup.mockReset();
});

describe("Canvas request guard", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "100.64.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "192.0.2.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
  ])("blocks non-public IP %s", (address) => {
    expect(isPublicIpv4(address)).toBe(false);
  });

  it("pins a public DNS result and rejects a private one", async () => {
    const lookup = (mocks.agentOptions as {
      connect: {
        lookup: (
          hostname: string,
          options: { all: boolean },
          callback: (error: Error | null, addresses: unknown) => void,
        ) => void;
      };
    }).connect.lookup;

    mocks.lookup.mockResolvedValueOnce([{ address: "1.1.1.1", family: 4 }]);
    const publicResult = await new Promise<{ error: Error | null; addresses: unknown }>((resolve) => {
      lookup("canvas.university.edu", { all: true }, (error, addresses) => {
        resolve({ error, addresses });
      });
    });
    expect(mocks.lookup).toHaveBeenCalledWith("canvas.university.edu", {
      all: true,
      family: 4,
    });
    expect(publicResult).toEqual({
      error: null,
      addresses: [{ address: "1.1.1.1", family: 4 }],
    });

    mocks.lookup.mockResolvedValueOnce([{ address: "169.254.169.254", family: 4 }]);
    const privateResult = await new Promise<Error | null>((resolve) => {
      lookup("canvas.university.edu", { all: true }, (error) => resolve(error));
    });
    expect(privateResult?.message).toMatch(/public IPv4 address/);
  });

  it("rejects a host without a public IPv4 answer", async () => {
    const lookup = (mocks.agentOptions as {
      connect: {
        lookup: (
          hostname: string,
          options: { all: boolean },
          callback: (error: Error | null) => void,
        ) => void;
      };
    }).connect.lookup;
    mocks.lookup.mockResolvedValueOnce([]);

    const error = await new Promise<Error | null>((resolve) => {
      lookup("ipv6-only.university.edu", { all: true }, resolve);
    });

    expect(error?.message).toMatch(/public IPv4 address/);
  });

  it("does not follow a redirect on an authenticated API request", async () => {
    mocks.fetch.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "https://other.example.edu/api/v1/users/self" },
      }),
    );

    await safeCanvasFetch(
      "https://canvas.university.edu/api/v1/users/self",
      { Authorization: "Bearer token" },
    );

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch.mock.calls[0][1].redirect).toBe("manual");
  });

  it("applies the same guard to a Canvas submission POST", async () => {
    mocks.fetch.mockResolvedValueOnce(new Response("{}"));
    const signal = AbortSignal.timeout(30_000);

    await safeCanvasFetch(
      "https://canvas.university.edu/api/v1/courses/1/assignments/2/submissions",
      { Authorization: "Bearer token" },
      false,
      { method: "POST", body: '{"submission":{}}', signal },
    );

    expect(mocks.fetch.mock.calls[0][1]).toMatchObject({
      method: "POST",
      body: '{"submission":{}}',
      redirect: "manual",
    });
  });

  it("aborts with the caller's signal as well as its own deadline", async () => {
    mocks.fetch.mockResolvedValueOnce(new Response("{}"));
    const caller = new AbortController();

    await safeCanvasFetch(
      "https://canvas.university.edu/api/v1/users/self",
      {},
      false,
      { signal: caller.signal },
    );
    const sent: AbortSignal = mocks.fetch.mock.calls[0][1].signal;
    expect(sent.aborted).toBe(false);

    caller.abort(new Error("client went away"));
    expect(sent.aborted).toBe(true);
  });

  // undici's idle timeouts reset on every chunk, so a slow-drip response needs
  // an overall deadline. undici keeps the signal on the response stream, so
  // aborting it also fails a body read that is still in progress
  it("aborts the request signal once its deadline passes", async () => {
    vi.useFakeTimers();
    process.env.CANVAS_REQUEST_TIMEOUT_MS = "5000";
    try {
      mocks.fetch.mockResolvedValueOnce(new Response("[]"));

      await safeCanvasFetch("https://canvas.university.edu/api/v1/courses", {});
      const sent: AbortSignal = mocks.fetch.mock.calls[0][1].signal;
      await vi.advanceTimersByTimeAsync(4_999);
      expect(sent.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);

      expect(sent.aborted).toBe(true);
      expect(sent.reason).toBeInstanceOf(CanvasRequestTimeoutError);
      expect(sent.reason).toMatchObject({ code: "CANVAS_REQUEST_TIMEOUT" });
    } finally {
      delete process.env.CANVAS_REQUEST_TIMEOUT_MS;
      vi.useRealTimers();
    }
  });

  it("gives file downloads their own longer deadline", async () => {
    vi.useFakeTimers();
    process.env.CANVAS_REQUEST_TIMEOUT_MS = "5000";
    process.env.CANVAS_DOWNLOAD_TIMEOUT_MS = "20000";
    try {
      mocks.fetch.mockResolvedValueOnce(new Response("pdf"));

      await safeCanvasFetch("https://canvas.university.edu/files/1/download", {}, true);
      const sent: AbortSignal = mocks.fetch.mock.calls[0][1].signal;
      await vi.advanceTimersByTimeAsync(5_000);
      expect(sent.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(15_000);
      expect(sent.aborted).toBe(true);
    } finally {
      delete process.env.CANVAS_REQUEST_TIMEOUT_MS;
      delete process.env.CANVAS_DOWNLOAD_TIMEOUT_MS;
      vi.useRealTimers();
    }
  });

  it("drops authorization when a file redirects to another public host", async () => {
    mocks.fetch
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://files.example.edu/document.pdf" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://canvas.university.edu/files/1" },
        }),
      )
      .mockResolvedValueOnce(new Response("file"));

    await safeCanvasFetch(
      "https://canvas.university.edu/files/1/download",
      { Authorization: "Bearer token" },
      true,
    );

    expect(mocks.fetch).toHaveBeenCalledTimes(3);
    expect(mocks.fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer token");
    expect(mocks.fetch.mock.calls[1][1].headers).not.toHaveProperty("Authorization");
    expect(mocks.fetch.mock.calls[2][1].headers).not.toHaveProperty("Authorization");
  });

  it("bounds how long a stalled Canvas response can hold a connection", () => {
    expect(mocks.agentOptions).toMatchObject({
      headersTimeout: 30_000,
      bodyTimeout: 60_000,
    });
  });

  // net.connect skips the custom lookup for IP literals, so these must be
  // rejected before any request is made
  it.each([
    "https://127.0.0.1/api/v1/users/self",
    "https://2130706433/api/v1/users/self",
    "https://0x7f.1/api/v1/users/self",
    "https://[::1]/api/v1/users/self",
  ])("rejects IP literal host %s before connecting", async (url) => {
    await expect(safeCanvasFetch(url, {})).rejects.toThrow();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("rejects a file redirect to an internal address", async () => {
    mocks.fetch.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "https://169.254.169.254/latest/meta-data" },
      }),
    );

    await expect(
      safeCanvasFetch("https://canvas.university.edu/files/1", {}, true),
    ).rejects.toThrow("unsafe URL");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
});
