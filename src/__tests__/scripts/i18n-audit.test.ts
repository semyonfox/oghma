import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { auditI18n } from "../../../scripts/i18n-audit.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  temporaryDirectories.splice(0).forEach((directory) =>
    rmSync(directory, { recursive: true, force: true }),
  );
});

describe("i18n audit", () => {
  it("accepts literal phrase keys and dynamic catalog values while checking locale parity", () => {
    const root = mkdtempSync(join(tmpdir(), "oghmanotes-i18n-"));
    temporaryDirectories.push(root);
    const sourceRoot = join(root, "source");
    const localesDir = join(root, "locales");
    mkdirSync(sourceRoot, { recursive: true });
    mkdirSync(localesDir, { recursive: true });
    writeFileSync(join(sourceRoot, "page.tsx"), 'const label = "Dynamic catalog value"; t("A full English phrase"); t(label);');
    writeFileSync(join(localesDir, "en.json"), JSON.stringify({ "A full English phrase": "A full English phrase" }));
    writeFileSync(join(localesDir, "fr-FR.json"), JSON.stringify({ "A full English phrase": "A full English phrase" }));

    expect(auditI18n({ sourceRoot, localesDir }).errors).toEqual([]);
  });

  it("rejects missing literal keys and interpolation drift", () => {
    const root = mkdtempSync(join(tmpdir(), "oghmanotes-i18n-"));
    temporaryDirectories.push(root);
    const sourceRoot = join(root, "source");
    const localesDir = join(root, "locales");
    mkdirSync(sourceRoot, { recursive: true });
    mkdirSync(localesDir, { recursive: true });
    writeFileSync(join(sourceRoot, "page.ts"), 't("Missing"); t("Hello {name}");');
    writeFileSync(join(localesDir, "en.json"), JSON.stringify({ "Hello {name}": "Hello {name}" }));
    writeFileSync(join(localesDir, "fr-FR.json"), JSON.stringify({ "Hello {name}": "Bonjour {person}" }));

    expect(auditI18n({ sourceRoot, localesDir }).errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("literal keys missing from en.json: Missing"),
        expect.stringContaining("fr-FR.json :: Hello {name} has different interpolation variables"),
      ]),
    );
  });
});
