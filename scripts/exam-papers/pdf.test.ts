import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parsePdfText } from "./pdf.ts";
const metadata = { moduleCode: "CT318", academicYear: "2025/2026" };
describe("PDF question extraction", () => {
  it("preserves layout, page spans and numeric data at the end of a question", () => {
    const result = parsePdfText(
      "Question 1 [20 marks]\n(a) Explain the table.\n  A    B\n  1    2\n42\fQuestion 2\n(b) Explain. [8 marks]\n",
      metadata,
    );
    assert.equal(result.questions.length, 2);
    assert.equal(result.questions[0]?.marks, 20);
    assert.equal(result.questions[1]?.marks, undefined);
    assert.match(result.questions[0]?.text ?? "", /42$/);
    assert.equal(result.questions[1]?.pageStart, 2);
    assert.equal(
      result.pages[0]?.text,
      "Question 1 [20 marks]\n(a) Explain the table.\n  A    B\n  1    2\n42",
    );
  });
  it("keeps subpart marks separate from question totals", () => {
    const result = parsePdfText(
      "Question 1 (a) [8 Marks]\nExplain something.\nQuestion 2\n[30 Marks]\nExplain something else.",
      metadata,
    );
    assert.equal(result.questions[0]?.marks, undefined);
    assert.equal(result.questions[1]?.marks, 30);
  });
  it("ignores section instructions and continued headings", () => {
    const result = parsePdfText(
      "Question 1 in Section 1 is mandatory.\nQuestion 1 [30 Marks]\nDetails\fQuestion 1 continued\nMore details\nQuestion 2\nFinal details",
      metadata,
    );
    assert.deepEqual(
      result.questions.map((q) => q.number),
      ["1", "2"],
    );
    assert.equal(result.questions[0]?.pageEnd, 2);
  });
  it("warns when text is missing or supplementary pages may affect splitting", () => {
    assert.ok(parsePdfText("\f", metadata).warnings.some((w) => /OCR/.test(w)));
    assert.ok(
      parsePdfText(
        "Question 1\nDescribe.\fFormula sheet\nformula",
        metadata,
      ).warnings.some((w) => /Supplementary/.test(w)),
    );
  });
});
