import { calendarDayDifference } from "@/lib/notes/utils/calendar-date";

export type AssignmentStatus = "upcoming" | "in_progress" | "done" | "late";

interface AssignmentStatusInput {
  status: AssignmentStatus;
  due_at: string | null;
}

export function getEffectiveAssignmentStatus(
  assignment: AssignmentStatusInput,
  now: Date = new Date(),
): AssignmentStatus {
  if (assignment.status === "done") return "done";
  if (!assignment.due_at) {
    return assignment.status === "late" ? "upcoming" : assignment.status;
  }

  const due = new Date(assignment.due_at);
  if (Number.isNaN(due.getTime())) return assignment.status;
  if (due.getTime() < now.getTime()) return "late";
  return assignment.status === "late" ? "upcoming" : assignment.status;
}

export function getAssignmentDueDayDifference(
  dueAt: string | null,
  now: Date = new Date(),
): number | null {
  if (!dueAt) return null;
  return calendarDayDifference(dueAt, now);
}
