import { test } from "node:test";
import assert from "node:assert/strict";
import { importText } from "./export.ts";
import { parsePdfText } from "./pdf.ts";
import { paperFromFilename } from "./library.ts";
import { parseExamFilename } from "./metadata.ts";
import { examPaperImportSchema } from "../../src/lib/study-map/paper-import-format.ts";

test("exports every page including instructions and appendices with study-map page markers", () => {
  const filename = "2025_2026_CT318_1_1_5.pdf";
  const paper = paperFromFilename(filename);
  const extracted = parsePdfText(
    "Answer two questions.\nQuestion 1\nExplain interfaces.\fQuestion 2\nDescribe evaluation.\fAppendix\nReference formula\f",
    parseExamFilename(filename),
  );
  const text = importText(paper, extracted);
  assert.match(text, /\[Page 1\]\nAnswer two questions/);
  assert.match(text, /\[Page 2\]\nQuestion 2/);
  assert.match(text, /\[Page 3\]\nAppendix\nReference formula/);
  assert.match(text, /Academic year: 2025\/2026/);
  const input = {
    format: "oghma-exam-paper",
    version: 1,
    filename,
    title: "HCI",
    moduleCode: "CT318",
    academicYear: "2025/2026",
    sitting: 1,
    period: 5,
    sha256: "a".repeat(64),
    pdfBase64: Buffer.from("%PDF-synthetic").toString("base64"),
    text,
    warnings: [],
  };
  assert.equal(examPaperImportSchema.safeParse(input).success, true);
  assert.equal(
    examPaperImportSchema.safeParse({ ...input, moduleCode: "CT319" }).success,
    false,
  );
  assert.equal(
    examPaperImportSchema.safeParse({ ...input, sitting: 2 }).success,
    false,
  );
  assert.equal(
    examPaperImportSchema.safeParse({
      ...input,
      cookies: "must not be transported",
    }).success,
    false,
  );
});
