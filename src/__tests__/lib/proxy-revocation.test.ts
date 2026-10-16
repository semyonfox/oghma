import { expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

function visit(path: string, cookie?: string) {
  return proxy(
    new NextRequest(`https://example.test${path}`, {
      headers: cookie ? { Cookie: cookie } : {},
    }),
  );
}

it.each(["/login", "/register"])(
  "keeps %s reachable with revoked or pre-migration cookies",
  async (path) => {
    const response = await visit(path, "session=revoked; authjs.session-token=revoked");
    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
  },
);

it("treats a chunked Auth.js session as signed in", async () => {
  const response = await visit("/notes", "__Secure-authjs.session-token.0=part");
  expect(response.headers.get("location")).toBeNull();
});

it("ignores unrelated and empty cookies", async () => {
  const response = await visit("/notes", "session=; authjs.csrf-token=abc");
  expect(response.headers.get("location")).toBe("https://example.test/login");
});

it("answers signed-out API calls with 401 JSON instead of the login page", async () => {
  const response = await visit("/api/notes");
  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
});

// a matcher for a deleted route keeps running the proxy for nothing and hides
// that the protection list has drifted from the app
it("only matches api routes that still exist", async () => {
  const { existsSync } = await import("node:fs");
  const { config } = await import("@/proxy");
  const apiRoots = config.matcher
    .filter((entry) => entry.startsWith("/api/"))
    .map((entry) => entry.replace(/\/:path\*$/, ""));
  expect(apiRoots.length).toBeGreaterThan(0);
  for (const root of apiRoots) {
    expect(existsSync(`src/app${root}`), root).toBe(true);
  }
});
