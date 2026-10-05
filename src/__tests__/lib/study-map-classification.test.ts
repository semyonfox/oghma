import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { classifyStudySource } from "@/lib/study-map/classification";
import { sourceDocument } from "@/lib/study-map/evidence";
import { topicSchema, type StudyTopic } from "@/lib/study-map/types";

const provider = vi.hoisted(() => ({
  generateText: vi.fn(),
  createLlmProvider: vi.fn(),
  getLlmModel: vi.fn(),
}));
vi.mock("ai", () => ({ generateText: provider.generateText }));
vi.mock("@/lib/ai-config", () => ({
  createLlmProvider: provider.createLlmProvider,
  getLlmModel: provider.getLlmModel,
}));

const requestSchema = z.object({
  model: z.string(),
  state: z.object({
    title: z.string(),
    passages: z.array(z.object({ id: z.string(), text: z.string() })),
    topics: z.array(z.object({ id: z.string() }).passthrough()),
  }),
  questions: z.record(
    z.string(),
    z.object({
      type: z.enum(["choice", "noul"]),
      instructions: z.string(),
      criteria: z.record(z.string(), z.string()),
    }),
  ),
});
type ClassifierRequest = z.infer<typeof requestSchema>;
interface WireResponse {
  model: string;
  answers: Record<string, unknown>;
  usage: { input_tokens: number; output_tokens?: number; cost?: number | null };
}
const fetchMock = vi.fn<typeof fetch>();
const topicA = "11111111-1111-4111-8111-111111111111";
const topicB = "22222222-2222-4222-8222-222222222222";
const unknownTopic = "33333333-3333-4333-8333-333333333333";
const source = sourceDocument({
  noteId: "44444444-4444-4444-8444-444444444444",
  title: "Lecture",
  content:
    "A transaction has atomicity. A foreign key preserves referential integrity.",
  extractedText: null,
});
const topics: StudyTopic[] = [
  topicSchema.parse({
    id: topicA,
    name: "Transactions",
    definition: "Atomic database transactions",
    reviewed: true,
  }),
  topicSchema.parse({
    id: topicB,
    name: "Relational integrity",
    definition: "Relational constraints and foreign keys",
    reviewed: true,
  }),
];

function requestFrom(init: RequestInit | undefined): ClassifierRequest {
  if (typeof init?.body !== "string")
    throw new Error("Expected a JSON request body");
  return requestSchema.parse(JSON.parse(init.body));
}

function topicQuestion(request: ClassifierRequest, topicId = topicA): string {
  const entry = Object.entries(request.questions).find(
    ([, question]) =>
      "CORE" in question.criteria && question.instructions.includes(topicId),
  );
  if (!entry) throw new Error(`Topic ${topicId} was not requested`);
  return entry[0];
}

function choice(
  request: ClassifierRequest,
  id: string,
  selected: string,
  probabilities?: Record<string, number>,
  confidence: number | null = null,
) {
  return {
    type: "choice",
    choice: selected,
    probabilities:
      probabilities ??
      Object.fromEntries(
        Object.keys(request.questions[id].criteria).map((key) => [
          key,
          key === selected ? 1 : 0,
        ]),
      ),
    confidence,
  };
}

function responseFor(request: ClassifierRequest): WireResponse {
  return {
    model: "test-decisions",
    usage: { input_tokens: 31, cost: 0.02 },
    answers: Object.fromEntries(
      Object.entries(request.questions).map(([id, question]) => [
        id,
        question.type === "noul"
          ? { type: "noul", noul: 0 }
          : choice(
              request,
              id,
              "UNRELATED" in question.criteria ? "UNRELATED" : "notes",
            ),
      ]),
    ),
  };
}

function respond(
  edit?: (body: WireResponse, request: ClassifierRequest) => void,
): void {
  fetchMock.mockImplementation(async (_url, init) => {
    const request = requestFrom(init);
    const body = responseFor(request);
    edit?.(body, request);
    // returning the object directly also exercises non-JSON numeric values at the validation boundary
    const response = new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    vi.spyOn(response, "json").mockResolvedValue(body);
    return response;
  });
}

beforeEach(() => {
  vi.stubEnv("STUDY_CLASSIFIER_PROVIDER", "jev");
  vi.stubEnv("JEV_API_KEY", "test-provider-key");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  provider.generateText.mockReset();
  provider.createLlmProvider.mockReset().mockReturnValue(() => ({}));
  provider.getLlmModel.mockReset().mockReturnValue("test-generative");
  respond();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("study classifier Decisions boundary", () => {
  it("keeps simultaneous topic relevance separate from probability and confidence", async () => {
    respond((body, request) => {
      const first = topicQuestion(request);
      const second = topicQuestion(request, topicB);
      body.answers[first] = choice(
        request,
        first,
        "CORE",
        { CORE: 0.25, SUPPORTING: 0.4, UNRELATED: 0.35 },
        0.04,
      );
      body.answers[second] = choice(
        request,
        second,
        "SUPPORTING",
        { CORE: 0.05, SUPPORTING: 0.9, UNRELATED: 0.05 },
        0.99,
      );
    });
    const result = await classifyStudySource(source, topics);
    expect(result.associations).toEqual([
      expect.objectContaining({
        topicId: topicA,
        relevance: "core",
        probability: 0.65,
        status: "suggested",
        evidence: [
          expect.objectContaining({
            relevance: "core",
            probability: 0.65,
            confidence: 0.04,
          }),
        ],
      }),
      expect.objectContaining({
        topicId: topicB,
        relevance: "supporting",
        status: "suggested",
        evidence: [
          expect.objectContaining({
            relevance: "supporting",
            confidence: 0.99,
          }),
        ],
      }),
    ]);
    expect(
      result.associations.every(
        (association) => association.status === "suggested",
      ),
    ).toBe(true);
    expect(result.associations[1].probability).toBeCloseTo(0.95);
    expect(result.associations[1].evidence[0].probability).toBeCloseTo(0.95);
    expect(result.associations[0].evidence[0].anchor.quote).toBe(source.text);
    expect(result).toMatchObject({
      kind: "notes",
      model: "test-decisions",
      inputTokens: 31,
      cost: 0.02,
    });
  });

  it("does not turn an incidental mention or high confidence into topic relevance", async () => {
    respond((body, request) => {
      const first = topicQuestion(request);
      const second = topicQuestion(request, topicB);
      body.answers[first] = choice(
        request,
        first,
        "UNRELATED",
        { CORE: 0.05, SUPPORTING: 0.05, UNRELATED: 0.9 },
        1,
      );
      body.answers[second] = choice(
        request,
        second,
        "CORE",
        { CORE: 0.3, SUPPORTING: 0.2, UNRELATED: 0.5 },
        1,
      );
      expect(request.questions[first].criteria.UNRELATED).toMatch(/passing/);
    });
    expect((await classifyStudySource(source, topics)).associations).toEqual(
      [],
    );
  });

  it("only asks for reviewed server topics and rejects a topic ID as a choice", async () => {
    const unreviewed = { ...topics[1], reviewed: false };
    respond((body, request) => {
      expect(request.state.topics.map((topic) => topic.id)).toEqual([topicA]);
      expect(
        Object.values(request.questions).some((question) =>
          question.instructions.includes(topicB),
        ),
      ).toBe(false);
      const id = topicQuestion(request);
      body.answers[id] = choice(request, id, unknownTopic);
    });
    await expect(
      classifyStudySource(source, [topics[0], unreviewed]),
    ).rejects.toThrow(/unknown choice or topic/);
  });

  it.each(["missing", "extra", "replacement"])(
    "rejects %s answer IDs against the requested questions",
    async (kind) => {
      respond((body, request) => {
        const id = topicQuestion(request);
        if (kind !== "extra") delete body.answers[id];
        if (kind !== "missing")
          body.answers[`topic_${unknownTopic}`] = choice(request, id, "CORE");
      });
      await expect(classifyStudySource(source, topics)).rejects.toThrow(
        /missing or unknown question IDs/,
      );
    },
  );

  it("rejects a label answer supplied for a choice question", async () => {
    respond((body, request) => {
      body.answers[topicQuestion(request)] = { type: "noul", noul: 1 };
    });
    await expect(classifyStudySource(source, topics)).rejects.toThrow(
      /unexpected answer type/,
    );
  });

  it.each([-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid probability %s",
    async (value) => {
      respond((body, request) => {
        const id = topicQuestion(request);
        body.answers[id] = choice(request, id, "CORE", {
          CORE: value,
          SUPPORTING: 0,
          UNRELATED: 0,
        });
      });
      await expect(classifyStudySource(source, topics)).rejects.toThrow(
        /invalid Decisions response/,
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each<{ name: string; distribution: Record<string, number> }>([
    { name: "missing criterion", distribution: { CORE: 0.8, SUPPORTING: 0.2 } },
    {
      name: "extra criterion",
      distribution: { CORE: 1, SUPPORTING: 0, UNRELATED: 0, UNKNOWN: 0 },
    },
    {
      name: "total outside the rounding tolerance",
      distribution: { CORE: 0.681, SUPPORTING: 0.34, UNRELATED: 0 },
    },
  ])("rejects a distribution with $name", async ({ distribution }) => {
    respond((body, request) => {
      const id = topicQuestion(request);
      body.answers[id] = choice(request, id, "CORE", distribution);
    });
    await expect(classifyStudySource(source, topics)).rejects.toThrow(
      /probability distribution|sum to one/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      name: "rounded above one",
      probabilities: { CORE: 0.67, SUPPORTING: 0.34, UNRELATED: 0 },
    },
    {
      name: "rounded below one",
      probabilities: { CORE: 0.66, SUPPORTING: 0.33, UNRELATED: 0 },
    },
  ])(
    "normalizes a distribution $name while preserving the raw answer",
    async ({ probabilities }) => {
      respond((body, request) => {
        const id = topicQuestion(request);
        body.answers[id] = choice(request, id, "CORE", probabilities);
      });

      const result = await classifyStudySource(source, topics);
      const rawSchema = z.array(
        z.object({
          judgements: z.array(
            z.object({
              questionId: z.string(),
              answer: z.unknown(),
              model: z.string(),
            }),
          ),
        }),
      );
      const judgements = rawSchema
        .parse(result.rawDecisions)
        .flatMap((passage) => passage.judgements);
      const rawTopicAnswer = judgements.find((judgement) =>
        judgement.questionId.includes(topicA),
      )?.answer;

      expect(result.associations).toEqual([
        expect.objectContaining({ topicId: topicA, probability: 1 }),
      ]);
      expect(rawTopicAnswer).toMatchObject({ probabilities });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("applies the relevance threshold to normalized probability mass", async () => {
    respond((body, request) => {
      const below = topicQuestion(request, topicA);
      const at = topicQuestion(request, topicB);
      body.answers[below] = choice(request, below, "CORE", {
        CORE: 0.58,
        SUPPORTING: 0.01,
        UNRELATED: 0.4,
      });
      body.answers[at] = choice(request, at, "CORE", {
        CORE: 0.59,
        SUPPORTING: 0.01,
        UNRELATED: 0.39,
      });
    });

    const result = await classifyStudySource(source, topics);

    expect(result.associations).toEqual([
      expect.objectContaining({
        topicId: topicB,
        probability: expect.closeTo(0.6 / 0.99),
      }),
    ]);
  });

  it.each([-0.1, 1.1, Number.NaN])(
    "rejects invalid confidence %s",
    async (confidence) => {
      respond((body, request) => {
        const id = topicQuestion(request);
        body.answers[id] = choice(request, id, "CORE", undefined, confidence);
      });
      await expect(classifyStudySource(source, topics)).rejects.toThrow(
        /invalid Decisions response/,
      );
    },
  );

  it.each(["missing", "null"])(
    "accepts %s confidence and cost without inventing them",
    async (kind) => {
      respond((body, request) => {
        const id = topicQuestion(request);
        const answer = choice(request, id, "CORE");
        body.answers[id] =
          kind === "missing"
            ? {
                type: answer.type,
                choice: answer.choice,
                probabilities: answer.probabilities,
              }
            : answer;
        body.usage =
          kind === "missing"
            ? { input_tokens: 31 }
            : { input_tokens: 31, cost: null };
      });
      const result = await classifyStudySource(source, topics);
      expect(result.cost).toBeNull();
      expect(result.associations[0].evidence[0].confidence).toBeNull();
    },
  );

  it("preserves each raw provider answer, including an omitted optional field", async () => {
    let sentAnswers: Record<string, unknown> = {};
    respond((body, request) => {
      const id = topicQuestion(request);
      const answer = choice(request, id, "CORE");
      body.answers[id] = {
        type: answer.type,
        choice: answer.choice,
        probabilities: answer.probabilities,
      };
      sentAnswers = body.answers;
    });
    const result = await classifyStudySource(source, topics);
    const rawSchema = z.array(
      z.object({
        judgements: z.array(
          z.object({
            questionId: z.string(),
            answer: z.unknown(),
            model: z.string(),
          }),
        ),
      }),
    );
    const judgements = rawSchema
      .parse(result.rawDecisions)
      .flatMap((passage) => passage.judgements);
    expect(
      Object.fromEntries(
        judgements.map((judgement) => [judgement.questionId, judgement.answer]),
      ),
    ).toEqual(sentAnswers);
    expect(
      judgements.every((judgement) => judgement.model === "test-decisions"),
    ).toBe(true);
  });

  it("uses noul probability for labels without applying confidence", async () => {
    respond((body, request) => {
      const labels = Object.entries(request.questions).filter(
        ([, question]) => question.type === "noul",
      );
      const definition = labels.find(([, question]) =>
        question.instructions.includes("definition"),
      );
      const example = labels.find(([, question]) =>
        question.instructions.includes("worked example"),
      );
      if (!definition || !example)
        throw new Error("Expected definition and example questions");
      body.answers[definition[0]] = { type: "noul", noul: 0.65 };
      body.answers[example[0]] = { type: "noul", noul: 0.64 };
    });
    expect((await classifyStudySource(source, topics)).labels).toEqual([
      "definition",
    ]);
  });

  it.each([-0.1, Number.NaN, 1.1])(
    "rejects invalid noul probability %s",
    async (value) => {
      respond((body, request) => {
        const entry = Object.entries(request.questions).find(
          ([, question]) => question.type === "noul",
        );
        if (!entry) throw new Error("No label question");
        body.answers[entry[0]] = { type: "noul", noul: value };
      });
      await expect(classifyStudySource(source, topics)).rejects.toThrow(
        /invalid Decisions response/,
      );
    },
  );
});

describe("study classifier request retries", () => {
  it("bounds a 429 Retry-After delay to 30 seconds", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 429, headers: { "Retry-After": "99999" } }),
    );
    const result = classifyStudySource(source, topics);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await result).kind).toBe("notes");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("honours a valid Retry-After rather than immediately retrying", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 429, headers: { "Retry-After": "2" } }),
    );
    const result = classifyStudySource(source, topics);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries network failures and HTTP 5xx with a three-attempt limit", async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValueOnce(new TypeError("network unavailable"));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    const failure = expect(classifyStudySource(source, topics)).rejects.toThrow(
      /HTTP 500/,
    );
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2_000);
    await failure;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries the in-flight 402 budget but fails exhausted credits immediately", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(
      Response.json(
        {
          error: { metadata: { limit_source: "openrouter_in_flight_budget" } },
        },
        { status: 402 },
      ),
    );
    const result = classifyStudySource(source, topics);
    await vi.advanceTimersByTimeAsync(1_000);
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce(
      Response.json(
        { error: { metadata: { limit_source: "credits" } } },
        { status: 402 },
      ),
    );
    await expect(classifyStudySource(source, topics)).rejects.toThrow(
      /credits are exhausted/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry an ordinary 4xx", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 400 }));
    await expect(classifyStudySource(source, topics)).rejects.toThrow(
      /HTTP 400/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts before a request and while waiting to retry", async () => {
    vi.useFakeTimers();
    const initial = new AbortController();
    initial.abort(new Error("cancelled before request"));
    await expect(
      classifyStudySource(source, topics, initial.signal),
    ).rejects.toThrow(/cancelled before/);
    expect(fetchMock).not.toHaveBeenCalled();
    const controller = new AbortController();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    const failure = expect(
      classifyStudySource(source, topics, controller.signal),
    ).rejects.toThrow(/cancelled during retry/);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort(new Error("cancelled during retry"));
    await failure;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("propagates cancellation during fetch without retries", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) throw new Error("No request signal");
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
    );
    const failure = expect(
      classifyStudySource(source, topics, controller.signal),
    ).rejects.toThrow(/cancelled fetch/);
    controller.abort(new Error("cancelled fetch"));
    await failure;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("study classifier alternate providers", () => {
  it("keeps generative relevance suggestions without fabricated probabilities or confidence", async () => {
    vi.stubEnv("STUDY_CLASSIFIER_PROVIDER", "generative");
    provider.generateText.mockImplementation(async (options: unknown) => {
      const { prompt } = z
        .object({ prompt: z.string() })
        .passthrough()
        .parse(options);
      const request = requestSchema.parse(JSON.parse(prompt));
      const first = topicQuestion(request);
      const second = topicQuestion(request, topicB);
      const answers = Object.fromEntries(
        Object.entries(request.questions).map(([id, question]) => [
          id,
          question.type === "noul"
            ? { type: "noul", noul: false }
            : {
                type: "choice",
                choice:
                  id === first
                    ? "CORE"
                    : id === second
                      ? "SUPPORTING"
                      : "notes",
              },
        ]),
      );
      return {
        text: JSON.stringify({ answers }),
        totalUsage: { inputTokens: 12 },
        providerMetadata: {},
      };
    });
    const result = await classifyStudySource(source, topics);
    expect(result.associations).toEqual([
      expect.objectContaining({
        topicId: topicA,
        relevance: "core",
        probability: null,
        status: "suggested",
        evidence: [
          expect.objectContaining({ probability: null, confidence: null }),
        ],
      }),
      expect.objectContaining({
        topicId: topicB,
        relevance: "supporting",
        probability: null,
        status: "suggested",
        evidence: [
          expect.objectContaining({ probability: null, confidence: null }),
        ],
      }),
    ]);
    expect(result.cost).toBeNull();
    expect(result.inputTokens).toBe(12);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unknown generative question IDs", async () => {
    vi.stubEnv("STUDY_CLASSIFIER_PROVIDER", "generative");
    provider.generateText.mockResolvedValue({
      text: JSON.stringify({
        answers: { [unknownTopic]: { type: "choice", choice: "CORE" } },
      }),
      totalUsage: {},
    });
    await expect(classifyStudySource(source, topics)).rejects.toThrow(
      /missing or unknown question IDs/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects fabricated generative probabilities", async () => {
    vi.stubEnv("STUDY_CLASSIFIER_PROVIDER", "generative");
    provider.generateText.mockResolvedValue({
      text: JSON.stringify({
        answers: {
          invented: { type: "choice", choice: "CORE", confidence: 0.9 },
        },
      }),
      totalUsage: {},
    });
    await expect(classifyStudySource(source, topics)).rejects.toThrow(
      /invalid classification answers/,
    );
  });

  it.each([
    undefined,
    "postgresql://remote.invalid/study_e2e",
    "postgresql://localhost/study",
  ])(
    "rejects mock mode outside an isolated local e2e database %s",
    async (database) => {
      vi.stubEnv("STUDY_CLASSIFIER_PROVIDER", "mock");
      vi.stubEnv("DATABASE_URL", database);
      await expect(classifyStudySource(source, topics)).rejects.toThrow(
        /disposable database|local e2e database/,
      );
      expect(fetchMock).not.toHaveBeenCalled();
      expect(provider.generateText).not.toHaveBeenCalled();
    },
  );

  it("allows isolated mock mode without calling either provider", async () => {
    vi.stubEnv("STUDY_CLASSIFIER_PROVIDER", "mock");
    vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost/study_e2e");
    expect((await classifyStudySource(source, topics)).model).toBe("mock");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(provider.generateText).not.toHaveBeenCalled();
  });
});
