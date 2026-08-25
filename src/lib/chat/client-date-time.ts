const CLIENT_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})(?:\[[A-Za-z0-9_./+-]+\])?$/;

export function normalizeClientDateTime(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 96) return undefined;
  return CLIENT_DATE_TIME_PATTERN.test(trimmed) ? trimmed : undefined;
}

/** Format the browser's local wall time with both its offset and IANA zone. */
export function formatClientDateTime(
  date = new Date(),
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const hours = String(Math.floor(Math.abs(offsetMinutes) / 60)).padStart(2, "0");
  const minutes = String(Math.abs(offsetMinutes) % 60).padStart(2, "0");
  const part = (value: number) => String(value).padStart(2, "0");

  return (
    `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}` +
    `T${part(date.getHours())}:${part(date.getMinutes())}:${part(date.getSeconds())}` +
    `${sign}${hours}:${minutes}[${timeZone}]`
  );
}
