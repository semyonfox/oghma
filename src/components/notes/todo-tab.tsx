"use client";

import AssignmentTracker from "@/components/assignments/assignment-tracker";

/**
 * Inspector-side task surface.
 *
 * The tracker is also used on the calendar page; this boundary owns the
 * sizing and overflow contract required by the notes inspector.
 */
export default function TodoTab() {
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <AssignmentTracker />
    </div>
  );
}
