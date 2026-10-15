// stored objects are served from the app origin, so their Content-Type decides
// whether a browser runs them. Canvas and vault imports, legacy uploads and
// note-scoped fallbacks can hold anything, including HTML or SVG. Only types a
// route explicitly allows render inline, everything else downloads in a sandbox

// raster images only: SVG can carry script
export const INLINE_IMAGE_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
]);

export function storedObjectHeaders(
  contentType: string | undefined,
  inlineTypes: ReadonlySet<string>,
): Record<string, string> {
  const baseType = contentType?.split(";")[0]?.trim().toLowerCase();
  if (contentType && baseType && inlineTypes.has(baseType)) {
    return { "Content-Type": contentType, "X-Content-Type-Options": "nosniff" };
  }
  return {
    "Content-Type": "application/octet-stream",
    "Content-Disposition": "attachment",
    "Content-Security-Policy": "sandbox",
    "X-Content-Type-Options": "nosniff",
  };
}
