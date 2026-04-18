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
    ["className", /^language-[a-z0-9_-]+$/i, "hljs"],
  ],
  span: [
    ...(markdownSanitizeSchema.attributes?.span ?? []),
    ["className", /^hljs(?:-[a-z0-9_]+)?$/i],
  ],
  details: ["open"],
};
