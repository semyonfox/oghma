import { describe, expect, it } from "vitest";
import { orderLikeBase, restorePlaceholders } from "../../../scripts/translate-locales.ts";

describe("translate-locales placeholder repair", () => {
  it("normalises spaced and dollar-prefixed placeholders", () => {
    expect(restorePlaceholders("{count} files", "{ count } fichiers")).toBe("{count} fichiers");
    expect(restorePlaceholders("{count} files", "${count} fichiers")).toBe("{count} fichiers");
  });

  it("keeps reordered placeholders attached to their own names", () => {
    expect(restorePlaceholders("{done} of {total}", "{total}中的 {done}")).toBe("{total}中的 {done}");
  });

  it("maps translated placeholder names back by position", () => {
    expect(restorePlaceholders("{selected} of {total} selected", "{sélection} sur {totale}")).toBe(
      "{selected} sur {total}",
    );
  });

  it("refuses a translation that dropped a placeholder", () => {
    expect(restorePlaceholders("{selected} of {total}", "{selected} au total")).toBeNull();
  });
});

describe("translate-locales output order", () => {
  it("follows the base locale order instead of sorting", () => {
    const base = { Zebra: "Zebra", Apple: "Apple" };
    expect(Object.keys(orderLikeBase(base, { Apple: "Pomme", Zebra: "Zèbre" }))).toEqual(["Zebra", "Apple"]);
  });
});
