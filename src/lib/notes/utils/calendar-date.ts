function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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
