import { describe, it, expect, vi, beforeEach } from "vitest";

// mock transports and external deps to avoid filesystem/network side effects
vi.mock("winston-daily-rotate-file", () => ({ default: vi.fn() }));
vi.mock("winston-cloudwatch", () => {
  return { default: vi.fn().mockImplementation(() => ({})) };
});

// mock trace module to avoid AsyncLocalStorage complexity in tests
vi.mock("@/lib/trace", () => ({
  traceFormat: {
    transform: (info: Record<string, unknown>) => {
      info.traceId = "test-trace";
      return info;
    },
  },
}));

describe("logger", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("exports a default logger with standard log methods", async () => {
    const { default: logger } = await import("@/lib/logger");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.debug).toBe("function");
  });

  it("has a level property", async () => {
    const { default: logger } = await import("@/lib/logger");
    expect(typeof logger.level).toBe("string");
  });

  it("can call log methods without throwing", async () => {
    const { default: logger } = await import("@/lib/logger");
    expect(() => logger.info("test message")).not.toThrow();
    expect(() => logger.warn("warning", { key: "value" })).not.toThrow();
    expect(() => logger.error("error message", { code: 500 })).not.toThrow();
    expect(() => logger.debug("debug details")).not.toThrow();
  });
});

describe("redactSensitive", () => {
  it("is exported as a named export", async () => {
    const { redactSensitive } = await import("@/lib/logger");
    expect(redactSensitive).toBeDefined();
  });

  it("redacts known sensitive keys", async () => {
    const { redactSensitive } = await import("@/lib/logger");
    const info = {
      level: "info",
      message: "test",
      password: "secret123",
      token: "abc-token",
      authorization: "Bearer xyz",
    };

    const result = redactSensitive.transform(info as any) as Record<
      string,
      unknown
    >;
    expect(result.password).toBe("[REDACTED]");
    expect(result.token).toBe("[REDACTED]");
    expect(result.authorization).toBe("[REDACTED]");
    // non-sensitive keys preserved
    expect(result.message).toBe("test");
  });

  it("redacts case-insensitively", async () => {
    const { redactSensitive } = await import("@/lib/logger");
    const info = {
      level: "info",
      message: "test",
      Password: "secret",
      TOKEN: "abc",
    };

    const result = redactSensitive.transform(info as any) as Record<
      string,
      unknown
    >;
    expect(result.Password).toBe("[REDACTED]");
    expect(result.TOKEN).toBe("[REDACTED]");
  });

  it("redacts sensitive keys nested in objects", async () => {
    const { redactSensitive } = await import("@/lib/logger");
    const info = {
      level: "info",
      message: "test",
      user: {
        name: "Alice",
        password: "hunter2",
        canvas_token: "tok-xyz",
      },
    };

    const result = redactSensitive.transform(info as any) as Record<
      string,
      unknown
    >;
    const user = result.user as Record<string, unknown>;
    expect(user.name).toBe("Alice");
    expect(user.password).toBe("[REDACTED]");
    expect(user.canvas_token).toBe("[REDACTED]");
  });

  it("preserves non-sensitive data untouched", async () => {
    const { redactSensitive } = await import("@/lib/logger");
    const info = {
      level: "info",
      message: "user login",
      email: "user@example.com",
      status: 200,
    };

    const result = redactSensitive.transform(info as any) as Record<
      string,
      unknown
    >;
    expect(result.email).toBe("user@example.com");
    expect(result.status).toBe(200);
  });

  it("handles null and undefined values gracefully", async () => {
    const { redactSensitive } = await import("@/lib/logger");
    const info = {
      level: "info",
      message: "test",
      data: null,
      extra: undefined,
    };

    expect(() => redactSensitive.transform(info as any)).not.toThrow();
  });
});
