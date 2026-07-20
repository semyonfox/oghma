export type Attribution = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
};

// Attribution is a fixed campaign taxonomy, not a free-form query-string store.
// Add a value here only when a campaign is intentionally deployed.
const ALLOWED_UTM_VALUES: Record<keyof Attribution, ReadonlySet<string>> = {
  source: new Set(["homepage", "ai_page", "blog", "pricing"]),
  medium: new Set(["hero_cta", "midpage_cta", "bottom_cta", "plan_cta", "article_cta", "cta"]),
  campaign: new Set([
    "free_canvas_import",
    "semester_pricing",
    "semester_beta",
    "annual_interest",
    "campus_pilot",
    "launch_beta",
  ]),
  content: new Set(),
  term: new Set(),
};

function allowedValue(key: keyof Attribution, value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return ALLOWED_UTM_VALUES[key].has(normalized) ? normalized : undefined;
}

/** Drops unknown query-derived values rather than retaining arbitrary campaign text. */
export function cleanAttribution(value: unknown): Attribution {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const output: Attribution = {};
  for (const key of Object.keys(ALLOWED_UTM_VALUES) as Array<keyof Attribution>) {
    const clean = allowedValue(key, input[key]);
    if (clean) output[key] = clean;
  }
  return output;
}
