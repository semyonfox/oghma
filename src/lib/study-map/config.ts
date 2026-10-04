import { createLlmProvider } from "@/lib/ai-config";

export type StudyClassifier = "jev" | "generative" | "mock";

export function studyClassifier(): StudyClassifier {
  const value = process.env.STUDY_CLASSIFIER_PROVIDER ?? "jev";
  if (value === "jev" || value === "generative" || value === "mock") return value;
  throw new Error("STUDY_CLASSIFIER_PROVIDER must be jev, generative, or mock");
}

export function isStudyMock(): boolean {
  if (studyClassifier() !== "mock") return false;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Study Map mock mode requires a disposable database");
  const parsed = new URL(url);
  if (!parsed.pathname.includes("e2e") || !["localhost", "127.0.0.1", "::1", "postgres"].includes(parsed.hostname)) {
    throw new Error("Study Map mock mode is restricted to a local e2e database");
  }
  return true;
}

export function jevApiKey(): string | undefined {
  const explicit = process.env.JEV_API_KEY?.trim() || process.env.OPENROUTER_API_KEY?.trim();
  if (explicit) return explicit;
  try {
    if (new URL(process.env.LLM_API_URL ?? "https://openrouter.ai/api/v1").hostname === "openrouter.ai") {
      return process.env.LLM_API_KEY?.trim() || undefined;
    }
  } catch { /* invalid provider URLs do not select a credential */ }
  return undefined;
}

export function studyProviderStatus() {
  const classifier = studyClassifier();
  const mock = classifier === "mock" && isStudyMock();
  const generationReady = mock || createLlmProvider() !== null;
  return {
    classifier,
    ready: mock || (classifier === "jev" ? Boolean(jevApiKey()) : generationReady),
    generationReady,
  };
}
