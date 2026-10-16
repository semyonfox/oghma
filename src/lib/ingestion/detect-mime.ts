interface Signature {
  readonly types: readonly string[];
  readonly matches: (bytes: Uint8Array) => boolean;
}

function startsWith(bytes: Uint8Array, prefix: readonly number[], offset = 0): boolean {
  return prefix.every((byte, index) => bytes[offset + index] === byte);
}

function ascii(text: string): number[] {
  return [...text].map((char) => char.charCodeAt(0));
}

// bytes 4-7 of an ISO base media file; the box size before it varies per encoder
const FTYP = ascii("ftyp");
// HEIC, AVIF, QuickTime and M4A share the container; only accept MP4 and AVIF brands
const MP4_BRANDS = new Set([
  "isom", "iso2", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "dash", "M4V ", "mmp4", "MSNV",
]);

const AVIF_BRANDS = new Set(["avif", "avis"]);

function ftypBrand(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes.subarray(8, 12));
}

const SIGNATURES: readonly Signature[] = [
  { types: ["application/pdf"], matches: (b) => startsWith(b, ascii("%PDF")) },
  { types: ["image/png"], matches: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47]) },
  { types: ["image/jpeg"], matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  { types: ["image/gif"], matches: (b) => startsWith(b, ascii("GIF8")) },
  {
    types: ["image/webp"],
    matches: (b) => startsWith(b, ascii("RIFF")) && startsWith(b, ascii("WEBP"), 8),
  },
  {
    types: ["audio/wav"],
    matches: (b) => startsWith(b, ascii("RIFF")) && startsWith(b, ascii("WAVE"), 8),
  },
  {
    // OOXML is a ZIP container, so the declared type picks the format
    types: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
    matches: (b) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]),
  },
  { types: ["application/msword"], matches: (b) => startsWith(b, [0xd0, 0xcf, 0x11, 0xe0]) },
  {
    types: ["audio/mpeg"],
    // ID3 tag, or an MPEG layer III frame sync (MPEG-1, 2 and 2.5)
    matches: (b) =>
      startsWith(b, ascii("ID3")) ||
      (b[0] === 0xff && [0xfb, 0xfa, 0xf3, 0xf2, 0xe3, 0xe2].includes(b[1] ?? -1)),
  },
  {
    types: ["video/mp4"],
    matches: (b) => startsWith(b, FTYP, 4) && MP4_BRANDS.has(ftypBrand(b)),
  },
  {
    types: ["image/avif"],
    matches: (b) => startsWith(b, FTYP, 4) && AVIF_BRANDS.has(ftypBrand(b)),
  },
];

const TEXT_EXTENSIONS: Readonly<Record<string, string>> = {
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
};

// text has no signature; a NUL byte in the first few KB means binary content
// wearing a text extension (UTF-16 files are rejected too, which extraction
// could not decode anyway)
function looksLikeText(bytes: Uint8Array): boolean {
  return !bytes.subarray(0, 8192).includes(0);
}

/**
 * Resolve the MIME type to store for uploaded bytes. Binary formats must match
 * a known signature; text is accepted from a declared `text/*` type or a text
 * file extension. Returns null when the bytes contradict the declared type or
 * nothing can be identified.
 */
export function detectMimeType(
  input: ArrayBuffer | Uint8Array,
  declaredMimeType: string,
  fileName = "",
): string | null {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const rawDeclared = declaredMimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  const declared = rawDeclared === "application/octet-stream" ? "" : rawDeclared;
  const signature = SIGNATURES.find((candidate) => candidate.matches(bytes));

  if (declared.startsWith("text/")) {
    return !signature && looksLikeText(bytes) ? declared : null;
  }
  if (declared) return signature?.types.includes(declared) ? declared : null;
  if (signature) {
    // ambiguous containers still need a declared type to pick the format
    return signature.types.length === 1 ? signature.types[0] : null;
  }

  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  const textType = fileName.includes(".") ? TEXT_EXTENSIONS[extension] : undefined;
  return textType && looksLikeText(bytes) ? textType : null;
}
