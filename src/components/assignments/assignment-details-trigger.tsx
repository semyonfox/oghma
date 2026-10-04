"use client";

import { useState, type ReactNode } from "react";
import type { Assignment } from "@/lib/notes/state/assignments.zustand";
import AssignmentDetails from "./assignment-details";

export default function AssignmentDetailsTrigger({
  assignment,
  className,
  children,
}: {
  assignment: Assignment;
  className?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={className}
        aria-haspopup="dialog"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        {children ?? assignment.title}
      </button>
      {open && <AssignmentDetails assignment={assignment} onClose={() => setOpen(false)} />}
    </>
  );
}
