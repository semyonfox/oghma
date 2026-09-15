import { afterEach, expect, it, vi } from "vitest";
import { canvasPollInterval, fetchCanvasStatus } from "@/lib/canvas/status-poll";

afterEach(() => vi.unstubAllGlobals());

it("shares simultaneous status requests without sharing body consumption or cancellation", async () => {
  let complete!: (response: Response) => void;
  const request = new Promise<Response>((resolve) => { complete = resolve; });
  const fetch = vi.fn().mockReturnValue(request);
  vi.stubGlobal("fetch", fetch);
  const cancelled = new AbortController();
  const first = fetchCanvasStatus("/test-status", cancelled.signal);
  const second = fetchCanvasStatus("/test-status", new AbortController().signal);
  const third = fetchCanvasStatus("/test-status", new AbortController().signal);
  cancelled.abort();
  const rejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
  complete(Response.json({ completed: 2 }));
  await rejected;
  expect(await (await second).json()).toEqual({ completed: 2 });
  expect(await (await third).json()).toEqual({ completed: 2 });
  expect(fetch).toHaveBeenCalledTimes(1);
  await fetchCanvasStatus("/test-status", new AbortController().signal);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("accepts bounded server intervals and falls back for invalid input", () => {
  expect(canvasPollInterval(5000)).toBe(5000);
  for (const value of [0, 999, 60001, NaN, "5000", null]) expect(canvasPollInterval(value)).toBe(3000);
});
