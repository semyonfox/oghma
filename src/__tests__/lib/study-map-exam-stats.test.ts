import { describe, expect, it } from "vitest";
import { analyseExamStructure, summariseExamCorpus } from "@/lib/study-map/exam-stats";
import type { ExamQuestion, ExamSection, ExamStructure, SourceAnchor, StudyPaper, StudyTopic } from "@/lib/study-map/types";

const TOPIC_A = "11111111-1111-4111-8111-111111111111";
const TOPIC_B = "22222222-2222-4222-8222-222222222222";
const anchor: SourceAnchor = {
  noteId: "33333333-3333-4333-8333-333333333333",
  field: "content",
  hash: "a".repeat(64),
  start: 0,
  end: 8,
  quote: "Question",
  line: 1,
  page: null,
};

function question(id: string, marks: number | null, topicIds: string[] = [], overrides: Partial<ExamQuestion> = {}): ExamQuestion {
  return { id, parentId: null, label: id, text: `Question ${id}`, marks, topicIds, style: "", source: anchor, ...overrides };
}

function section(id: string, questionIds: string[], answerCount: number | null): ExamSection {
  return { id, name: id, questionIds, answerCount, instructions: "", source: null };
}

function structure(questions: ExamQuestion[], overrides: Partial<ExamStructure> = {}): ExamStructure {
  const roots = questions.filter((entry) => entry.parentId === null);
  return {
    year: 2026,
    sitting: "Summer",
    syllabusVersion: "2026-v1",
    statedTotalMarks: null,
    sections: [section("all", roots.map((entry) => entry.id), roots.length)],
    questions,
    warnings: [],
    ...overrides,
  };
}

function topic(id: string, name: string): StudyTopic {
  return { id, name, definition: name, includes: "", excludes: "", aliases: [], parentId: null, sources: [], reviewed: true };
}

const topics = [topic(TOPIC_A, "Topic A"), topic(TOPIC_B, "Topic B")];

function paper(index: number, exam: ExamStructure, overrides: Partial<StudyPaper> = {}): StudyPaper {
  const hash = index.toString(16).padStart(64, "0");
  return {
    noteId: `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
    title: `Paper ${index}`,
    sourceHash: hash,
    currentHash: hash,
    taxonomyVersion: 3,
    reviewed: true,
    structure: exam,
    ...overrides,
  };
}

describe("analyseExamStructure", () => {
  it("counts printed options separately from answering two of three questions", () => {
    const result = analyseExamStructure(structure([
      question("q1", 20, [TOPIC_A]),
      question("q2", 20, [TOPIC_A]),
      question("q3", 20, [TOPIC_B]),
    ], {
      sections: [{ ...section("choose two", ["q1", "q2", "q3"], 2), instructions: "Answer 2 of 3 questions." }],
      statedTotalMarks: 40,
    }));

    expect(result.printedMarks).toBe(60);
    expect(result.answerableMarks).toEqual({ min: 40, max: 40 });
    expect(result.issues).toEqual([]);
    expect(result.topicMarks).toEqual([
      { topicId: TOPIC_A, exclusiveMarks: 40, sharedMarks: 0, questionCount: 2, minAnswerableMarks: 20, maxAnswerableMarks: 40 },
      { topicId: TOPIC_B, exclusiveMarks: 20, sharedMarks: 0, questionCount: 1, minAnswerableMarks: 0, maxAnswerableMarks: 20 },
    ]);
  });

  it("counts a 20-mark parent with two 10-mark children once and inherits the nearest topic", () => {
    const result = analyseExamStructure(structure([
      question("q1", 20, [TOPIC_A]),
      question("q1a", 10, [], { parentId: "q1" }),
      question("q1b", 10, [TOPIC_B], { parentId: "q1" }),
    ], { statedTotalMarks: 20 }));

    expect(result.printedMarks).toBe(20);
    expect(result.answerableMarks).toEqual({ min: 20, max: 20 });
    expect(result.leafQuestions.map((entry) => entry.id)).toEqual(["q1a", "q1b"]);
    expect(result.issues).toEqual([]);
    expect(result.topicMarks).toEqual([
      { topicId: TOPIC_A, exclusiveMarks: 10, sharedMarks: 0, questionCount: 1, minAnswerableMarks: 10, maxAnswerableMarks: 10 },
      { topicId: TOPIC_B, exclusiveMarks: 10, sharedMarks: 0, questionCount: 1, minAnswerableMarks: 10, maxAnswerableMarks: 10 },
    ]);
  });

  it("keeps shared marks separate so overlapping topics do not inflate paper marks", () => {
    const exam = structure([question("shared", 20, [TOPIC_A, TOPIC_B]), question("exclusive", 10, [TOPIC_A])]);
    const result = analyseExamStructure(exam);

    expect(result.printedMarks).toBe(30);
    expect(result.answerableMarks).toEqual({ min: 30, max: 30 });
    expect(result.topicMarks).toEqual([
      { topicId: TOPIC_A, exclusiveMarks: 10, sharedMarks: 20, questionCount: 2, minAnswerableMarks: 30, maxAnswerableMarks: 30 },
      { topicId: TOPIC_B, exclusiveMarks: 0, sharedMarks: 20, questionCount: 1, minAnswerableMarks: 20, maxAnswerableMarks: 20 },
    ]);
    const corpus = summariseExamCorpus([paper(1, exam)], topics, 3);
    expect(corpus.eligibleCount).toBe(1);
    expect(corpus.topics.map((entry) => ({ exclusive: entry.exclusiveMarks, shared: entry.sharedMarks }))).toEqual([
      { exclusive: 10, shared: 20 },
      { exclusive: 0, shared: 20 },
    ]);
  });

  it("does not allocate unknown child marks from a known parent total", () => {
    const result = analyseExamStructure(structure([
      question("q1", 20, [TOPIC_A]),
      question("q1a", 10, [], { parentId: "q1" }),
      question("q1b", null, [], { parentId: "q1" }),
    ]));

    expect(result.printedMarks).toBeNull();
    expect(result.answerableMarks).toBeNull();
    expect(result.issues.some((issue) => issue.includes("unknown marks"))).toBe(true);
    expect(result.topicMarks).toEqual([
      { topicId: TOPIC_A, exclusiveMarks: 10, sharedMarks: 0, questionCount: 1, minAnswerableMarks: null, maxAnswerableMarks: null },
    ]);
  });

  it("rejects a parent total that conflicts with its child totals", () => {
    const result = analyseExamStructure(structure([
      question("q1", 20, [TOPIC_A]),
      question("q1a", 10, [], { parentId: "q1" }),
      question("q1b", 15, [], { parentId: "q1" }),
    ]));

    expect(result.printedMarks).toBeNull();
    expect(result.answerableMarks).toBeNull();
    expect(result.issues).toContain('Question "q1" totals 20 marks, but its subquestions total 25.');
    expect(result.topicMarks[0].exclusiveMarks).toBe(25);
    expect(result.topicMarks[0].maxAnswerableMarks).toBeNull();
  });

  it("rejects duplicate question IDs rather than counting their marks twice", () => {
    const result = analyseExamStructure(structure([question("q1", 20, [TOPIC_A]), question("q1", 20, [TOPIC_A])]));

    expect(result.printedMarks).toBeNull();
    expect(result.answerableMarks).toBeNull();
    expect(result.issues).toContain('Question ID "q1" is repeated.');
  });

  it("rejects duplicate section IDs even when the question references differ", () => {
    const result = analyseExamStructure(structure([question("q1", 20), question("q2", 20)], {
      sections: [section("same", ["q1"], 1), section("same", ["q2"], 1)],
    }));

    expect(result.printedMarks).toBe(40);
    expect(result.answerableMarks).toBeNull();
    expect(result.issues).toContain('Section ID "same" is repeated.');
  });

  it("handles parent cycles without recursing or reporting zero as a valid total", () => {
    const result = analyseExamStructure(structure([
      question("q1", 10, [TOPIC_A], { parentId: "q2" }),
      question("q2", 10, [TOPIC_A], { parentId: "q1" }),
    ], { sections: [section("cycle", ["q1"], 1)] }));

    expect(result.printedMarks).toBeNull();
    expect(result.answerableMarks).toBeNull();
    expect(result.leafQuestions).toEqual([]);
    expect(result.topicMarks).toEqual([]);
    expect(result.issues.some((issue) => issue.includes("parent cycle"))).toBe(true);
  });

  it("leaves nested subquestion choices unresolved instead of selecting a whole parent", () => {
    const exam = structure([
      question("q1", 20, [TOPIC_A]),
      question("q1a", 10, [], { parentId: "q1" }),
      question("q1b", 10, [], { parentId: "q1" }),
    ], { sections: [section("choose a subquestion", ["q1a", "q1b"], 1)] });
    const result = analyseExamStructure(exam);

    expect(result.printedMarks).toBe(20);
    expect(result.answerableMarks).toBeNull();
    expect(result.issues.some((issue) => issue.includes("Nested choices are unavailable"))).toBe(true);
    const corpus = summariseExamCorpus([paper(1, exam)], topics, 3);
    expect(corpus.eligibleCount).toBe(0);
    expect(corpus.unresolvedCount).toBe(1);
    expect(corpus.topics[0].exclusiveMarks).toBe(0);
  });

  it.each([
    "Answer any two of the following parts.",
    "Answer (a) and either (b) or (c).",
  ])("does not invent answerable totals for the internal rule %s", (instruction) => {
    const exam = structure([
      question("q1", 30, [TOPIC_A], {
        text: instruction,
        source: { ...anchor, quote: instruction, end: instruction.length },
      }),
      question("q1a", 10, [], { parentId: "q1", label: "(a)" }),
      question("q1b", 10, [], { parentId: "q1", label: "(b)" }),
      question("q1c", 10, [], { parentId: "q1", label: "(c)" }),
    ]);
    const result = analyseExamStructure(exam);

    expect(result.printedMarks).toBe(30);
    expect(result.answerableMarks).toBeNull();
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.topicMarks[0]).toMatchObject({ exclusiveMarks: 30, minAnswerableMarks: null, maxAnswerableMarks: null });
    const corpus = summariseExamCorpus([paper(1, exam)], topics, 3);
    expect(corpus.eligibleCount).toBe(0);
    expect(corpus.unresolvedCount).toBe(1);
    expect(corpus.papers[0].status).toBe("unresolved");
    expect(corpus.topics[0]).toMatchObject({ paperCount: 0, paperFrequencyPercent: null, exclusiveMarks: 0 });
  });

  it("does not treat a mandatory question as an unrestricted two-of-three choice", () => {
    const instruction = "Answer 2 of 3 questions. Question 1 is mandatory.";
    const exam = structure([
      question("q1", 20, [TOPIC_A], { label: "Question 1" }),
      question("q2", 20, [TOPIC_B], { label: "Question 2" }),
      question("q3", 20, [TOPIC_B], { label: "Question 3" }),
    ], {
      sections: [{
        ...section("choose two", ["q1", "q2", "q3"], 2),
        instructions: instruction,
        source: { ...anchor, quote: instruction, end: instruction.length },
      }],
      statedTotalMarks: 40,
    });
    const result = analyseExamStructure(exam);

    expect(result.printedMarks).toBe(60);
    expect(result.answerableMarks).toBeNull();
    expect(result.topicMarks.every((entry) => entry.minAnswerableMarks === null && entry.maxAnswerableMarks === null)).toBe(true);
    const corpus = summariseExamCorpus([paper(1, exam)], topics, 3);
    expect(corpus.eligibleCount).toBe(0);
    expect(corpus.unresolvedCount).toBe(1);
    expect(corpus.topics.map((entry) => entry.exclusiveMarks)).toEqual([0, 0]);
  });

  it("keeps normal algorithm and data structure wording out of exam choice detection", () => {
    const algorithmText = "Explain why either algorithm works.";
    const dataStructureText = "Choose a data structure and explain your choice.";
    const exam = structure([
      question("q1", 20, [TOPIC_A], {
        text: algorithmText,
        source: { ...anchor, quote: algorithmText, end: algorithmText.length },
      }),
      question("q2", 10, [TOPIC_B], {
        text: dataStructureText,
        source: { ...anchor, quote: dataStructureText, end: dataStructureText.length },
      }),
    ]);
    const result = analyseExamStructure(exam);

    expect(result.printedMarks).toBe(30);
    expect(result.answerableMarks).toEqual({ min: 30, max: 30 });
    expect(result.issues).toEqual([]);
    expect(result.topicMarks.map((entry) => ({ min: entry.minAnswerableMarks, max: entry.maxAnswerableMarks }))).toEqual([
      { min: 20, max: 20 },
      { min: 10, max: 10 },
    ]);
    const corpus = summariseExamCorpus([paper(1, exam)], topics, 3);
    expect(corpus.eligibleCount).toBe(1);
    expect(corpus.unresolvedCount).toBe(0);
    expect(corpus.topics.map((entry) => entry.exclusiveMarks)).toEqual([20, 10]);
  });

  it("supports an explicit instruction to answer all parts", () => {
    const instruction = "Answer all parts.";
    const exam = structure([
      question("q1", 20, [TOPIC_A], {
        text: instruction,
        source: { ...anchor, quote: instruction, end: instruction.length },
      }),
      question("q1a", 10, [], { parentId: "q1" }),
      question("q1b", 10, [], { parentId: "q1" }),
    ]);
    const result = analyseExamStructure(exam);

    expect(result.printedMarks).toBe(20);
    expect(result.answerableMarks).toEqual({ min: 20, max: 20 });
    expect(result.issues).toEqual([]);
    const corpus = summariseExamCorpus([paper(1, exam)], topics, 3);
    expect(corpus.eligibleCount).toBe(1);
    expect(corpus.unresolvedCount).toBe(0);
    expect(corpus.topics[0]).toMatchObject({ exclusiveMarks: 20, minAnswerableMarks: 20, maxAnswerableMarks: 20 });
  });

  it.each([
    { instruction: "Answer 1 of 2 questions.", rootCount: 2, answerCount: 2 },
    { instruction: "Instructions: Answer 1 of 2 questions.", rootCount: 2, answerCount: 2 },
    { instruction: "Answer 2 of 3 questions.", rootCount: 2, answerCount: 2 },
    { instruction: "Answer any TWO of THREE questions.", rootCount: 3, answerCount: 1 },
  ])("rejects stored counts that conflict with $instruction", ({ instruction, rootCount, answerCount }) => {
    const questions = Array.from({ length: rootCount }, (_, index) => question(`q${index + 1}`, 20, [TOPIC_A]));
    const exam = structure(questions, {
      sections: [{
        ...section("options", questions.map((entry) => entry.id), answerCount),
        instructions: instruction,
        source: { ...anchor, quote: instruction, end: instruction.length },
      }],
    });
    const result = analyseExamStructure(exam);

    expect(result.printedMarks).toBe(rootCount * 20);
    expect(result.answerableMarks).toBeNull();
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.topicMarks[0]).toMatchObject({ minAnswerableMarks: null, maxAnswerableMarks: null });
    const corpus = summariseExamCorpus([paper(1, exam)], topics, 3);
    expect(corpus.eligibleCount).toBe(0);
    expect(corpus.unresolvedCount).toBe(1);
    expect(corpus.papers[0].status).toBe("unresolved");
    expect(corpus.topics[0]).toMatchObject({ paperCount: 0, paperFrequencyPercent: null, exclusiveMarks: 0 });
  });

  it("accepts matching written answer and offered question counts", () => {
    const instruction = "Answer any TWO of THREE questions.";
    const exam = structure([
      question("q1", 20, [TOPIC_A]),
      question("q2", 20, [TOPIC_A]),
      question("q3", 20, [TOPIC_B]),
    ], {
      sections: [{
        ...section("options", ["q1", "q2", "q3"], 2),
        instructions: instruction,
        source: { ...anchor, quote: instruction, end: instruction.length },
      }],
      statedTotalMarks: 40,
    });
    const result = analyseExamStructure(exam);

    expect(result.printedMarks).toBe(60);
    expect(result.answerableMarks).toEqual({ min: 40, max: 40 });
    expect(result.issues).toEqual([]);
    expect(result.topicMarks.map((entry) => ({ min: entry.minAnswerableMarks, max: entry.maxAnswerableMarks }))).toEqual([
      { min: 20, max: 40 },
      { min: 0, max: 20 },
    ]);
    const corpus = summariseExamCorpus([paper(1, exam)], topics, 3);
    expect(corpus.eligibleCount).toBe(1);
    expect(corpus.unresolvedCount).toBe(0);
    expect(corpus.topics.map((entry) => entry.exclusiveMarks)).toEqual([40, 20]);
  });

  it("does not treat a forced specific question as a generic choice of one root", () => {
    const instruction = "You must answer Question 1.";
    const exam = structure([
      question("q1", 20, [TOPIC_A], { label: "Question 1" }),
      question("q2", 20, [TOPIC_B], { label: "Question 2" }),
    ], {
      sections: [{
        ...section("options", ["q1", "q2"], 1),
        instructions: instruction,
        source: { ...anchor, quote: instruction, end: instruction.length },
      }],
    });
    const result = analyseExamStructure(exam);

    expect(result.printedMarks).toBe(40);
    expect(result.answerableMarks).toBeNull();
    expect(result.topicMarks.map((entry) => ({ min: entry.minAnswerableMarks, max: entry.maxAnswerableMarks }))).toEqual([
      { min: null, max: null },
      { min: null, max: null },
    ]);
    const corpus = summariseExamCorpus([paper(1, exam)], topics, 3);
    expect(corpus.eligibleCount).toBe(0);
    expect(corpus.unresolvedCount).toBe(1);
    expect(corpus.papers[0].status).toBe("unresolved");
    expect(corpus.topics.map((entry) => entry.exclusiveMarks)).toEqual([0, 0]);
  });

  it("supports modal instructions requiring all questions when the count includes all roots", () => {
    const instruction = "You must answer all questions.";
    const exam = structure([question("q1", 20, [TOPIC_A]), question("q2", 20, [TOPIC_B])], {
      sections: [{
        ...section("all", ["q1", "q2"], 2),
        instructions: instruction,
        source: { ...anchor, quote: instruction, end: instruction.length },
      }],
      statedTotalMarks: 40,
    });
    const result = analyseExamStructure(exam);

    expect(result.printedMarks).toBe(40);
    expect(result.answerableMarks).toEqual({ min: 40, max: 40 });
    expect(result.issues).toEqual([]);
    expect(result.topicMarks.map((entry) => ({ min: entry.minAnswerableMarks, max: entry.maxAnswerableMarks }))).toEqual([
      { min: 20, max: 20 },
      { min: 20, max: 20 },
    ]);
    const corpus = summariseExamCorpus([paper(1, exam)], topics, 3);
    expect(corpus.eligibleCount).toBe(1);
    expect(corpus.unresolvedCount).toBe(0);
    expect(corpus.topics.map((entry) => entry.exclusiveMarks)).toEqual([20, 20]);
  });
});

describe("summariseExamCorpus", () => {
  it("excludes unknown and conflicting mark papers from every topic denominator", () => {
    const unknown = structure([question("unknown", null, [TOPIC_A])]);
    const conflicting = structure([
      question("q1", 20, [TOPIC_A]),
      question("q1a", 10, [], { parentId: "q1" }),
      question("q1b", 15, [], { parentId: "q1" }),
    ]);
    const conflictingStatedTotal = structure([question("q1", 20, [TOPIC_A])], { statedTotalMarks: 25 });
    const result = summariseExamCorpus([paper(1, unknown), paper(2, conflicting), paper(3, conflictingStatedTotal)], topics, 3);

    expect(result.eligibleCount).toBe(0);
    expect(result.unresolvedCount).toBe(3);
    expect(result.topics.map((entry) => ({ papers: entry.paperCount, frequency: entry.paperFrequencyPercent, marks: entry.exclusiveMarks, min: entry.minAnswerableMarks, max: entry.maxAnswerableMarks }))).toEqual([
      { papers: 0, frequency: null, marks: 0, min: null, max: null },
      { papers: 0, frequency: null, marks: 0, min: null, max: null },
    ]);
    expect(result.papers[2].issues.some((issue) => issue.includes("conflict with the answerable range"))).toBe(true);
  });

  it("uses only reviewed current papers from the selected taxonomy and syllabus", () => {
    const result = summariseExamCorpus([
      paper(1, structure([question("q1", 10, [TOPIC_A])])),
      paper(2, structure([question("q1", 20, [TOPIC_B])])),
      paper(3, structure([question("q1", 100, [TOPIC_A])]), { reviewed: false }),
      paper(4, structure([question("q1", 200, [TOPIC_A])]), { currentHash: "f".repeat(64) }),
      paper(5, structure([question("q1", 300, [TOPIC_A])]), { taxonomyVersion: 2 }),
      paper(6, structure([question("q1", 400, [TOPIC_A])], { syllabusVersion: "2025-v1" })),
    ], topics, 3, "2026-v1");

    expect(result.paperCount).toBe(6);
    expect(result.reviewedCount).toBe(5);
    expect(result.eligibleCount).toBe(2);
    expect(result.unreviewedCount).toBe(1);
    expect(result.unresolvedCount).toBe(3);
    expect(result.duplicateCount).toBe(0);
    expect(result.papers.map((entry) => entry.status)).toEqual(["eligible", "eligible", "unreviewed", "unresolved", "unresolved", "unresolved"]);
    expect(result.topics.map((entry) => ({ papers: entry.paperCount, frequency: entry.paperFrequencyPercent, marks: entry.exclusiveMarks, min: entry.minAnswerableMarks, max: entry.maxAnswerableMarks }))).toEqual([
      { papers: 1, frequency: 50, marks: 10, min: 10, max: 10 },
      { papers: 1, frequency: 50, marks: 20, min: 20, max: 20 },
    ]);
  });

  it("counts identical source hashes once and prefers the usable reviewed copy", () => {
    const exam = structure([question("q1", 20, [TOPIC_A])]);
    const canonical = paper(2, exam);
    const copies = [
      paper(1, exam, { sourceHash: canonical.sourceHash, currentHash: canonical.currentHash, reviewed: false }),
      canonical,
      paper(3, exam, { sourceHash: canonical.sourceHash, currentHash: canonical.currentHash }),
    ];
    const result = summariseExamCorpus(copies, topics, 3);

    expect(result.paperCount).toBe(3);
    expect(result.reviewedCount).toBe(2);
    expect(result.eligibleCount).toBe(1);
    expect(result.duplicateCount).toBe(2);
    expect(result.unreviewedCount).toBe(0);
    expect(result.papers.map((entry) => ({ status: entry.status, duplicateOf: entry.duplicateOf }))).toEqual([
      { status: "duplicate", duplicateOf: canonical.noteId },
      { status: "eligible", duplicateOf: null },
      { status: "duplicate", duplicateOf: canonical.noteId },
    ]);
    expect(result.topics[0]).toMatchObject({ paperCount: 1, paperFrequencyPercent: 100, exclusiveMarks: 20, minAnswerableMarks: 20, maxAnswerableMarks: 20 });
    expect(result.topics[1]).toMatchObject({ paperCount: 0, paperFrequencyPercent: 0, exclusiveMarks: 0, minAnswerableMarks: 0, maxAnswerableMarks: 0 });
  });

  it("counts distinct source hashes from different sittings as separate papers", () => {
    const result = summariseExamCorpus([
      paper(1, structure([question("q1", 20, [TOPIC_A])], { sitting: "Summer" })),
      paper(2, structure([question("q1", 30, [TOPIC_B])], { sitting: "Autumn repeat" })),
    ], topics, 3);

    expect(result.eligibleCount).toBe(2);
    expect(result.duplicateCount).toBe(0);
    expect(result.issues).toEqual([]);
    expect(result.topics.map((entry) => ({ papers: entry.paperCount, frequency: entry.paperFrequencyPercent, marks: entry.exclusiveMarks }))).toEqual([
      { papers: 1, frequency: 50, marks: 20 },
      { papers: 1, frequency: 50, marks: 30 },
    ]);
  });
});
