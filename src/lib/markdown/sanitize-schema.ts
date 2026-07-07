import { defaultSchema } from "rehype-sanitize";

export const markdownSanitizeSchema = structuredClone(defaultSchema);
markdownSanitizeSchema.tagNames = [
  ...(markdownSanitizeSchema.tagNames ?? []),
  "mark",
  "details",
  "summary",
  "kbd",
  "sup",
  "sub",
];
markdownSanitizeSchema.attributes = {
  ...(markdownSanitizeSchema.attributes ?? {}),
  code: [
    ...(markdownSanitizeSchema.attributes?.code ?? []),
    ["className", /^language-[a-z0-9_-]+$/i],
    ["className", "math-inline", "math-display"],
    "dataCodeMeta",
  ],
  details: ["open"],
};
