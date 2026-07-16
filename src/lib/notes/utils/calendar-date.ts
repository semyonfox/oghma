function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDateKey(
  dateKey: string,
): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const candidate = new Date(year, month - 1, day);
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

export function parseLocalDateKey(dateKey: string): Date | null {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return null;
  return new Date(parsed.year, parsed.month - 1, parsed.day);
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const date = parseLocalDateKey(dateKey);
  if (!date) return dateKey;
  date.setDate(date.getDate() + days);
  return formatDateKey(date);
}

export function addMonthsToDateKey(dateKey: string, months: number): string {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return dateKey;

  const target = new Date(parsed.year, parsed.month - 1 + months, 1);
  const lastDay = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0,
  ).getDate();
  target.setDate(Math.min(parsed.day, lastDay));
  return formatDateKey(target);
}

export function calendarDayDifference(
  value: Date | string,
  reference: Date = new Date(),
): number | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime()) || Number.isNaN(reference.getTime())) {
    return null;
  }

  const valueUtc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const referenceUtc = Date.UTC(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate(),
  );
  return Math.round((valueUtc - referenceUtc) / 86_400_000);
}

export function localDateKeyBoundaryToIso(
  dateKey: string,
  boundary: "start" | "end",
): string {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return dateKey;

  const { year, month, day } = parsed;
  const localDate =
    boundary === "start"
      ? new Date(year, month - 1, day, 0, 0, 0, 0)
      : new Date(year, month - 1, day, 23, 59, 59, 999);

  return localDate.toISOString();
}

export function localDateKeyRangeToIso(startDateKey: string, endDateKey: string) {
  return {
    start: localDateKeyBoundaryToIso(startDateKey, "start"),
    end: localDateKeyBoundaryToIso(endDateKey, "end"),
  };
}

export function isoToDateKey(value: string, timeZone?: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);

  if (!timeZone) {
    return formatDateKey(date);
  }

  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
  } catch {
    return formatDateKey(date);
  }

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return formatDateKey(date);
  }

  return `${year}-${month}-${day}`;
}

export function addMonthsClamped(dateValue: string, months: number): string {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;

  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);

  const daysInTargetMonth = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();

  date.setUTCDate(Math.min(originalDay, daysInTargetMonth));
  return date.toISOString();
}
