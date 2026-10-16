import { addDaysToDateKey, formatDateKey } from "@/lib/notes/utils/calendar-date";
import { getMonthGridRange } from "@/components/calendar/month-view-utils";

// requests exactly the days the active view renders, so no cell is left empty
export function getCalendarFetchRange(currentDate: string, view: "month" | "week") {
  const anchor = new Date(currentDate);
  if (view === "month") return getMonthGridRange(anchor);

  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));
  const startDateKey = formatDateKey(monday);
  return { startDateKey, endDateKey: addDaysToDateKey(startDateKey, 6) };
}
