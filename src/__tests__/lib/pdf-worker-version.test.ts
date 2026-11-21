import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";

it("opens a PDF through the worker shipped with the app", async () => {
  const require = createRequire(import.meta.url);
  const pdfRequire = createRequire(require.resolve("react-pdf"));
  const pdfModule = pathToFileURL(
    pdfRequire.resolve("pdfjs-dist/legacy/build/pdf.mjs"),
  ).href;
  const { getDocument, GlobalWorkerOptions }: Pick<
    typeof import("react-pdf").pdfjs,
    "getDocument" | "GlobalWorkerOptions"
  > = await import(/* @vite-ignore */ pdfModule);
  const data = new Uint8Array(
    await readFile("scripts/e2e/fixtures/sample-paper.pdf"),
  );

  // pdf.js uses its in-process worker in node but still checks the worker version
  GlobalWorkerOptions.workerSrc = pathToFileURL(
    resolve("public/pdf.worker.js"),
  ).href;
  const task = getDocument({ data });
  try {
    expect((await task.promise).numPages).toBeGreaterThan(0);
  } finally {
    await task.destroy();
  }
});
