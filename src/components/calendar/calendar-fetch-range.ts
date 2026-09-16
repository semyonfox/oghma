import { addDaysToDateKey, formatDateKey } from "@/lib/notes/utils/calendar-date";

export function getCalendarFetchRange(currentDate: string, view: "month" | "week") {
  const anchor = new Date(currentDate);
  let startDateKey: string;
  let endDateKey: string;

  if (view === "month") {
    startDateKey = formatDateKey(
      new Date(anchor.getFullYear(), anchor.getMonth(), -6),
    );
    endDateKey = formatDateKey(
      new Date(anchor.getFullYear(), anchor.getMonth() + 1, 7),
    );
  } else {
    const monday = new Date(anchor);
    monday.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));
    startDateKey = formatDateKey(monday);
    endDateKey = addDaysToDateKey(startDateKey, 6);
  }

  return { startDateKey, endDateKey };
}
