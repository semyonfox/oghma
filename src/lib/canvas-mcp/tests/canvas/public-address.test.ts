import { describe, expect, it } from "vitest";
import { isPublicIpv4 } from "../../src/canvas/public-fetch.ts";

describe("canvas-mcp public address guard", () => {
  it("rejects loopback, link-local, private and metadata ranges", () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "0.0.0.0",
      "100.64.0.1",
      "224.0.0.1",
      "::1",
      "not-an-ip",
    ]) {
      expect(isPublicIpv4(address), address).toBe(false);
    }
    expect(isPublicIpv4("1.1.1.1")).toBe(true);
    expect(isPublicIpv4("8.8.8.8")).toBe(true);
  });
});
