"use client";

import { useState } from "react";
import type { Assignment } from "@/lib/notes/state/assignments";
import useI18n from "@/lib/notes/hooks/use-i18n";
import AssignmentDetailsTrigger from "./assignment-details-trigger";

// callers pass assignments already narrowed to the selected courses
export default function RecentGraded({ assignments }: { assignments: Assignment[] }) {
  const { t } = useI18n();
  const [cutoff] = useState(() => Date.now() - 60 * 86400000);
  const recent = assignments
    .filter(a => a.graded_at && Date.parse(a.graded_at) >= cutoff)
    .sort((a, b) => Date.parse(b.graded_at!) - Date.parse(a.graded_at!))
    .slice(0, 4);
  if (!recent.length) return null;

  return (
    <section aria-label={t("Recently graded")} className="mx-3 mb-4 rounded-radius-md border border-border-subtle bg-surface p-3">
      <h3 className="mb-2 text-sm font-medium text-text">{t("Recently graded")}</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {recent.map(assignment => (
          <AssignmentDetailsTrigger key={assignment.id} assignment={assignment}
            className="min-h-11 rounded-radius-md bg-subtle p-3 text-start hover:bg-subtle/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <span className="block truncate text-xs text-text-tertiary">{assignment.course_name}</span>
            <span className="block truncate text-sm font-medium text-text">{assignment.title}</span>
            <span className="mt-1 block text-sm tabular-nums text-text-secondary">
              {assignment.score != null
                ? `${assignment.score}${assignment.points_possible != null ? ` / ${assignment.points_possible}` : ""}`
                : assignment.grade ?? t("Graded")}
            </span>
            <span className="block text-xs text-text-tertiary">{t("Graded")} · {new Date(assignment.graded_at!).toLocaleDateString()}</span>
            <span className="mt-2 block line-clamp-2 break-words text-xs text-text-secondary">
              {assignment.feedback?.comments[0]?.comment.replace(/\s+/g, " ").slice(0, 160) || t("No written feedback")}
            </span>
          </AssignmentDetailsTrigger>
        ))}
      </div>
    </section>
  );
}
