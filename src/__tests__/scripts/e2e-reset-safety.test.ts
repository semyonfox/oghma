import { describe, expect, it } from "vitest";
import {
  assertDisposableDatabaseUrl,
  assertDisposableServiceHost,
} from "../../../scripts/e2e/lib/safety";

describe("e2e reset safety guards", () => {
  it.each([
    "postgresql://u:p@127.0.0.1:55433/oghma_e2e",
    "postgresql://u:p@localhost/oghma_e2e",
    "postgresql://u:p@[::1]:5432/oghma_e2e",
    "postgresql://u:p@postgres/oghma_e2e",
  ])("accepts a local e2e database %s", (url) => {
    expect(() => assertDisposableDatabaseUrl(url, {})).not.toThrow();
  });

  it("refuses a database whose name does not mark it disposable", () => {
    expect(() =>
      assertDisposableDatabaseUrl("postgresql://u:p@127.0.0.1/oghma", {}),
    ).toThrow(/must include 'e2e'/);
  });

  it("refuses a shared host unless the CI opt-in is set", () => {
    const url = "postgresql://u:p@oghma-postgres/oghma_e2e";
    expect(() => assertDisposableDatabaseUrl(url, {})).toThrow(/non-local database host/);
    expect(() =>
      assertDisposableDatabaseUrl(url, { E2E_ALLOW_NONLOCAL_DB_RESET: "1" }),
    ).not.toThrow();
  });

  it("refuses to flush a shared Redis or wipe a shared Qdrant", () => {
    expect(() => assertDisposableServiceHost("Redis", "oghma-redis", {})).toThrow(
      /non-local Redis host 'oghma-redis'/,
    );
    expect(() => assertDisposableServiceHost("Qdrant", "oghma-qdrant", {})).toThrow(
      /non-local Qdrant host/,
    );
    expect(() => assertDisposableServiceHost("Redis", "127.0.0.1", {})).not.toThrow();
    expect(() =>
      assertDisposableServiceHost("Qdrant", "172.17.0.1", {
        E2E_ALLOW_NONLOCAL_DB_RESET: "1",
      }),
    ).not.toThrow();
  });
});
