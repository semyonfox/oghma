"use client";

import { useState, type DragEvent } from "react";
import { toast } from "sonner";
import useAssignmentStore from "@/lib/notes/state/assignments";
import useCalendarStore from "@/lib/notes/state/calendar";
import useI18n from "@/lib/notes/hooks/use-i18n";

export const ASSIGNMENT_DRAG_TYPE = "application/x-oghma-assignment";

export default function useAssignmentDrop() {
  const { t } = useI18n();
  const { assignments } = useAssignmentStore();
  const { createTimeBlock, timeBlocks } = useCalendarStore();
  const [dropDate, setDropDate] = useState<string | null>(null);

  const dragOver = (event: DragEvent<HTMLElement>, date: string) => {
    if (!event.dataTransfer.types.includes(ASSIGNMENT_DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDropDate(date);
  };

  const dragLeave = (event: DragEvent<HTMLElement>) => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    setDropDate(null);
  };

  const drop = async (event: DragEvent<HTMLElement>, start: Date) => {
    setDropDate(null);
    const id = event.dataTransfer.getData(ASSIGNMENT_DRAG_TYPE);
    const assignment = assignments.find((item) => item.id === id);
    if (!assignment) return;
    event.preventDefault();
    const end = new Date(start.getTime() + 60 * 60_000);
    const overlaps = timeBlocks.some((block) =>
      new Date(block.starts_at) < end && new Date(block.ends_at) > start,
    );
    const created = await createTimeBlock({
      assignment_id: assignment.id,
      title: assignment.title,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
    });
    if (!created) toast.error(t("Something went wrong"));
    else if (overlaps) toast.warning(t("This time overlaps another study block"));
    else toast.success(t("Study block created"));
  };

  return { dropDate, dragOver, dragLeave, drop };
}
