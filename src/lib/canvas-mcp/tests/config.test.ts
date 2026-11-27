import { describe, it, expect } from "vitest";
import { assertListenAllowed, loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("parses valid env", () => {
    const cfg = loadConfig({
      CANVAS_API_TOKEN: "tok",
      CANVAS_DOMAIN: "example.instructure.com",
      PORT: "4000",
      LOG_LEVEL: "debug",
    });
    expect(cfg.canvasApiToken).toBe("tok");
    expect(cfg.canvasDomain).toBe("example.instructure.com");
    expect(cfg.port).toBe(4000);
    expect(cfg.logLevel).toBe("debug");
  });

  it("defaults port and log level", () => {
    const cfg = loadConfig({
      CANVAS_API_TOKEN: "tok",
      CANVAS_DOMAIN: "example.instructure.com",
    });
    expect(cfg.port).toBe(3001);
    expect(cfg.host).toBe("127.0.0.1");
    expect(cfg.authToken).toBeUndefined();
    expect(cfg.logLevel).toBe("info");
  });

  it("refuses a public bind that would publish the env Canvas token", () => {
    const cfg = loadConfig({
      CANVAS_API_TOKEN: "tok",
      CANVAS_DOMAIN: "example.instructure.com",
      CANVAS_MCP_HOST: "0.0.0.0",
    });
    expect(() => assertListenAllowed(cfg)).toThrow(/CANVAS_MCP_AUTH_TOKEN/);
    expect(() => assertListenAllowed({
      ...cfg,
      authToken: "mcp-secret",
    })).not.toThrow();
  });

  it("returns undefined token and domain when not provided", () => {
    const cfg = loadConfig({});
    expect(cfg.canvasApiToken).toBeUndefined();
    expect(cfg.canvasDomain).toBeUndefined();
  });

  it("strips scheme from domain", () => {
    const cfg = loadConfig({
      CANVAS_API_TOKEN: "tok",
      CANVAS_DOMAIN: "https://example.instructure.com/",
    });
    expect(cfg.canvasDomain).toBe("example.instructure.com");
  });
});
