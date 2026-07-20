export const APP_GUIDE_TOPIC_IDS = [
  "getting-started",
  "notes-and-folders",
  "canvas",
  "ai-chat",
  "search-and-sources",
  "quizzes-and-flashcards",
  "calendar-and-focus",
  "settings-and-account",
  "troubleshooting",
  "capabilities-and-limits",
] as const;

export type AppGuideTopicId = (typeof APP_GUIDE_TOPIC_IDS)[number];

export const SUGGESTED_APP_HELP_PROMPTS = [
  "What does Canvas import include?",
  "Can OghmaNotes make flashcards and quizzes?",
  "Can I integrate Canvas deadlines?",
] as const;

export interface AppGuideTopic {
  id: AppGuideTopicId;
  title: string;
  summary: string;
  routes: string[];
  keywords: string[];
  steps: string[];
  tips: string[];
  limitations: string[];
}

export const APP_GUIDE_TOPICS: readonly AppGuideTopic[] = [
  {
    id: "getting-started",
    title: "Getting started",
    summary: "A short path from an empty workspace to useful course-aware study.",
    routes: ["/notes", "/settings#canvas", "/chat"],
    keywords: ["start", "begin", "new user", "tour", "first", "setup", "onboarding"],
    steps: [
      "Create a note or a folder for each course in Notes.",
      "Open Settings → Canvas to connect Canvas and import the courses you want.",
      "Open AI Chat and attach a relevant note or folder when you want a tightly scoped answer.",
      "Use quizzes, flashcards, and Calendar to turn material into practice and scheduled study.",
    ],
    tips: ["Start with one current course so the workspace and search results stay easy to understand."],
    limitations: ["Imported files may need processing time before their text is available to search and chat."],
  },
  {
    id: "notes-and-folders",
    title: "Notes and folders",
    summary: "Write Markdown notes, arrange them in folders, and keep course material together.",
    routes: ["/notes", "/syntax-guide"],
    keywords: ["note", "folder", "markdown", "editor", "write", "rename", "move", "organise", "organize", "syntax"],
    steps: [
      "Open Notes and use the sidebar controls to create a note or folder.",
      "Select a note to edit it; changes are saved by the app.",
      "Use folders to group related lectures, readings, and imported course files.",
      "Open the Markdown syntax guide when you need formatting examples.",
    ],
    tips: ["The chat can create, rename, and move notes when you ask it clearly and provide the destination when needed."],
    limitations: ["The chat cannot safely infer which similarly named folder you mean; clarify the course or folder when ambiguous."],
  },
  {
    id: "canvas",
    title: "Canvas connection and import",
    summary: "Connect Canvas from Settings, choose courses, and import supported course material.",
    routes: ["/settings#canvas"],
    keywords: ["canvas", "import", "sync", "course", "module", "assignment", "token", "lecture slides", "lms"],
    steps: [
      "Open Settings → Canvas.",
      "Enter your Canvas URL and API token using the on-screen token instructions.",
      "Choose the courses you want OghmaNotes to import and start the import.",
      "Keep the imported material organised by course, then ask chat questions grounded in those notes.",
    ],
    tips: ["Canvas access for AI Chat is controlled separately in AI Settings and uses server-side tools when enabled."],
    limitations: [
      "Never paste a Canvas API token into chat; enter it only in the Canvas connection form.",
      "Canvas permissions and course restrictions still apply, and some files may require OCR or may fail extraction.",
    ],
  },
  {
    id: "ai-chat",
    title: "AI Chat",
    summary: "Ask questions, scope them to study material, and inspect sources and tool activity.",
    routes: ["/chat", "/settings#ai"],
    keywords: ["chat", "assistant", "use notes", "thinking", "context", "attach", "conversation", "model", "rag"],
    steps: [
      "Open AI Chat for a full conversation, or use the compact assistant beside a note for local context.",
      "Attach notes or folders when the answer should focus on specific material.",
      "Leave Use notes on for grounded note retrieval; turn it off for a general-knowledge answer that does not need your library.",
      "Use Thinking for harder questions and turn it off when a direct, lower-token answer is enough.",
      "Check cited sources and the activity panel instead of assuming every generated claim is correct.",
    ],
    tips: ["Name the course, lecture, or attached note and describe the output you want, such as a recap, comparison, or practice questions."],
    limitations: ["AI answers can be wrong. Verify important academic requirements against the original course material."],
  },
  {
    id: "search-and-sources",
    title: "Search, scope, and sources",
    summary: "Help chat find the right passage and understand why a source may be missing.",
    routes: ["/notes", "/chat"],
    keywords: ["search", "source", "citation", "find", "missing", "scope", "exact", "semantic", "pdf"],
    steps: [
      "Attach the relevant note or folder to narrow a chat session.",
      "Use a distinctive phrase, formula, lecturer name, or topic in your question.",
      "If a scoped search finds nothing, ask chat to search the full library.",
      "Open the cited note to verify the answer in its original context.",
    ],
    tips: ["Exact terms help with names and formulas; descriptive questions help semantic search find conceptually related passages."],
    limitations: ["Unprocessed, restricted, or unsuccessfully extracted files cannot provide searchable text."],
  },
  {
    id: "quizzes-and-flashcards",
    title: "Quizzes and flashcards",
    summary: "Turn course material into practice questions and spaced-repetition review.",
    routes: ["/quiz"],
    keywords: ["quiz", "question", "flashcard", "flash card", "deck", "review", "spaced repetition", "practice"],
    steps: [
      "Open Quizzes and choose the course material you want to practise.",
      "Generate or answer study questions, then review weak areas in the source notes.",
      "Use flashcard review regularly so spaced repetition can schedule cards over time.",
    ],
    tips: ["Use a focused course or topic rather than generating practice from an entire mixed library."],
    limitations: ["Generated questions and answers may contain mistakes; check them against cited course material."],
  },
  {
    id: "calendar-and-focus",
    title: "Calendar and focus",
    summary: "Plan coursework with assignments, time blocks, Pomodoro tracking, and a focus timer.",
    routes: ["/calendar"],
    keywords: ["calendar", "schedule", "plan", "time block", "pomodoro", "focus", "deadline", "due", "study block"],
    steps: [
      "Open Calendar to see assignments and scheduled study blocks.",
      "Create a time block with a start and end time, optionally linked to an assignment.",
      "Use the focus timer or Pomodoro tracking while studying and mark the block complete afterward.",
    ],
    tips: ["The chat can inspect, create, and complete time blocks when you give it clear dates and times."],
    limitations: ["A calendar time block is different from a note; ask to schedule study rather than save written content."],
  },
  {
    id: "settings-and-account",
    title: "Settings and account",
    summary: "Manage Canvas, AI access, imports, appearance, data, and account options.",
    routes: ["/settings", "/settings#canvas", "/settings#ai"],
    keywords: ["setting", "account", "language", "theme", "privacy", "export", "delete", "password", "ai access", "permission"],
    steps: [
      "Open Settings and choose the relevant section.",
      "Use Canvas settings for the LMS connection and imports.",
      "Use AI settings to control whether chat may access connected Canvas data.",
      "Review account and data controls carefully before destructive actions.",
    ],
    tips: ["Use the Contact page if an account or data-recovery option is not available in Settings."],
    limitations: ["The guide does not claim that deleted account data can be automatically recovered; contact support for the current recovery path."],
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    summary: "Resolve common import, source, chat, and Canvas problems.",
    routes: ["/settings#canvas", "/chat", "/contact"],
    keywords: ["problem", "error", "failed", "stuck", "not working", "cannot", "can't", "troubleshoot", "support"],
    steps: [
      "Check the visible error or import status and retry only after it has stopped running.",
      "For missing chat sources, confirm the material imported successfully and attach the relevant note or folder.",
      "For Canvas failures, check the Canvas URL, token, permissions, and selected courses in Settings.",
      "If generation was interrupted, reopen the conversation and use its resume or retry path when offered.",
      "Use Contact when the app does not provide a safe self-service recovery step.",
    ],
    tips: ["Include the screen, course, and visible error message when contacting support, but never include passwords or API tokens."],
    limitations: ["This guide cannot inspect deployment health or repair an account by itself."],
  },
  {
    id: "capabilities-and-limits",
    title: "Capabilities and limits",
    summary: "What OghmaNotes can do today and where human verification is required.",
    routes: ["/notes", "/chat", "/quiz", "/calendar", "/settings"],
    keywords: ["can you", "can it", "capability", "feature", "limit", "supported", "do you have", "what can"],
    steps: [
      "Use Notes for writing, folders, imports, and source material.",
      "Use AI Chat for cited questions, summaries, note actions, planning actions, and permitted Canvas actions.",
      "Use Quizzes and flashcards for practice, and Calendar for coursework planning and focus sessions.",
    ],
    tips: ["Ask about one intended outcome and the guide will point to the relevant workflow."],
    limitations: [
      "Discovery does not grant permission: account, Canvas, and user-data boundaries still apply.",
      "Do not rely on AI output as the authoritative source for deadlines, grading rules, or academic requirements.",
    ],
  },
] as const;

const TOPICS_BY_ID = new Map(APP_GUIDE_TOPICS.map((topic) => [topic.id, topic]));

function renderTopic(topic: AppGuideTopic): string {
  const section = (title: string, entries: string[]) =>
    entries.length > 0
      ? `\n\n${title}:\n${entries.map((entry) => `- ${entry}`).join("\n")}`
      : "";

  return [
    `# ${topic.title}`,
    topic.summary,
    section("Open", topic.routes),
    section("Steps", topic.steps),
    section("Tips", topic.tips),
    section("Limits", topic.limitations),
  ].join("");
}

export function findAppGuideTopic(question: string): AppGuideTopic | null {
  const normalized = question.trim().toLowerCase();
  if (!normalized) return null;

  let best: { topic: AppGuideTopic; score: number } | null = null;
  for (const topic of APP_GUIDE_TOPICS) {
    const candidates = [topic.id.replaceAll("-", " "), topic.title.toLowerCase(), ...topic.keywords];
    const score = candidates.reduce(
      (total, candidate) => total + (normalized.includes(candidate.toLowerCase()) ? candidate.length : 0),
      0,
    );
    if (score > 0 && (!best || score > best.score)) best = { topic, score };
  }
  return best?.topic ?? null;
}

export function getAppGuide(input: { topic?: AppGuideTopicId; question?: string } = {}): {
  matchedTopic: AppGuideTopicId | null;
  guide: string;
  availableTopics: { id: AppGuideTopicId; title: string }[];
} {
  const selected = input.topic
    ? TOPICS_BY_ID.get(input.topic) ?? null
    : input.question
      ? findAppGuideTopic(input.question)
      : null;

  return {
    matchedTopic: selected?.id ?? null,
    guide: selected
      ? renderTopic(selected)
      : "# OghmaNotes app guide\nAsk about getting started, notes, Canvas, AI Chat, search and sources, quizzes and flashcards, calendar and focus, settings, troubleshooting, or current capabilities.",
    availableTopics: APP_GUIDE_TOPICS.map(({ id, title }) => ({ id, title })),
  };
}

export function renderGettingStartedNote(): string {
  const topic = TOPICS_BY_ID.get("getting-started")!;
  return `${renderTopic(topic)}

## Fun fact: Who is Oghma?

In Irish mythology, Oghma (or Ogma) is linked with eloquence, language, and learning, and is traditionally associated with the Ogham script.

You're ready to start building your study vault.`;
}
