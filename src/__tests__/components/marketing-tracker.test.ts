import { describe, expect, it } from "vitest";
import { appendBoundedPathChain } from "@/components/marketing-tracker";

describe("bounded in-memory marketing path chains", () => {
  it("builds a chain without adding duplicate path observations", () => {
    expect(appendBoundedPathChain([], "/")).toEqual(["/"]);
    expect(appendBoundedPathChain(["/", "/pricing"], "/pricing")).toEqual([
      "/",
      "/pricing",
    ]);
  });

  it("keeps only the latest four public path observations", () => {
    expect(
      appendBoundedPathChain(
        ["/", "/about", "/blog", "/pricing"],
        "/register",
      ),
    ).toEqual(["/about", "/blog", "/pricing", "/register"]);
  });
});
