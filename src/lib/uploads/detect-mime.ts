const MAGIC_MIME_TYPES: Array<[string, readonly string[]]> = [
  ["25504446", ["application/pdf"]],
  ["89504e47", ["image/png"]],
  ["ffd8ff", ["image/jpeg"]],
  ["47494638", ["image/gif"]],
  ["52494646", ["image/webp", "audio/wav"]],
  [
    "504b0304",
    [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
  ],
  ["d0cf11e0", ["application/msword"]],
  ["494433", ["audio/mpeg"]],
  ["fff1", ["audio/mpeg"]],
  ["fffb", ["audio/mpeg"]],
  ["00000020", ["video/mp4"]],
  ["0000001c", ["video/mp4"]],
];

export function detectMimeType(
  buffer: ArrayBuffer,
  declaredMimeType: string,
): string | null {
  const rawDeclared = declaredMimeType.trim().toLowerCase();
  const declared =
    rawDeclared === "application/octet-stream" ? "" : rawDeclared;
  if (declared.startsWith("text/")) return declared;

  const header = Buffer.from(buffer).subarray(0, 12).toString("hex");
  const match = MAGIC_MIME_TYPES.find(([magic]) => header.startsWith(magic));
  if (!match) return null;

  const possibleTypes = match[1];
  if (declared) return possibleTypes.includes(declared) ? declared : null;

  // Ambiguous signatures (for example ZIP-based Office files) still require a
  // declared type. Unambiguous signatures safely classify unnamed files.
  return possibleTypes.length === 1 ? possibleTypes[0] : null;
}
