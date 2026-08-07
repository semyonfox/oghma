import { formatDateKey, isoToDateKey } from "@/lib/notes/utils/calendar-date";

export interface MonthCellAssignment {
  id: string;
  title: string;
  courseColor: string | null;
  status: string;
}

export interface MonthCellTimeBlock {
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

export interface MonthViewAssignment {
  id: string;
  title: string;
  course_color: string | null;
  due_at: string | null;
  status: string;
}

export interface MonthViewTimeBlock {
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

function getMonthDays(anchorDate: Date, today: Date): MonthCell[] {
  const year = anchorDate.getFullYear();
  const month = anchorDate.getMonth();
  const todayStr = formatDateKey(today);
  const firstDay = new Date(year, month, 1);
  // monday-based: 0=Mon, 6=Sun
  const startDow = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: MonthCell[] = [];

  const createCell = (date: Date, isCurrentMonth: boolean): MonthCell => {
    const dateKey = formatDateKey(date);
    return {
      date: dateKey,
      isCurrentMonth,
      isToday: dateKey === todayStr,
      isSelected: false,
      assignments: [],
      timeBlocks: [],
    };
  };

  for (let i = startDow - 1; i >= 0; i--) {
    cells.push(createCell(new Date(year, month, -i), false));
  }

  for (let i = 1; i <= daysInMonth; i++) {
    cells.push(createCell(new Date(year, month, i), true));
  }

  while (cells.length < 42) {
    cells.push(
      createCell(
        new Date(year, month + 1, cells.length - startDow - daysInMonth + 1),
        false,
      ),
    );
  }

  return cells;
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
