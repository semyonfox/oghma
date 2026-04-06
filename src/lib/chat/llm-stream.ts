function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function flattenContentParts(value: unknown): string {
  if (!Array.isArray(value)) return "";
  const chunks: string[] = [];

  for (const item of value) {
    if (typeof item === "string") {
      if (item) chunks.push(item);
      continue;
    }
    if (!item || typeof item !== "object") continue;

    const maybe = item as {
      text?: unknown;
      content?: unknown;
      value?: unknown;
    };
    const text =
      asText(maybe.text) || asText(maybe.content) || asText(maybe.value);
    if (text) chunks.push(text);
  }

  return chunks.join("");
}

export function extractProviderText(payload: any): string {
  const choice = payload?.choices?.[0];
  if (!choice) return "";

  const delta = choice.delta;
  const fromDeltaContent =
    asText(delta?.content) || flattenContentParts(delta?.content);
  if (fromDeltaContent) return fromDeltaContent;

  const fromDeltaText = asText(delta?.text);
  if (fromDeltaText) return fromDeltaText;

  const fromChoiceText = asText(choice.text);
  if (fromChoiceText) return fromChoiceText;

  const fromMessageContent =
    asText(choice?.message?.content) ||
    flattenContentParts(choice?.message?.content);
  if (fromMessageContent) return fromMessageContent;

  return "";
}
