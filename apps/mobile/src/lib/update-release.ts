import { fetch } from "expo/fetch";
import { releaseSchema } from "./update-state";

export const downloadsUrl = "https://oghmanotes.ie/downloads";

export async function fetchRelease() {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 15_000);
  try {
    // Updates always come from production, independently of the account's API.
    const response = await fetch(
      `${downloadsUrl}/android-alpha.json?t=${Date.now()}`,
      {
        credentials: "omit",
        redirect: "error",
        signal: abort.signal,
        headers: { Accept: "application/json", "Cache-Control": "no-cache" },
      },
    );
    if (!response.ok) throw new Error("Update check failed.");
    return releaseSchema.parse(await response.json());
  } finally {
    clearTimeout(timer);
  }
}
