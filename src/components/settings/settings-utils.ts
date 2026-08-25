export const inputClass =
  "block w-full rounded-radius-md bg-surface border border-border-subtle px-3 py-1.5 text-sm text-text placeholder:text-text-tertiary focus:ring-1 focus:ring-primary-500/50 focus:border-primary-500/50 focus:outline-none";

export function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

export const saveBtnClass =
  "rounded-radius-md bg-primary-600 px-3 py-2 text-sm font-semibold text-text-on-primary hover:bg-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:opacity-50 disabled:cursor-not-allowed";

/**
 * API error bodies are optional at the UI boundary. Keep malformed or empty
 * responses from replacing an actionable, translated fallback with a parse error.
 */
export async function readResponseError(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string" &&
      body.error
    ) {
      return body.error;
    }
  } catch {
    // A failed response is still valid even when a proxy strips its JSON body.
  }

  return fallback;
}
