"use client";

import {
  ClipboardDocumentListIcon,
  DocumentTextIcon,
  PencilSquareIcon,
  QuestionMarkCircleIcon,
} from "@heroicons/react/24/outline";
import {
  getAssignmentTypeLabel,
  normalizeAssignmentType,
  type AssignmentType,
} from "@/lib/notes/utils/assignment-type";

interface AssignmentTypeIconProps {
  type: AssignmentType | null | undefined;
  className?: string;
  label?: string;
}

export default function AssignmentTypeIcon({
  type,
  className = "h-3.5 w-3.5",
  label,
}: AssignmentTypeIconProps) {
  const normalized = normalizeAssignmentType(type);
  const accessibleLabel = label ?? getAssignmentTypeLabel(normalized);
  const iconClassName = `${className} shrink-0`;

  const icon = (() => {
    switch (normalized) {
      case "quiz":
        return <QuestionMarkCircleIcon className={iconClassName} aria-hidden="true" />;
      case "assignment":
        return <DocumentTextIcon className={iconClassName} aria-hidden="true" />;
      case "manual":
        return <PencilSquareIcon className={iconClassName} aria-hidden="true" />;
      case "unknown":
        return <ClipboardDocumentListIcon className={iconClassName} aria-hidden="true" />;
    }
  })();

  return (
    <span
      role="img"
      aria-label={accessibleLabel}
      title={accessibleLabel}
      className="inline-flex shrink-0 items-center justify-center text-text-tertiary"
    >
      {icon}
    </span>
  );
}
