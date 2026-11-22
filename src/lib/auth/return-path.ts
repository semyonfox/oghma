const FALLBACK = "/notes";
const BASE = "https://return-path.invalid";

export function authReturnPath(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return FALLBACK;
  }
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 32 || (code >= 127 && code <= 159)) return FALLBACK;
  }

  const url = new URL(value, BASE);
  const { pathname, search, hash } = url;
  if (
    url.origin !== BASE ||
    pathname.startsWith("//") ||
    /^\/(login|register)\/?$/i.test(pathname)
  ) {
    return FALLBACK;
  }
  return pathname + search + hash;
}
