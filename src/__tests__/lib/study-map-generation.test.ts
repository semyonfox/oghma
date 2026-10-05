import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractStudyPaper,
  proposeStudyTopics,
} from "@/lib/study-map/generation";
import {
  sourceDocument,
  isCurrentAnchor,
  anchorFromQuote,
} from "@/lib/study-map/evidence";
import { validateSectionInstructionPlacement } from "@/lib/study-map/exam-evidence";
import { analyseExamStructure } from "@/lib/study-map/exam-stats";
import {
  examStructureSchema,
  topicSchema,
  type ExamQuestion,
  type ExamSection,
  type ExamStructure,
  type SourceDocument,
  type StudyTopic,
} from "@/lib/study-map/types";

const provider = vi.hoisted(() => ({
  generateText: vi.fn(),
  createLlmProvider: vi.fn(),
}));
vi.mock("ai", () => ({ generateText: provider.generateText }));
vi.mock("@/lib/ai-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai-config")>()),
  createLlmProvider: provider.createLlmProvider,
}));

const NOTE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_NOTE_ID = "22222222-2222-4222-8222-222222222222";
const UNKNOWN_ID = "33333333-3333-4333-8333-333333333333";
const TOPIC_ID = "44444444-4444-4444-8444-444444444444";

function document(text: string, noteId = NOTE_ID): SourceDocument {
  return sourceDocument({
    noteId,
    title: "Synthetic study material",
    content: text,
    extractedText: null,
  });
}

const syllabus = document(
  [
    "## Trees",
    "Trees are connected acyclic graphs.",
    "",
    "### Binary trees",
    "Binary trees have at most two children per node.",
    "",
    "## Transactions",
    "Transactions preserve atomic changes to a database.",
  ].join("\n"),
);

const paper = document(
  [
    "# Paper 2025",
    "Sitting: Summer",
    "Syllabus: 2024/25",
    "Total marks: 50",
    "",
    "## Section A",
    "Answer 2 of 3 questions.",
    "",
    "### Question 1 [20 marks]",
    "Explain Trees.",
    "#### (a) [10 marks]",
    "Compare Binary trees.",
    "#### (b) [10 marks]",
    "Draw a graph.",
    "### Question 2 [20 marks]",
    "Explain Trees and Transactions.",
    "### Question 3 [20 marks]",
    "Describe a treeship.",
    "",
    "## Section B",
    "Answer all questions.",
    "### Question 4 [10 marks]",
    "Explain Transactions.",
  ].join("\n"),
);

interface Quote {
  quote: string;
  occurrence: number;
}

interface Proposal {
  id: string;
  name: string;
  definition: string;
  // providers return scope as text or as a list of points
  includes: string | string[];
  excludes: string | string[];
  aliases: string[];
  parentId: string | null;
  // sources cite the prompt's short document refs, not note IDs
  sources: Array<Quote & { source: string }>;
}

type PaperResponse = Omit<ExamStructure, "sections" | "questions"> & {
  sections: Array<Omit<ExamSection, "source"> & { source: Quote | null }>;
  questions: Array<Omit<ExamQuestion, "source"> & { source: Quote }>;
};

function proposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: "new-trees",
    name: "Trees",
    definition: "Trees are connected acyclic graphs.",
    includes: "Connected acyclic graphs",
    excludes: "Cycles",
    aliases: [],
    parentId: null,
    sources: [
      {
        source: "S1",
        quote: "Trees are connected acyclic graphs.",
        occurrence: 0,
      },
    ],
    ...overrides,
  };
}

function compulsoryFixture(): {
  source: SourceDocument;
  response: PaperResponse;
} {
  const texts = [
    "### Question 1 [20 marks]\nExplain Trees.",
    "### Question 2 [20 marks]\nExplain Transactions.",
  ];
  return {
    source: document(
      `# Paper 2025\n## Section A\nAnswer all questions.\n${texts.join("\n")}`,
    ),
    response: {
      year: 2025,
      sitting: "Unknown",
      syllabusVersion: "2024/25",
      statedTotalMarks: null,
      warnings: [],
      sections: [
        {
          id: "section-a",
          name: "Section A",
          questionIds: ["q1", "q2"],
          answerCount: 2,
          instructions: "Answer all questions.",
          source: { quote: "Answer all questions.", occurrence: 0 },
        },
      ],
      questions: texts.map((text, index) => ({
        id: `q${index + 1}`,
        parentId: null,
        label: `Question ${index + 1}`,
        text,
        marks: 20,
        topicIds: [],
        style: "explain",
        source: { quote: text, occurrence: 0 },
      })),
    },
  };
}

function respond(value: unknown): void {
  provider.generateText.mockResolvedValue({
    text: JSON.stringify(value),
    finishReason: "stop",
  });
}

beforeEach(() => {
  vi.stubEnv("STUDY_CLASSIFIER_PROVIDER", "mock");
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost/study_e2e");
  provider.generateText.mockReset();
  provider.createLlmProvider
    .mockReset()
    .mockReturnValue((model: string) => model);
});

afterEach(() => vi.unstubAllEnvs());

describe("study generation mock fixtures", () => {
  it("proposes approved course definitions with exact evidence and a stable hierarchy without calling a provider", async () => {
    const topics = await proposeStudyTopics([syllabus], []);
    expect(topics.map((topic) => topic.name)).toEqual([
      "Trees",
      "Binary trees",
      "Transactions",
    ]);
    expect(topics[1].parentId).toBe(topics[0].id);
    expect(topics[2].parentId).toBeNull();
    for (const topic of topics) {
      expect(topic.reviewed).toBe(true);
      expect(topic.includes).not.toBe("");
      expect(topic.sources).toHaveLength(1);
      expect(isCurrentAnchor(topic.sources[0], syllabus)).toBe(true);
      expect(topic.sources[0].quote).toBe(topic.definition);
    }
    expect(provider.createLlmProvider).not.toHaveBeenCalled();
    expect(provider.generateText).not.toHaveBeenCalled();
  });

  it("preserves existing IDs and reviews, but clears approval when the definition changes", async () => {
    const initial = await proposeStudyTopics([syllabus], []);
    const reviewed = initial.map((topic) => ({ ...topic, reviewed: true }));
    const unchanged = await proposeStudyTopics([syllabus], reviewed);
    expect(unchanged).toEqual(reviewed);
    const updated = document(
      syllabus.text.replace(
        "Trees are connected acyclic graphs.",
        "Trees are connected acyclic graphs with no cycles.",
      ),
    );
    const changed = await proposeStudyTopics([updated], reviewed);
    expect(changed.map((topic) => topic.id)).toEqual(
      reviewed.map((topic) => topic.id),
    );
    expect(changed[0].definition).toBe(
      "Trees are connected acyclic graphs with no cycles.",
    );
    expect(changed[0].reviewed).toBe(false);
  });

  it("retains evidence from separate documents instead of collapsing identical definition text", async () => {
    const topics = await proposeStudyTopics(
      [
        syllabus,
        document(
          "## Trees\nTrees are connected acyclic graphs.",
          OTHER_NOTE_ID,
        ),
      ],
      [],
    );
    expect(topics[0].sources.map((source) => source.noteId)).toEqual([
      NOTE_ID,
      OTHER_NOTE_ID,
    ]);
  });

  it("extracts every section, root and child, while keeping printed marks separate from optional answers", async () => {
    const topics = await proposeStudyTopics([syllabus], []);
    const structure = await extractStudyPaper(paper, topics, "2024/25");
    expect(structure).toMatchObject({
      year: 2025,
      sitting: "Summer",
      syllabusVersion: "2024/25",
      statedTotalMarks: 50,
    });
    expect(structure.sections.map((section) => section.answerCount)).toEqual([
      2, 1,
    ]);
    expect(
      structure.sections.map((section) => section.questionIds.length),
    ).toEqual([3, 1]);
    expect(structure.questions).toHaveLength(6);
    const [root, childA, childB, joint, unmatched] = structure.questions;
    expect(childA.parentId).toBe(root.id);
    expect(childB.parentId).toBe(root.id);
    expect(joint.topicIds).toEqual([topics[0].id, topics[2].id]);
    expect(unmatched.topicIds).toEqual([]);
    expect(structure.questions.map((question) => question.marks)).toEqual([
      20, 10, 10, 20, 20, 10,
    ]);
    for (const question of structure.questions)
      expect(isCurrentAnchor(question.source, paper)).toBe(true);
    expect(structure.sections[0].source?.quote).toBe(
      "Answer 2 of 3 questions.",
    );
    const statistics = analyseExamStructure(structure);
    expect(statistics.printedMarks).toBe(70);
    expect(statistics.answerableMarks).toEqual({ min: 50, max: 50 });
    expect(provider.generateText).not.toHaveBeenCalled();
  });

  it("keeps complex choice instructions quoted and the answer count unknown", async () => {
    const source = document(
      paper.text.replace(
        "Answer 2 of 3 questions.",
        "Answer Question 1 or both Questions 2 and 3.",
      ),
    );
    const structure = await extractStudyPaper(source, [], "2024/25");
    expect(structure.sections[0].answerCount).toBeNull();
    expect(structure.sections[0].instructions).toBe(
      "Answer Question 1 or both Questions 2 and 3.",
    );
    expect(
      structure.warnings.some(
        (warning) =>
          warning.includes("Section A") && warning.includes("manual review"),
      ),
    ).toBe(true);
    expect(analyseExamStructure(structure).answerableMarks).toBeNull();
  });

  it("does not discard a mandatory question rule following an optional answer count", async () => {
    const source = document(
      paper.text.replace(
        "Answer 2 of 3 questions.",
        "Answer 2 of 3 questions.\nQuestion 1 is mandatory.",
      ),
    );
    const structure = await extractStudyPaper(source, [], "2024/25");
    expect(structure.sections[0].answerCount).toBeNull();
    expect(structure.sections[0].instructions).toContain(
      "Question 1 is mandatory.",
    );
    expect(
      structure.warnings.some((warning) => warning.includes("manual review")),
    ).toBe(true);
  });

  it.each([
    [
      "no headings",
      "Paper 2025\nQuestion 1: Explain trees",
      /Unsupported mock paper/,
    ],
    [
      "orphan child",
      "# Paper 2025\n## Section A\nAnswer all questions.\n#### (a) [10 marks]\nExplain trees",
      /no parent/,
    ],
    [
      "no rules",
      "# Paper 2025\n## Section A\n### Question 1 [10 marks]\nExplain trees",
      /no explicit choice instructions/,
    ],
    [
      "wrong count",
      paper.text.replace(
        "Answer 2 of 3 questions.",
        "Answer 2 of 4 questions.",
      ),
      /different question count/,
    ],
  ])(
    "rejects %s instead of inventing a paper structure",
    async (_name, text, error) => {
      await expect(
        extractStudyPaper(document(text), [], "2024/25"),
      ).rejects.toThrow(error);
    },
  );

  it("leaves missing marks unknown, with a warning and no exact answering total", async () => {
    const source = document(
      "# Paper 2025\n## Section A\nAnswer all questions.\n### Question 1\nExplain Trees.",
    );
    const structure = await extractStudyPaper(source, [], "2024/25");
    expect(structure.questions[0].marks).toBeNull();
    expect(
      structure.warnings.some(
        (warning) =>
          warning.includes("Question 1") && warning.includes("marks"),
      ),
    ).toBe(true);
    expect(analyseExamStructure(structure).answerableMarks).toBeNull();
  });
});

describe("study generation provider validation", () => {
  beforeEach(() => vi.stubEnv("STUDY_CLASSIFIER_PROVIDER", "generative"));

  it("preserves names and aliases when a proposal addresses an existing topic by an alias", async () => {
    const existing = topicSchema.parse({
      id: TOPIC_ID,
      name: "Trees",
      definition: "Original definition",
      aliases: ["Tree structures"],
      reviewed: true,
    });
    respond({
      topics: [
        proposal({
          name: "Tree structures",
          aliases: ["Tree structures", "Acyclic graphs"],
        }),
      ],
    });
    const result = await proposeStudyTopics([syllabus], [existing]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: TOPIC_ID,
      name: "Trees",
      aliases: ["Tree structures", "Acyclic graphs"],
      reviewed: false,
    });
  });

  it("accepts topic scope written as a list, as gpt-6-luna returns it", async () => {
    respond({
      topics: [
        proposal({
          includes: ["binary trees", "traversal"],
          excludes: ["graphs with cycles"],
        }),
      ],
    });
    const [topic] = await proposeStudyTopics([syllabus], []);
    expect(topic).toMatchObject({
      includes: "binary trees; traversal",
      excludes: "graphs with cycles",
      reviewed: true,
    });
  });

  it("shows later sources as previews but resolves quotes against their full text", async () => {
    const lecture = document(
      `${"Opening line about trees. ".repeat(4)}\nDeep in the lecture: Trees are connected acyclic graphs.`,
    );
    const second = {
      ...lecture,
      noteId: "99999999-9999-4999-8999-999999999999",
    };
    respond({
      topics: [
        proposal({
          sources: [
            {
              source: "S2",
              quote: "Trees are connected acyclic graphs.",
              occurrence: 0,
            },
          ],
        }),
      ],
    });
    const [topic] = await proposeStudyTopics(
      [syllabus, second],
      [],
      undefined,
      {
        previewChars: 40,
      },
    );
    const prompt = String(provider.generateText.mock.calls[0][0].prompt);
    expect(prompt).not.toContain("Deep in the lecture");
    expect(prompt).toContain("Trees are connected acyclic graphs.");
    expect(topic.sources[0].noteId).toBe(second.noteId);
  });

  it("reuses a cached proposal for identical material instead of generating again", async () => {
    const stored = new Map<string, unknown>();
    const cache = {
      get: async (key: string) => stored.get(key),
      set: async (key: string, value: unknown) => {
        stored.set(key, value);
      },
    };
    respond({ topics: [proposal()] });
    const first = await proposeStudyTopics([syllabus], [], undefined, {
      cache,
    });
    const copy = {
      ...syllabus,
      noteId: "99999999-9999-4999-8999-999999999999",
    };
    const second = await proposeStudyTopics([copy], [], undefined, { cache });
    expect(provider.generateText).toHaveBeenCalledTimes(1);
    expect(second.map((topic) => topic.name)).toEqual(
      first.map((topic) => topic.name),
    );
    expect(second[0].sources[0].noteId).toBe(copy.noteId);
  });

  it("resolves new parent references to actual IDs and preserves omitted existing topics", async () => {
    const existing: StudyTopic = topicSchema.parse({
      id: TOPIC_ID,
      name: "Transactions",
      definition: "Atomic database changes",
      reviewed: true,
    });
    respond({
      topics: [
        proposal(),
        proposal({
          id: "new-binary",
          name: "Binary trees",
          parentId: "new-trees",
          definition: "Binary trees have at most two children per node.",
          sources: [
            {
              source: "S1",
              quote: "Binary trees have at most two children per node.",
              occurrence: 0,
            },
          ],
        }),
      ],
    });
    const result = await proposeStudyTopics([syllabus], [existing]);
    expect(result[0]).toEqual(existing);
    expect(result[2].parentId).toBe(result[1].id);
    expect(result[1].id).not.toBe("new-trees");
  });

  it("drops a topic whose only quote is invented and keeps the supported ones", async () => {
    respond({
      topics: [
        proposal(),
        proposal({
          id: "new-heaps",
          name: "Heaps",
          parentId: "new-trees",
          sources: [
            { source: "S1", quote: "Invented definition", occurrence: 0 },
          ],
        }),
      ],
    });
    const result = await proposeStudyTopics([syllabus], []);
    expect(result.map((topic) => topic.name)).toEqual(["Trees"]);
  });

  it.each([
    [
      "unknown document",
      proposal({
        sources: [
          {
            source: "S9",
            quote: "Trees are connected acyclic graphs.",
            occurrence: 0,
          },
        ],
      }),
      /unknown source/,
    ],
    [
      "unknown existing ID",
      proposal({ id: UNKNOWN_ID }),
      /unknown existing topic/,
    ],
    [
      "missing parent",
      proposal({ parentId: "missing-parent" }),
      /unknown parent/,
    ],
    ["self parent", proposal({ parentId: "new-trees" }), /cycle/],
  ])("rejects %s in a taxonomy proposal", async (_name, topic, error) => {
    respond({ topics: [topic] });
    await expect(proposeStudyTopics([syllabus], [])).rejects.toThrow(error);
  });

  it("rejects cycles across proposed parents", async () => {
    respond({
      topics: [
        proposal({ parentId: "new-binary" }),
        proposal({
          id: "new-binary",
          name: "Binary trees",
          parentId: "new-trees",
        }),
      ],
    });
    await expect(proposeStudyTopics([syllabus], [])).rejects.toThrow(/cycle/);
  });

  it("validates output types even when JSON mode is enabled", async () => {
    respond({ topics: [{ ...proposal(), definition: 42 }] });
    await expect(proposeStudyTopics([syllabus], [])).rejects.toThrow();
    expect(provider.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        providerOptions: expect.objectContaining({
          openrouter: expect.objectContaining({
            response_format: { type: "json_object" },
          }),
        }),
      }),
    );
  });

  it.each([
    ["invalid JSON", "not JSON", "stop", /invalid JSON/],
    ["incomplete JSON", '{"topics":[]}', "length", /response limit/],
  ])("fails visibly on %s", async (_name, text, finishReason, error) => {
    provider.generateText.mockResolvedValue({ text, finishReason });
    await expect(proposeStudyTopics([syllabus], [])).rejects.toThrow(error);
  });

  it("validates exact paper quotes and explicit marks before returning a structure", async () => {
    const fixture = compulsoryFixture();
    respond(fixture.response);
    const structure = await extractStudyPaper(fixture.source, [], "2024/25");
    expect(structure.questions).toHaveLength(2);
    expect(
      structure.questions.every((question) =>
        isCurrentAnchor(question.source, fixture.source),
      ),
    ).toBe(true);
    fixture.response.questions[0].marks = 21;
    respond(fixture.response);
    await expect(
      extractStudyPaper(fixture.source, [], "2024/25"),
    ).rejects.toThrow(/marks are not explicitly/);
  });

  it.each(["quote", "question text", "topic", "parent", "choice quote"])(
    "rejects an unsupported %s in paper output",
    async (field) => {
      const fixture = compulsoryFixture();
      if (field === "quote")
        fixture.response.questions[0].source.quote = "Invented question";
      if (field === "question text")
        fixture.response.questions[0].text = "Invented question";
      if (field === "topic")
        fixture.response.questions[0].topicIds = [UNKNOWN_ID];
      if (field === "parent")
        fixture.response.questions.push({
          ...fixture.response.questions[0],
          id: "q1-a",
          parentId: "missing-parent",
        });
      if (field === "choice quote")
        fixture.response.sections[0].instructions = "Answer 1 of 2 questions.";
      respond(fixture.response);
      await expect(
        extractStudyPaper(fixture.source, [], "2024/25"),
      ).rejects.toThrow();
    },
  );

  it("rejects a cycle in nested subquestions", async () => {
    const fixture = compulsoryFixture();
    const root = fixture.response.questions[0];
    fixture.response.questions.push(
      { ...root, id: "q1-a", parentId: "q1-b" },
      { ...root, id: "q1-b", parentId: "q1-a" },
    );
    respond(fixture.response);
    await expect(
      extractStudyPaper(fixture.source, [], "2024/25"),
    ).rejects.toThrow(/cycle/);
  });

  it("does not infer a section is compulsory from another section's instructions", async () => {
    const fixture = compulsoryFixture();
    const questionText = "### Question 3 [10 marks]\nExplain Transactions.";
    const source = document(
      fixture.source.text.replace(
        "Answer all questions.",
        "Answer 1 of 2 questions.",
      ) + `\n## Section B\nAnswer all questions.\n${questionText}`,
    );
    fixture.response.sections[0].instructions = "";
    fixture.response.sections[0].source = null;
    fixture.response.sections.push({
      id: "section-b",
      name: "Section B",
      questionIds: ["q3"],
      answerCount: 1,
      instructions: "Answer all questions.",
      source: { quote: "Answer all questions.", occurrence: 0 },
    });
    fixture.response.questions.push({
      id: "q3",
      parentId: null,
      label: "Question 3",
      text: questionText,
      marks: 10,
      topicIds: [],
      style: "explain",
      source: { quote: questionText, occurrence: 0 },
    });
    respond(fixture.response);
    await expect(extractStudyPaper(source, [], "2024/25")).rejects.toThrow();
  });

  it("does not silently accept a paper response that omitted a printed root question", async () => {
    const fixture = compulsoryFixture();
    fixture.response.questions.pop();
    fixture.response.sections[0].questionIds = ["q1"];
    fixture.response.sections[0].answerCount = 1;
    respond(fixture.response);
    await expect(
      extractStudyPaper(fixture.source, [], "2024/25"),
    ).rejects.toThrow(/incomplete|omitted|manual review/i);
  });

  it("rejects an exact instruction quote borrowed from another section", async () => {
    const fixture = compulsoryFixture();
    const questionText = "### Question 3 [10 marks]\nExplain Transactions.";
    const source = document(
      fixture.source.text.replace(
        "Answer all questions.",
        "Answer 1 of 2 questions.",
      ) + `\n## Section B\nAnswer all questions.\n${questionText}`,
    );
    fixture.response.sections[0].instructions = "Answer all questions.";
    fixture.response.sections[0].source = {
      quote: "Answer all questions.",
      occurrence: 0,
    };
    fixture.response.sections.push({
      id: "section-b",
      name: "Section B",
      questionIds: ["q3"],
      answerCount: 1,
      instructions: "Answer all questions.",
      source: { quote: "Answer all questions.", occurrence: 0 },
    });
    fixture.response.questions.push({
      id: "q3",
      parentId: null,
      label: "Question 3",
      text: questionText,
      marks: 10,
      topicIds: [],
      style: "explain",
      source: { quote: questionText, occurrence: 0 },
    });
    respond(fixture.response);
    await expect(extractStudyPaper(source, [], "2024/25")).rejects.toThrow(
      /section|manual review/i,
    );
  });

  it("allows an explicit paper-wide compulsory rule to be reused across sections", async () => {
    const fixture = compulsoryFixture();
    const questionText = "### Question 3 [10 marks]\nExplain Transactions.";
    const source = document(
      fixture.source.text
        .replace("# Paper 2025\n", "# Paper 2025\nAnswer all questions.\n")
        .replace("## Section A\nAnswer all questions.", "## Section A") +
        `\n## Section B\n${questionText}`,
    );
    fixture.response.sections.push({
      id: "section-b",
      name: "Section B",
      questionIds: ["q3"],
      answerCount: 1,
      instructions: "Answer all questions.",
      source: { quote: "Answer all questions.", occurrence: 0 },
    });
    fixture.response.questions.push({
      id: "q3",
      parentId: null,
      label: "Question 3",
      text: questionText,
      marks: 10,
      topicIds: [],
      style: "explain",
      source: { quote: questionText, occurrence: 0 },
    });
    respond(fixture.response);
    const structure = await extractStudyPaper(source, [], "2024/25");
    expect(structure.sections.map((section) => section.answerCount)).toEqual([
      2, 1,
    ]);
    expect(analyseExamStructure(structure).answerableMarks).toEqual({
      min: 50,
      max: 50,
    });
  });

  it("rejects a borrowed rule from an earlier section even when it precedes the target's roots", async () => {
    const fixture = compulsoryFixture();
    const texts = [
      "### Question 3 [10 marks]\nExplain Transactions.",
      "### Question 4 [10 marks]\nExplain Trees.",
    ];
    const source = document(
      fixture.source.text +
        `\n## Section B\nAnswer 1 of 2 questions.\n${texts.join("\n")}`,
    );
    fixture.response.sections.push({
      id: "section-b",
      name: "Section B",
      questionIds: ["q3", "q4"],
      answerCount: 2,
      instructions: "Answer all questions.",
      source: { quote: "Answer all questions.", occurrence: 0 },
    });
    fixture.response.questions.push(
      ...texts.map((text, index) => ({
        id: `q${index + 3}`,
        parentId: null,
        label: `Question ${index + 3}`,
        text,
        marks: 10,
        topicIds: [],
        style: "explain",
        source: { quote: text, occurrence: 0 },
      })),
    );
    respond(fixture.response);
    await expect(extractStudyPaper(source, [], "2024/25")).rejects.toThrow(
      /different section/,
    );
  });

  it("recognizes standalone section headings when checking the instruction quote's section", async () => {
    const fixture = compulsoryFixture();
    const source = document(
      fixture.source.text.replace("## Section A", "Section A"),
    );
    respond(fixture.response);
    const structure = await extractStudyPaper(source, [], "2024/25");
    expect(structure.sections[0].answerCount).toBe(2);
  });

  it("allows one whole-paper section without a printed section heading", async () => {
    const fixture = compulsoryFixture();
    const source = document(fixture.source.text.replace("## Section A\n", ""));
    respond(fixture.response);
    const structure = await extractStudyPaper(source, [], "2024/25");
    expect(structure.sections[0].answerCount).toBe(2);
    expect(analyseExamStructure(structure).answerableMarks).toEqual({
      min: 40,
      max: 40,
    });
  });

  it("requires manual review when multiple source section boundaries cannot be verified", async () => {
    const fixture = compulsoryFixture();
    const source = document(fixture.source.text.replace("## Section A\n", ""));
    fixture.response.sections[0].questionIds = ["q1"];
    fixture.response.sections[0].answerCount = 1;
    fixture.response.sections.push({
      ...fixture.response.sections[0],
      id: "section-b",
      name: "Section B",
      questionIds: ["q2"],
    });
    respond(fixture.response);
    await expect(extractStudyPaper(source, [], "2024/25")).rejects.toThrow(
      /section boundaries.*manual|section boundaries|review the paper manually/i,
    );
  });

  it("does not verify a simple choice quote while omitting a mandatory rule in the same section", async () => {
    const fixture = compulsoryFixture();
    const source = document(
      fixture.source.text.replace(
        "Answer all questions.",
        "Answer 1 of 2 questions.\nQuestion 1 is mandatory.",
      ),
    );
    fixture.response.sections[0].answerCount = 1;
    fixture.response.sections[0].instructions = "Answer 1 of 2 questions.";
    fixture.response.sections[0].source = {
      quote: "Answer 1 of 2 questions.",
      occurrence: 0,
    };
    respond(fixture.response);
    await expect(extractStudyPaper(source, [], "2024/25")).rejects.toThrow(
      /rule|instruction|manual review/i,
    );
  });

  it("requires paper-wide mandatory rules to be cited alongside a local optional rule", async () => {
    const fixture = compulsoryFixture();
    const source = document(
      fixture.source.text
        .replace("# Paper 2025\n", "# Paper 2025\nQuestion 1 is mandatory.\n")
        .replace("Answer all questions.", "Answer 1 of 2 questions."),
    );
    fixture.response.sections[0].answerCount = 1;
    fixture.response.sections[0].instructions = "Answer 1 of 2 questions.";
    fixture.response.sections[0].source = {
      quote: "Answer 1 of 2 questions.",
      occurrence: 0,
    };
    respond(fixture.response);
    await expect(extractStudyPaper(source, [], "2024/25")).rejects.toThrow(
      /paper-wide citation omits/,
    );
  });

  it("keeps benign overview text around a valid global compulsory rule", async () => {
    const fixture = compulsoryFixture();
    const source = document(
      fixture.source.text
        .replace(
          "# Paper 2025\n",
          "# Paper 2025\nExplain why either algorithm works.\nAnswer all questions.\n",
        )
        .replace(
          "## Section A\nAnswer all questions.",
          "## Section A\nChoose a data structure and explain your choice.",
        ),
    );
    respond(fixture.response);
    const structure = await extractStudyPaper(source, [], "2024/25");
    expect(analyseExamStructure(structure).answerableMarks).toEqual({
      min: 40,
      max: 40,
    });
  });

  it("does not accept benign overview text as evidence for a manually supplied known count", () => {
    const fixture = compulsoryFixture();
    const overview = "Explain why either algorithm works.";
    const source = document(
      fixture.source.text.replace("Answer all questions.", overview),
    );
    const structure = examStructureSchema.parse({
      ...fixture.response,
      sections: fixture.response.sections.map((section) => ({
        ...section,
        instructions: overview,
        source: anchorFromQuote(source, overview),
      })),
      questions: fixture.response.questions.map((question) => ({
        ...question,
        source: anchorFromQuote(source, question.source.quote),
      })),
    });
    expect(() =>
      validateSectionInstructionPlacement(structure, source),
    ).toThrow(/explicit quoted choice instruction/);
  });
});

describe("study generation input bounds", () => {
  it("rejects oversized material before making a provider call", async () => {
    await expect(
      proposeStudyTopics([document("x".repeat(100_001))], []),
    ).rejects.toThrow(/context limit/);
    expect(provider.generateText).not.toHaveBeenCalled();
  });

  it("rejects an invalid existing hierarchy before invoking a provider", async () => {
    const topic = topicSchema.parse({
      id: TOPIC_ID,
      name: "Trees",
      definition: "Trees",
      parentId: UNKNOWN_ID,
    });
    await expect(proposeStudyTopics([syllabus], [topic])).rejects.toThrow(
      /unknown parent/,
    );
    expect(provider.generateText).not.toHaveBeenCalled();
  });

  it("honours cancellation before and after the provider response", async () => {
    const aborted = new AbortController();
    aborted.abort();
    await expect(
      proposeStudyTopics([syllabus], [], aborted.signal),
    ).rejects.toThrow();
    expect(provider.generateText).not.toHaveBeenCalled();
    vi.stubEnv("STUDY_CLASSIFIER_PROVIDER", "generative");
    const pending = new AbortController();
    provider.generateText.mockImplementation(async () => {
      pending.abort();
      return {
        text: JSON.stringify({ topics: [proposal()] }),
        finishReason: "stop",
      };
    });
    await expect(
      proposeStudyTopics([syllabus], [], pending.signal),
    ).rejects.toThrow();
  });
});
