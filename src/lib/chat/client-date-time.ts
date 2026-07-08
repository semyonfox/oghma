const CLIENT_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})(?:\[[A-Za-z0-9_./+-]+\])?$/;

export function normalizeClientDateTime(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 96) return undefined;
  return CLIENT_DATE_TIME_PATTERN.test(trimmed) ? trimmed : undefined;
}
