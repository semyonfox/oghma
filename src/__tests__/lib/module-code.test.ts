import { describe, expect, it } from "vitest";
import { splitModuleCode } from "@/lib/notes/module-code";

describe("splitModuleCode", () => {
  it("splits Canvas-style slugs into a code and a readable title", () => {
    expect(splitModuleCode("CT230-Database-Systems-I")).toEqual({
      code: "CT230",
      title: "Database Systems I",
    });
  });

  it("handles spaced names and lowercase codes", () => {
    expect(splitModuleCode("ct2108 Networks & Data")).toEqual({
      code: "CT2108",
      title: "Networks & Data",
    });
  });

  it("leaves ordinary folder names alone", () => {
    expect(splitModuleCode("Database Systems")).toEqual({
      code: null,
      title: "Database Systems",
    });
    expect(splitModuleCode("CT230")).toEqual({ code: null, title: "CT230" });
  });
});
