import { formatDateKey, isoToDateKey } from "@/lib/notes/utils/calendar-date";

interface MonthCellAssignment {
  id: string;
  title: string;
  courseColor: string | null;
  status: string;
}

interface MonthCellTimeBlock {
  id: string;
  title: string | null;
  courseColor: string | null;
  completed: boolean;
}

export interface MonthCell {
  date: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  assignments: MonthCellAssignment[];
  timeBlocks: MonthCellTimeBlock[];
}

interface MonthViewAssignment {
  id: string;
  title: string;
  course_color: string | null;
  due_at: string | null;
  status: string;
}

interface MonthViewTimeBlock {
  id: string;
  title: string | null;
  starts_at: string;
  assignment_title?: string | null;
  course_color?: string | null;
  completed?: boolean;
}

export interface BuildMonthCellsInput {
  anchorDate: Date;
  assignments: readonly MonthViewAssignment[];
  timeBlocks: readonly MonthViewTimeBlock[];
  selectedDate: string | null;
  today: Date;
}

const MONTH_GRID_CELLS = 42;

// the grid is always six monday-first weeks, starting on or before the 1st
function monthGridStart(anchorDate: Date): Date {
  const firstOfMonth = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const mondayOffset = (firstOfMonth.getDay() + 6) % 7;
  return new Date(
    firstOfMonth.getFullYear(),
    firstOfMonth.getMonth(),
    1 - mondayOffset,
  );
}

export function getMonthGridRange(anchorDate: Date): {
  startDateKey: string;
  endDateKey: string;
} {
  const start = monthGridStart(anchorDate);
  const end = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() + MONTH_GRID_CELLS - 1,
  );
  return { startDateKey: formatDateKey(start), endDateKey: formatDateKey(end) };
}

function getMonthDays(anchorDate: Date, today: Date): MonthCell[] {
  const month = anchorDate.getMonth();
  const todayStr = formatDateKey(today);
  const start = monthGridStart(anchorDate);

  return Array.from({ length: MONTH_GRID_CELLS }, (_, index) => {
    const date = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + index,
    );
    const dateKey = formatDateKey(date);
    return {
      date: dateKey,
      isCurrentMonth: date.getMonth() === month,
      isToday: dateKey === todayStr,
      isSelected: false,
      assignments: [],
      timeBlocks: [],
    };
  });
}

export function buildMonthCells({
  anchorDate,
  assignments,
  timeBlocks,
  selectedDate,
  today,
}: BuildMonthCellsInput): MonthCell[] {
  const cells = getMonthDays(anchorDate, today);
  const cellsByDate = new Map(cells.map((cell) => [cell.date, cell]));

  for (const assignment of assignments) {
    if (!assignment.due_at) continue;
    const cell = cellsByDate.get(isoToDateKey(assignment.due_at));
    if (cell) {
      cell.assignments.push({
        id: assignment.id,
        title: assignment.title,
        courseColor: assignment.course_color,
        status: assignment.status,
      });
    }
  }

  for (const timeBlock of timeBlocks) {
    const cell = cellsByDate.get(isoToDateKey(timeBlock.starts_at));
    if (cell) {
      cell.timeBlocks.push({
        id: timeBlock.id,
        title: timeBlock.assignment_title || timeBlock.title,
        courseColor: timeBlock.course_color || null,
        completed: timeBlock.completed ?? false,
      });
    }
  }

  if (selectedDate) {
    const selectedCell = cellsByDate.get(selectedDate);
    if (selectedCell) selectedCell.isSelected = true;
  }

  return cells;
}
