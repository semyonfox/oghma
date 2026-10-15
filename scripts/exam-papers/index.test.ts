import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseExamFilename,
  parseExamPaperText,
  parseQuestionsFromText,
} from "./index.ts";

describe("parseExamFilename", () => {
  it("extracts core metadata from an exam-paper PDF filename", () => {
    assert.deepEqual(
      parseExamFilename("Exam Papers/CT216/2024_2025_CT216_1_1_2.pdf"),
      {
        moduleCode: "CT216",
        academicYear: "2024/2025",
        component: "1",
        sitting: "1",
        period: "2",
        sourcePath: "Exam Papers/CT216/2024_2025_CT216_1_1_2.pdf",
      },
    );
  });

  it("rejects filenames outside the known exam-paper convention", () => {
    assert.throws(
      () => parseExamFilename("notes/lecture-01.pdf"),
      /Unsupported exam-paper filename/,
    );
  });
});

describe("parseQuestionsFromText", () => {
  it("splits simple question headings and captures marks", () => {
    const questions = parseQuestionsFromText(`
      Question 1. Define cohesion. [5 marks]
      2) Explain coupling with an example. [10 marks]
    `);

    assert.equal(questions.length, 2);
    assert.deepEqual(
      questions.map((question) => question.number),
      ["1", "2"],
    );
    assert.equal(questions[0]?.marks, 5);
    assert.match(questions[1]?.text ?? "", /Explain coupling/);
  });

  it("supports Question headings that omit punctuation after the number", () => {
    const questions = parseQuestionsFromText(`
      Question 1 Define inheritance. [5 marks]
      Question 2 Discuss polymorphism. [8 marks]
    `);

    assert.deepEqual(
      questions.map((question) => question.number),
      ["1", "2"],
    );
    assert.match(questions[0]?.text ?? "", /Define inheritance/);
    assert.equal(questions[1]?.marks, 8);
  });

  it("does not treat section instructions as question headings", () => {
    const questions = parseQuestionsFromText(`
      Question 1 in Section 1 is mandatory.
      Question 1 [30 Marks] Explain virtual memory.
    `);

    assert.deepEqual(
      questions.map((question) => question.number),
      ["1"],
    );
    assert.match(questions[0]?.text ?? "", /Explain virtual memory/);
    assert.equal(questions[0]?.marks, 30);
  });
});

describe("parseExamPaperText", () => {
  it("combines filename metadata with parsed question text", () => {
    const paper = parseExamPaperText("1. What is a use case? [4 marks]", {
      sourcePath: "2023_2024_CT216_1_1_5.pdf",
    });

    assert.equal(paper.metadata.moduleCode, "CT216");
    assert.equal(paper.metadata.academicYear, "2023/2024");
    assert.equal(paper.questions[0]?.marks, 4);
  });
});
