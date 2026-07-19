import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { localizeText } from "@/components/public-info-page";

vi.mock("@/lib/i18n/server", () => ({
  getServerI18n: vi.fn(),
}));

describe("public info localization", () => {
  it("does not interpret endpoint placeholders inside code", () => {
    const translate = vi.fn((value: string) => {
      if (value.includes("{id}")) throw new Error("missing id");
      return value;
    });

    const localized = localizeText(
      React.createElement("p", null, "Use ", React.createElement("code", null, "/api/notes/{id}")),
      translate,
    );

    expect(renderToStaticMarkup(localized)).toContain("/api/notes/{id}");
    expect(translate).toHaveBeenCalledWith("Use ");
  });
});
