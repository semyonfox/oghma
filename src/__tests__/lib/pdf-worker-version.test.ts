import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("ships the PDF worker matching React-PDF's PDF.js dependency", () => {
  const require = createRequire(import.meta.url);
  const pdfRequire = createRequire(require.resolve("react-pdf"));
  const installed: { version: string } = JSON.parse(
    readFileSync(pdfRequire.resolve("pdfjs-dist/package.json"), "utf8"),
  );
  const worker = readFileSync(resolve("public/pdf.worker.js"), "utf8");
  expect(worker).toContain(`pdfjsVersion = ${installed.version}`);
});
