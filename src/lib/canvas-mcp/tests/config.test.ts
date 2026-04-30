import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.js";

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
    expect(cfg.logLevel).toBe("info");
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
