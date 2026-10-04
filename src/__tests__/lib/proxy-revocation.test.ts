import { expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
it.each(["/login", "/register"])(
  "keeps %s reachable with revoked or pre-migration cookies",
  async (path) => {
    const response = await proxy(
      new NextRequest(`https://example.test${path}`, {
        headers: { Cookie: "session=revoked; authjs.session-token=revoked" },
      }),
    );
    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
  },
);
