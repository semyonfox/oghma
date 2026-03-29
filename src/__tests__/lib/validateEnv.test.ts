import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// save originals so we can clean up
const originalEnv = { ...process.env };

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  // restore full env
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, originalEnv);
  vi.unstubAllEnvs();
});

function setEnv(overrides: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      vi.stubEnv(key, value);
    }
  }
}

async function loadValidateEnv() {
  const mod = await import("@/lib/validateEnv");
  return mod.validateEnv;
}

describe("validateEnv", () => {
  it("does not throw when all required vars are set (non-production)", async () => {
    setEnv({
      NODE_ENV: "test",
      DATABASE_URL: "postgres://localhost/test",
      JWT_SECRET: "test-secret",
      STORAGE_BUCKET: "my-bucket",
      STORAGE_REGION: "eu-north-1",
    });

    const validateEnv = await loadValidateEnv();
    expect(() => validateEnv()).not.toThrow();
  });

  it("throws when DATABASE_URL is missing", async () => {
    setEnv({
      NODE_ENV: "test",
      DATABASE_URL: undefined,
      JWT_SECRET: "test-secret",
      STORAGE_BUCKET: "my-bucket",
      STORAGE_REGION: "eu-north-1",
    });

    const validateEnv = await loadValidateEnv();
    expect(() => validateEnv()).toThrow("DATABASE_URL");
  });

  it("throws when JWT_SECRET is missing", async () => {
    setEnv({
      NODE_ENV: "test",
      DATABASE_URL: "postgres://localhost/test",
      JWT_SECRET: undefined,
      STORAGE_BUCKET: "my-bucket",
      STORAGE_REGION: "eu-north-1",
    });

    const validateEnv = await loadValidateEnv();
    expect(() => validateEnv()).toThrow("JWT_SECRET");
  });

  it("throws when STORAGE_BUCKET is missing", async () => {
    setEnv({
      NODE_ENV: "test",
      DATABASE_URL: "postgres://localhost/test",
      JWT_SECRET: "test-secret",
      STORAGE_BUCKET: undefined,
      STORAGE_REGION: "eu-north-1",
    });

    const validateEnv = await loadValidateEnv();
    expect(() => validateEnv()).toThrow("STORAGE_BUCKET");
  });

  it("throws when STORAGE_REGION is missing", async () => {
    setEnv({
      NODE_ENV: "test",
      DATABASE_URL: "postgres://localhost/test",
      JWT_SECRET: "test-secret",
      STORAGE_BUCKET: "my-bucket",
      STORAGE_REGION: undefined,
    });

    const validateEnv = await loadValidateEnv();
    expect(() => validateEnv()).toThrow("STORAGE_REGION");
  });

  it("lists all missing vars in the error message", async () => {
    setEnv({
      NODE_ENV: "test",
      DATABASE_URL: undefined,
      JWT_SECRET: undefined,
      STORAGE_BUCKET: undefined,
      STORAGE_REGION: undefined,
    });

    const validateEnv = await loadValidateEnv();
    expect(() => validateEnv()).toThrow(
      /DATABASE_URL.*JWT_SECRET.*STORAGE_BUCKET.*STORAGE_REGION/,
    );
  });

  it("treats empty string as missing", async () => {
    setEnv({
      NODE_ENV: "test",
      DATABASE_URL: "",
      JWT_SECRET: "test-secret",
      STORAGE_BUCKET: "my-bucket",
      STORAGE_REGION: "eu-north-1",
    });

    const validateEnv = await loadValidateEnv();
    expect(() => validateEnv()).toThrow("DATABASE_URL");
  });
});

describe("validateEnv in production", () => {
  it("does not throw when all base + production vars are set", async () => {
    setEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://localhost/prod",
      JWT_SECRET: "prod-secret",
      STORAGE_BUCKET: "prod-bucket",
      STORAGE_REGION: "eu-north-1",
      SERVER_ENCRYPTION_SECRET: "enc-secret",
    });

    const validateEnv = await loadValidateEnv();
    expect(() => validateEnv()).not.toThrow();
  });

  it("throws when SERVER_ENCRYPTION_SECRET is missing in production", async () => {
    setEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://localhost/prod",
      JWT_SECRET: "prod-secret",
      STORAGE_BUCKET: "prod-bucket",
      STORAGE_REGION: "eu-north-1",
      SERVER_ENCRYPTION_SECRET: undefined,
    });

    const validateEnv = await loadValidateEnv();
    expect(() => validateEnv()).toThrow("SERVER_ENCRYPTION_SECRET");
  });

  it("does not require SERVER_ENCRYPTION_SECRET outside production", async () => {
    setEnv({
      NODE_ENV: "test",
      DATABASE_URL: "postgres://localhost/test",
      JWT_SECRET: "test-secret",
      STORAGE_BUCKET: "my-bucket",
      STORAGE_REGION: "eu-north-1",
      SERVER_ENCRYPTION_SECRET: undefined,
    });

    const validateEnv = await loadValidateEnv();
    expect(() => validateEnv()).not.toThrow();
  });
});
