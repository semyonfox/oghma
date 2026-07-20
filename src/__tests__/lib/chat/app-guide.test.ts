import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  APP_GUIDE_TOPIC_IDS,
  APP_GUIDE_TOPICS,
  SUGGESTED_APP_HELP_PROMPTS,
  findAppGuideTopic,
  getAppGuide,
  renderGettingStartedNote,
} from "@/lib/chat/app-guide";
import { createChatTools } from "@/lib/chat/build-stream";

describe("app guide", () => {
  it("defines complete, unique topics with internal routes", () => {
    expect(new Set(APP_GUIDE_TOPICS.map((topic) => topic.id)).size).toBe(
      APP_GUIDE_TOPIC_IDS.length,
    );
    expect(APP_GUIDE_TOPICS.map((topic) => topic.id)).toEqual(
      APP_GUIDE_TOPIC_IDS,
    );

    for (const topic of APP_GUIDE_TOPICS) {
      expect(topic.title).not.toBe("");
      expect(topic.summary).not.toBe("");
      expect(topic.steps.length).toBeGreaterThan(0);
      expect(topic.routes.every((route) => route.startsWith("/"))).toBe(true);
    }
  });

  it.each([
    ["How do I import a Canvas course?", "canvas"],
    ["What does Use notes mean in chat?", "ai-chat"],
    ["My PDF is missing from search", "search-and-sources"],
    ["Help me schedule a Pomodoro", "calendar-and-focus"],
    ["I just registered, where do I start?", "getting-started"],
  ] as const)("matches %s to %s", (question, expected) => {
    expect(findAppGuideTopic(question)?.id).toBe(expected);
  });

  it("returns an overview instead of inventing a match", () => {
    expect(findAppGuideTopic("xyzzy plugh")).toBeNull();

    const result = getAppGuide();
    expect(result.matchedTopic).toBeNull();
    expect(result.guide).toContain("OghmaNotes app guide");
    expect(result.availableTopics).toHaveLength(APP_GUIDE_TOPIC_IDS.length);
  });

  it("renders the starter note from the canonical getting-started topic", () => {
    const note = renderGettingStartedNote();
    const guide = getAppGuide({ topic: "getting-started" }).guide;

    expect(note.startsWith(guide)).toBe(true);
    expect(note).toContain("/settings#canvas");
    expect(note).toContain("Who is Oghma?");
  });

  it("has non-empty translations for every suggested app-help prompt", () => {
    const localeDirectory = path.join(process.cwd(), "src/locales");
    const localeFiles = fs
      .readdirSync(localeDirectory)
      .filter(
        (fileName) =>
          fileName.endsWith(".json") &&
          fileName !== "STRINGS_MAPPING_EN_FR.json",
      );

    for (const fileName of localeFiles) {
      const locale = JSON.parse(
        fs.readFileSync(path.join(localeDirectory, fileName), "utf8"),
      ) as Record<string, unknown>;

      for (const prompt of SUGGESTED_APP_HELP_PROMPTS) {
        expect(locale[prompt], `${fileName}: ${prompt}`).toEqual(
          expect.stringMatching(/\S/),
        );
      }
    }
  });

  it.each([true, false])(
    "registers app-guide and retrieval tools when retrievalEnabled is %s",
    (retrievalEnabled) => {
      const { tools } = createChatTools(
        "user-id",
        "session-id",
        null,
        {},
        retrievalEnabled,
      );

      expect(tools).toHaveProperty("getAppGuide");
      expect("getChunks" in tools).toBe(retrievalEnabled);
      expect("readNote" in tools).toBe(retrievalEnabled);
    },
  );
});
