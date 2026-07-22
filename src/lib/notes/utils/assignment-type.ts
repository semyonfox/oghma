export type AssignmentType = "quiz" | "assignment" | "manual" | "unknown";

const ASSIGNMENT_TYPES = new Set<string>([
  "quiz",
  "assignment",
  "manual",
  "unknown",
]);

export function normalizeAssignmentType(value: unknown): AssignmentType {
  return typeof value === "string" && ASSIGNMENT_TYPES.has(value)
    ? (value as AssignmentType)
    : "unknown";
}

export function getAssignmentTypeLabel(value: unknown): string {
  switch (normalizeAssignmentType(value)) {
    case "quiz":
      return "Quiz";
    case "assignment":
      return "Assignment";
    case "manual":
      return "Manual task";
    case "unknown":
      return "Task";
  }
}
