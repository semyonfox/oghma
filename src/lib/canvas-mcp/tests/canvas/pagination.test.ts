import { describe, it, expect, vi } from "vitest";
import { CanvasClient } from "../../src/canvas/client.js";

function page(items: unknown[], nextUrl?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (nextUrl) {
    headers.link = `<${nextUrl}>; rel="next", <https://x.instructure.com/api/v1/first>; rel="first"`;
  }
  return new Response(JSON.stringify(items), { status: 200, headers });
}

describe("CanvasClient.getPaginated", () => {
  it("follows Link rel=next until exhausted", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(page([1, 2], "https://x.instructure.com/api/v1/things?page=2"))
      .mockResolvedValueOnce(page([3, 4], "https://x.instructure.com/api/v1/things?page=3"))
      .mockResolvedValueOnce(page([5]));

    const client = new CanvasClient({ domain: "x.instructure.com", token: "t", fetch });
    const out: number[] = [];
    for await (const batch of client.getPaginated<number>("/api/v1/things")) {
      out.push(...batch);
    }
    expect(out).toEqual([1, 2, 3, 4, 5]);
    expect(fetch).toHaveBeenCalledTimes(3);
    for (const [, init] of fetch.mock.calls) {
      expect((init.headers as Headers).get("accept")).toBe(
        "application/json+canvas-string-ids",
      );
    }
  });

  it("collectPaginated returns flat array", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(page(["a"], "https://x.instructure.com/api/v1/y?page=2"))
      .mockResolvedValueOnce(page(["b"]));
    const client = new CanvasClient({ domain: "x.instructure.com", token: "t", fetch });
    const all = await client.collectPaginated<string>("/api/v1/y");
    expect(all).toEqual(["a", "b"]);
  });

  it("rejects a cross-origin Link before sending the bearer token", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(
      page([1], "https://other.example.edu/api/v1/things?page=2"),
    );
    const client = new CanvasClient({ domain: "x.instructure.com", token: "t", fetch });

    await expect(client.collectPaginated<number>("/api/v1/things")).rejects.toThrow(
      "Canvas pagination URL points to another host",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects a protocol-relative API path before fetching", async () => {
    const fetch = vi.fn();
    const client = new CanvasClient({ domain: "x.instructure.com", token: "t", fetch });

    await expect(client.get("//other.example.edu/api/v1/things")).rejects.toThrow(
      "Canvas path points to another host",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
