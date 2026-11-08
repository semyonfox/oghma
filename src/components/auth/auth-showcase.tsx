"use client";

import {
  AcademicCapIcon,
  ArrowPathIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";
import useI18n from "@/lib/notes/hooks/use-i18n";

// the right-hand panel on desktop sign-in and sign-up, from the Atlas mockups
export default function AuthShowcase() {
  const { t } = useI18n();
  const features = [
    { icon: DocumentTextIcon, title: t("Answers with citations"), body: t("Ask your notes and PDFs. Every claim links to the page it came from.") },
    { icon: AcademicCapIcon, title: t("Spaced-repetition quizzes"), body: t("Questions generated from your notes, scheduled with FSRS.") },
    { icon: ArrowPathIcon, title: t("Canvas sync"), body: t("Modules, lecture files and deadlines come in automatically.") },
  ];

  return (
    <aside className="hidden min-h-dvh flex-1 items-center border-l border-border bg-sidebar px-16 lg:flex">
      <div className="flex w-full max-w-[576px] flex-col gap-6">
        <p className="font-serif text-[44px] font-bold leading-[1.1] tracking-tight text-text">
          {t("Your lectures,")}
          <br />
          <em className="font-normal">{t("answering back.")}</em>
        </p>

        <figure className="rounded-radius-xl border border-border bg-surface p-6" aria-label={t("Example")}>
          <figcaption className="text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary">
            {t("Example")}
          </figcaption>
          <p className="ml-auto mt-4 w-fit rounded-[14px] rounded-br-[4px] bg-text px-3.5 py-2 text-sm text-background">
            {t("What does BCNF add over 3NF?")}
          </p>
          <p className="mt-5 font-serif text-lg text-text">
            {t("Every determinant must be a candidate key.")}
            <sup className="ml-1 rounded bg-accent-soft px-1 font-sans text-[10px] font-semibold text-accent-soft-text">1</sup>
          </p>
          <div className="mt-3 flex items-center gap-3 rounded-radius-md border border-border px-3 py-2 text-sm text-text">
            <span className="font-mono text-xs font-semibold text-accent">1</span>
            <span className="flex-1">Lecture 8.pdf</span>
            <span className="text-xs text-text-tertiary">p. 3</span>
          </div>
        </figure>

        <ul className="flex flex-col gap-4">
          {features.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-radius-md border border-border bg-surface text-accent">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="flex flex-col">
                <span className="text-[15px] font-semibold text-text">{title}</span>
                <span className="text-sm text-text-secondary">{body}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
