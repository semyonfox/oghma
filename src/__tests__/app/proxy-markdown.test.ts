import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { proxy } from "@/proxy";

describe("markdown content negotiation proxy", () => {
  it("rewrites /info to compact markdown when requested by Accept header", async () => {
    const response = await proxy(
      new NextRequest("https://oghmanotes.ie/info", {
        headers: { accept: "text/markdown" },
      }),
    );

    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://oghmanotes.ie/info.md",
    );
    expect(response.headers.get("vary")).toBe("Accept");
  });

  it("rewrites /ai and /pricing to markdown when requested by format query", async () => {
    const aiResponse = await proxy(
      new NextRequest("https://oghmanotes.ie/ai?format=md"),
    );
    const pricingResponse = await proxy(
      new NextRequest("https://oghmanotes.ie/pricing?format=markdown"),
    );

    expect(aiResponse.headers.get("x-middleware-rewrite")).toBe(
      "https://oghmanotes.ie/ai.md",
    );
    expect(pricingResponse.headers.get("x-middleware-rewrite")).toBe(
      "https://oghmanotes.ie/pricing.md",
    );
  });
});
