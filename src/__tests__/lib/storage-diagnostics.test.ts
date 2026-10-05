import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "@/lib/storage/logger";
import { tryJSON } from "@/lib/storage/str";
afterEach(() => vi.restoreAllMocks());
describe("storage diagnostic output", () => {
  it("never forwards names, error objects or interpolation arguments", () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => {});
    createLogger("private object /vault/private-id").error(
      new Error("private email@example.test"),
      { key: "secret" },
    );
    expect(output).toHaveBeenCalledExactlyOnceWith("storage_failed");
  });
  it("keeps malformed private JSON out of diagnostic output", () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(tryJSON('{"private note email@example.test')).toBeNull();
    expect(output).toHaveBeenCalledExactlyOnceWith("storage_json_invalid");
  });
});
