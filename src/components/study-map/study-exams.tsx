"use client";

import { useId, useMemo, useState } from "react";
import type { z } from "zod";
import {
  analyseExamStructure,
  summariseExamCorpus,
} from "@/lib/study-map/exam-stats";
import {
  paperUpdateSchema,
  type ExamQuestion,
  type ExamStructure,
  type SourceAnchor,
  type StudyMapSnapshot,
  type StudyPaper,
  type StudyTopic,
} from "@/lib/study-map/types";

interface StudyExamsProps {
  snapshot: StudyMapSnapshot;
  onAnalyse: (noteId: string) => Promise<void>;
  onSavePaper: (input: z.infer<typeof paperUpdateSchema>) => Promise<void>;
}

const inputClass =
  "min-h-11 w-full rounded-radius-md border border-border-subtle bg-surface px-3 py-2 text-base text-text placeholder:text-text-tertiary focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30 disabled:opacity-50 sm:text-sm";
const buttonClass =
  "inline-flex min-h-11 items-center justify-center rounded-radius-md border border-border-subtle px-3 py-2 text-sm font-medium text-text hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50";
const primaryClass =
  "inline-flex min-h-11 items-center justify-center rounded-radius-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

function numberOrUnknown(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

function marks(value: number | null): string {
  return value === null
    ? "Unknown"
    : value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function sourceLocation(source: SourceAnchor): string {
  return source.page === null
    ? `Line ${source.line}`
    : `Page ${source.page}, line ${source.line}`;
}

function SourceQuote({ source }: { source: SourceAnchor }) {
  return (
    <div className="rounded-radius-md border-l-2 border-primary-500/40 bg-surface p-3">
      <blockquote className="whitespace-pre-wrap break-words text-sm leading-relaxed text-text-secondary">
        {source.quote}
      </blockquote>
      <a
        href={`/notes/${source.noteId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-flex min-h-11 items-center text-xs text-primary-500 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      >
        {sourceLocation(source)} · Open source note
      </a>
    </div>
  );
}

function questionPath(
  question: ExamQuestion,
  questions: ExamQuestion[],
): string {
  const labels = [question.label];
  const seen = new Set([question.id]);
  let parentId = question.parentId;
  while (parentId !== null && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = questions.find((item) => item.id === parentId);
    if (!parent) break;
    labels.unshift(parent.label);
    parentId = parent.parentId;
  }
  return labels.join(" / ");
}

function topicPath(topic: StudyTopic, topics: StudyTopic[]): string {
  const names = [topic.name];
  const seen = new Set([topic.id]);
  let parentId = topic.parentId;
  while (parentId !== null && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = topics.find((item) => item.id === parentId);
    if (!parent) break;
    names.unshift(parent.name);
    parentId = parent.parentId;
  }
  return names.join(" / ");
}

function PaperEditor({
  paper,
  snapshot,
  onSavePaper,
  busy,
}: {
  paper: StudyPaper;
  snapshot: StudyMapSnapshot;
  onSavePaper: StudyExamsProps["onSavePaper"];
  busy: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState<ExamStructure>(paper.structure);
  const [year, setYear] = useState(String(paper.structure.year));
  const [totalMarks, setTotalMarks] = useState(
    paper.structure.statedTotalMarks?.toString() ?? "",
  );
  const [questionMarks, setQuestionMarks] = useState(
    paper.structure.questions.map(
      (question) => question.marks?.toString() ?? "",
    ),
  );
  const [answerCounts, setAnswerCounts] = useState(
    paper.structure.sections.map(
      (section) => section.answerCount?.toString() ?? "",
    ),
  );
  const [saving, setSaving] = useState<"draft" | "approve" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const structure = useMemo<ExamStructure>(
    () => ({
      ...draft,
      year: Number(year),
      statedTotalMarks: numberOrUnknown(totalMarks),
      questions: draft.questions.map((question, index) => ({
        ...question,
        marks: numberOrUnknown(questionMarks[index] ?? ""),
      })),
      sections: draft.sections.map((section, index) => ({
        ...section,
        answerCount: numberOrUnknown(answerCounts[index] ?? ""),
      })),
    }),
    [draft, year, totalMarks, questionMarks, answerCounts],
  );
  const analysis = useMemo(() => analyseExamStructure(structure), [structure]);
  const payload = {
    noteId: paper.noteId,
    sourceHash: paper.currentHash,
    taxonomyVersion: snapshot.map.taxonomyVersion,
    reviewed: false,
    structure,
  };
  const parsed = paperUpdateSchema.safeParse(payload);
  const knownTopics = new Set(snapshot.map.topics.map((topic) => topic.id));
  const stale =
    paper.sourceHash !== paper.currentHash ||
    structure.questions.some(
      (question) => question.source.hash !== paper.currentHash,
    ) ||
    structure.sections.some(
      (section) =>
        section.source !== null && section.source.hash !== paper.currentHash,
    );
  const evidenceIssues = structure.sections.flatMap((section) =>
    section.source === null || !section.source.quote.trim()
      ? [
          `Section "${section.name}" needs a source passage for its answer rule. Reanalyse the paper to extract it.`,
        ]
      : [],
  );
  const missingTopicIssues = structure.questions
    .filter((question) =>
      question.topicIds.some((topicId) => !knownTopics.has(topicId)),
    )
    .map(
      (question) =>
        `Question "${question.label}" refers to a removed topic. Clear it or choose a current topic.`,
    );
  const issues = [
    ...new Set([
      ...analysis.issues,
      ...evidenceIssues,
      ...missingTopicIssues,
      ...(parsed.success
        ? []
        : parsed.error.issues.map(
            (issue) => `${issue.path.join(".")}: ${issue.message}`,
          )),
      ...(stale
        ? [
            "This source changed after extraction. Reanalyse before saving or approving; source passages cannot be refreshed by editing marks.",
          ]
        : []),
    ]),
  ];
  const disabled = busy || saving !== null;
  const canApprove =
    parsed.success &&
    issues.length === 0 &&
    analysis.printedMarks !== null &&
    analysis.answerableMarks !== null &&
    confirmed;

  function changed() {
    setConfirmed(false);
    setStatus(null);
    setError(null);
  }

  function updateQuestion(index: number, patch: Partial<ExamQuestion>) {
    changed();
    setDraft((current) => ({
      ...current,
      questions: current.questions.map((question, position) =>
        position === index ? { ...question, ...patch } : question,
      ),
    }));
  }

  async function save(reviewed: boolean) {
    setError(null);
    setStatus(null);
    if (stale || (reviewed && !canApprove)) return;
    const result = paperUpdateSchema.safeParse({ ...payload, reviewed });
    if (!result.success) {
      setError("Check the highlighted validation issues before saving.");
      return;
    }
    setSaving(reviewed ? "approve" : "draft");
    try {
      await onSavePaper(result.data);
      setStatus(
        reviewed
          ? "Paper approved. Its current review can be included in historical coverage."
          : "Draft saved. This paper is excluded from coverage until approved.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The paper could not be saved. Try again.",
      );
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-6 border-t border-border-subtle p-4 sm:p-5">
      <p className="max-w-2xl text-sm leading-relaxed text-text-secondary">
        Check every value against the original paper. A blank mark or answer
        count means unknown. Choosing all questions must be explicit and
        supported by the printed instructions.
      </p>
      {paper.taxonomyVersion !== snapshot.map.taxonomyVersion && (
        <p className="rounded-radius-md bg-surface p-3 text-sm text-text-secondary">
          The topic list has changed. Check the question assignments against the
          current topics before approving.
        </p>
      )}
      <fieldset
        disabled={disabled}
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <legend className="sr-only">Paper details</legend>
        <label className="space-y-1 text-sm text-text-secondary">
          Year
          <input
            className={inputClass}
            type="number"
            min={1900}
            max={2200}
            value={year}
            onChange={(event) => {
              changed();
              setYear(event.target.value);
            }}
          />
        </label>
        <label className="space-y-1 text-sm text-text-secondary">
          Sitting
          <input
            className={inputClass}
            maxLength={100}
            value={draft.sitting}
            onChange={(event) => {
              changed();
              setDraft({ ...draft, sitting: event.target.value });
            }}
            placeholder="Semester 1, repeat…"
          />
        </label>
        <label className="space-y-1 text-sm text-text-secondary">
          Syllabus version
          <input
            className={inputClass}
            maxLength={100}
            value={draft.syllabusVersion}
            onChange={(event) => {
              changed();
              setDraft({ ...draft, syllabusVersion: event.target.value });
            }}
            placeholder="Use the version on the paper"
          />
        </label>
        <label className="space-y-1 text-sm text-text-secondary">
          Stated total marks
          <input
            className={inputClass}
            type="number"
            min={0}
            max={10000}
            step="any"
            value={totalMarks}
            placeholder="Unknown"
            onChange={(event) => {
              changed();
              setTotalMarks(event.target.value);
            }}
          />
        </label>
      </fieldset>

      <section aria-labelledby={`${id}-sections`} className="space-y-3">
        <h4 id={`${id}-sections`} className="text-base font-semibold text-text">
          Sections and choice rules
        </h4>
        {draft.sections.map((section, index) => (
          <fieldset
            key={index}
            disabled={disabled}
            className="space-y-3 rounded-radius-lg border border-border-subtle p-4"
          >
            <legend className="px-1 text-sm font-semibold text-text">
              {section.name}
            </legend>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <label className="space-y-1 text-sm text-text-secondary">
                Section name
                <input
                  className={inputClass}
                  value={section.name}
                  maxLength={160}
                  onChange={(event) => {
                    changed();
                    setDraft({
                      ...draft,
                      sections: draft.sections.map((item, position) =>
                        position === index
                          ? { ...item, name: event.target.value }
                          : item,
                      ),
                    });
                  }}
                />
              </label>
              <label className="space-y-1 text-sm text-text-secondary">
                Section ID
                <input
                  className={inputClass}
                  value={section.id}
                  maxLength={80}
                  onChange={(event) => {
                    changed();
                    setDraft({
                      ...draft,
                      sections: draft.sections.map((item, position) =>
                        position === index
                          ? { ...item, id: event.target.value }
                          : item,
                      ),
                    });
                  }}
                />
              </label>
              <label className="space-y-1 text-sm text-text-secondary">
                Questions to answer
                <input
                  className={inputClass}
                  type="number"
                  min={1}
                  max={200}
                  value={answerCounts[index] ?? ""}
                  placeholder="Unknown"
                  aria-describedby={`${id}-answer-help-${index}`}
                  onChange={(event) => {
                    changed();
                    setAnswerCounts(
                      answerCounts.map((value, position) =>
                        position === index ? event.target.value : value,
                      ),
                    );
                  }}
                />
              </label>
            </div>
            <p
              id={`${id}-answer-help-${index}`}
              className="text-xs text-text-tertiary"
            >
              {section.questionIds.length} question references in this section.
              To answer all, enter that count after checking the source.
            </p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">
              {section.instructions || "No instructions extracted."}
            </p>
            {section.source ? (
              <SourceQuote source={section.source} />
            ) : (
              <p className="text-sm text-text-secondary">
                Choice-rule source passage missing. Reanalyse to recover the
                printed instruction before approval.
              </p>
            )}
            <div>
              <p className="mb-1 text-sm font-medium text-text">
                Whole questions in this section
              </p>
              <div className="flex flex-wrap gap-x-4">
                {draft.questions
                  .filter((question) => question.parentId === null)
                  .map((question, position) => (
                    <label
                      key={`${question.id}-${position}`}
                      className="flex min-h-11 items-center gap-2 text-sm text-text-secondary"
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-primary-600"
                        checked={section.questionIds.includes(question.id)}
                        onChange={(event) => {
                          changed();
                          setDraft({
                            ...draft,
                            sections: draft.sections.map(
                              (item, sectionIndex) =>
                                sectionIndex === index
                                  ? {
                                      ...item,
                                      questionIds: event.target.checked
                                        ? [
                                            ...new Set([
                                              ...item.questionIds,
                                              question.id,
                                            ]),
                                          ]
                                        : item.questionIds.filter(
                                            (questionId) =>
                                              questionId !== question.id,
                                          ),
                                    }
                                  : item,
                            ),
                          });
                        }}
                      />
                      {question.label}
                    </label>
                  ))}
              </div>
              {section.questionIds
                .filter(
                  (questionId) =>
                    !draft.questions.some(
                      (question) =>
                        question.id === questionId &&
                        question.parentId === null,
                    ),
                )
                .map((questionId, position) => (
                  <button
                    type="button"
                    key={`${questionId}-${position}`}
                    className={`${buttonClass} mt-1 mr-2`}
                    onClick={() => {
                      changed();
                      setDraft({
                        ...draft,
                        sections: draft.sections.map((item, sectionIndex) =>
                          sectionIndex === index
                            ? {
                                ...item,
                                questionIds: item.questionIds.filter(
                                  (value) => value !== questionId,
                                ),
                              }
                            : item,
                        ),
                      });
                    }}
                  >
                    Remove invalid reference {questionId}
                  </button>
                ))}
            </div>
          </fieldset>
        ))}
      </section>

      <section aria-labelledby={`${id}-questions`} className="space-y-3">
        <h4
          id={`${id}-questions`}
          className="text-base font-semibold text-text"
        >
          Questions and topic assignments
        </h4>
        <p className="max-w-2xl text-sm text-text-secondary">
          Assign each topic independently. Multiple topics share the question's
          full marks. An unassigned subquestion inherits its nearest assigned
          parent's topics.
        </p>
        {draft.questions.map((question, index) => (
          <fieldset
            key={index}
            disabled={disabled}
            className="space-y-3 rounded-radius-lg border border-border-subtle p-4"
          >
            <legend className="px-1 text-sm font-semibold text-text">
              {questionPath(question, draft.questions)}
            </legend>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-text">
              {question.text}
            </p>
            <SourceQuote source={question.source} />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <label className="space-y-1 text-sm text-text-secondary">
                Question label
                <input
                  className={inputClass}
                  value={question.label}
                  maxLength={100}
                  onChange={(event) =>
                    updateQuestion(index, { label: event.target.value })
                  }
                />
              </label>
              <label className="space-y-1 text-sm text-text-secondary">
                Question ID
                <input
                  className={inputClass}
                  value={question.id}
                  maxLength={80}
                  onChange={(event) =>
                    updateQuestion(index, { id: event.target.value })
                  }
                />
              </label>
              <label className="space-y-1 text-sm text-text-secondary">
                Parent question
                <select
                  className={inputClass}
                  value={question.parentId ?? ""}
                  onChange={(event) =>
                    updateQuestion(index, {
                      parentId: event.target.value || null,
                    })
                  }
                >
                  <option value="">Whole question</option>
                  {question.parentId !== null &&
                    !draft.questions.some(
                      (item) => item.id === question.parentId,
                    ) && (
                      <option value={question.parentId}>
                        Missing parent {question.parentId}
                      </option>
                    )}
                  {draft.questions
                    .filter((item, position) => position !== index)
                    .map((item, position) => (
                      <option key={`${item.id}-${position}`} value={item.id}>
                        {item.label} · {item.id}
                      </option>
                    ))}
                </select>
              </label>
              <label className="space-y-1 text-sm text-text-secondary">
                Printed marks
                <input
                  className={inputClass}
                  type="number"
                  min={0}
                  max={10000}
                  step="any"
                  placeholder="Unknown"
                  value={questionMarks[index] ?? ""}
                  onChange={(event) => {
                    changed();
                    setQuestionMarks(
                      questionMarks.map((value, position) =>
                        position === index ? event.target.value : value,
                      ),
                    );
                  }}
                />
              </label>
              <label className="space-y-1 text-sm text-text-secondary">
                Question style
                <input
                  className={inputClass}
                  maxLength={100}
                  value={question.style}
                  placeholder="Calculation, essay, proof…"
                  onChange={(event) =>
                    updateQuestion(index, { style: event.target.value })
                  }
                />
              </label>
            </div>
            <div className="grid gap-x-4 sm:grid-cols-2 xl:grid-cols-3">
              {snapshot.map.topics.map((topic) => (
                <label
                  key={topic.id}
                  className="flex min-h-11 items-center gap-2 py-2 text-sm text-text-secondary"
                >
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 accent-primary-600"
                    checked={question.topicIds.includes(topic.id)}
                    onChange={(event) =>
                      updateQuestion(index, {
                        topicIds: event.target.checked
                          ? [...new Set([...question.topicIds, topic.id])]
                          : question.topicIds.filter(
                              (topicId) => topicId !== topic.id,
                            ),
                      })
                    }
                  />
                  {topicPath(topic, snapshot.map.topics)}
                </label>
              ))}
            </div>
            {question.topicIds
              .filter((topicId) => !knownTopics.has(topicId))
              .map((topicId, position) => (
                <button
                  type="button"
                  key={`${topicId}-${position}`}
                  className={buttonClass}
                  onClick={() =>
                    updateQuestion(index, {
                      topicIds: question.topicIds.filter(
                        (value) => value !== topicId,
                      ),
                    })
                  }
                >
                  Remove missing topic {topicId}
                </button>
              ))}
          </fieldset>
        ))}
      </section>

      {draft.warnings.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-base font-semibold text-text">
            Extraction warnings
          </h4>
          <p className="text-sm text-text-secondary">
            Resolve these against the source before clearing them.
          </p>
          {draft.warnings.map((warning, index) => (
            <div
              key={`${warning}-${index}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-radius-md bg-surface p-3"
            >
              <p className="text-sm text-text-secondary">{warning}</p>
              <button
                type="button"
                disabled={disabled}
                className={buttonClass}
                onClick={() => {
                  changed();
                  setDraft({
                    ...draft,
                    warnings: draft.warnings.filter(
                      (_item, position) => position !== index,
                    ),
                  });
                }}
              >
                Verified and resolved
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3 rounded-radius-lg bg-surface p-4">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-text-secondary">
          <p>
            Printed marks{" "}
            <span className="font-semibold tabular-nums text-text">
              {marks(analysis.printedMarks)}
            </span>
          </p>
          <p>
            Answerable marks{" "}
            <span className="font-semibold tabular-nums text-text">
              {analysis.answerableMarks
                ? `${marks(analysis.answerableMarks.min)} to ${marks(analysis.answerableMarks.max)}`
                : "Unknown"}
            </span>
          </p>
        </div>
        {issues.length > 0 ? (
          <div aria-live="polite">
            <p className="mb-2 text-sm font-semibold text-text">
              Resolve {issues.length} {issues.length === 1 ? "issue" : "issues"}{" "}
              before approval
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-text-secondary">
              {issues.map((issue) => (
                <li key={issue} className="break-words">
                  {issue}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-text-secondary" role="status">
            The structure is consistent. Confirm it matches the source before
            approving.
          </p>
        )}
      </div>
      <label className="flex min-h-11 items-start gap-3 py-2 text-sm leading-relaxed text-text-secondary">
        <input
          type="checkbox"
          className="mt-1 size-4 shrink-0 accent-primary-600"
          checked={confirmed}
          disabled={disabled || issues.length > 0}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        I checked the source, including every section's answer rule, marks and
        topic assignments.
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass}
          disabled={
            disabled ||
            stale ||
            !parsed.success ||
            missingTopicIssues.length > 0
          }
          onClick={() => void save(false)}
        >
          {saving === "draft" ? "Saving draft…" : "Save draft"}
        </button>
        <button
          type="button"
          className={primaryClass}
          disabled={disabled || !canApprove}
          onClick={() => void save(true)}
        >
          {saving === "approve" ? "Approving…" : "Approve paper"}
        </button>
        <a
          href={`/notes/${paper.noteId}`}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass}
        >
          Open original note
        </a>
      </div>
      {error && (
        <p role="alert" className="text-sm text-error-600">
          {error}
        </p>
      )}
      {status && (
        <p role="status" className="text-sm text-text-secondary">
          {status}
        </p>
      )}
    </div>
  );
}

export default function StudyExams({
  snapshot,
  onAnalyse,
  onSavePaper,
}: StudyExamsProps) {
  const versions = [
    ...new Set(snapshot.papers.map((paper) => paper.structure.syllabusVersion)),
  ].sort();
  const [version, setVersion] = useState(versions[0] ?? "");
  const selectedVersion = versions.includes(version)
    ? version
    : (versions[0] ?? "");
  const selectedPapers = snapshot.papers.filter(
    (paper) => paper.structure.syllabusVersion === selectedVersion,
  );
  const summary = useMemo(
    () =>
      summariseExamCorpus(
        selectedPapers,
        snapshot.map.topics,
        snapshot.map.taxonomyVersion,
        selectedVersion,
      ),
    [
      selectedPapers,
      snapshot.map.topics,
      snapshot.map.taxonomyVersion,
      selectedVersion,
    ],
  );
  const [showBounds, setShowBounds] = useState(false);
  const [openedPapers, setOpenedPapers] = useState<string[]>([]);
  const [analysing, setAnalysing] = useState<string[]>([]);
  const [messages, setMessages] = useState<
    Record<string, { error: boolean; text: string }>
  >({});
  const unanalysed = snapshot.materials.filter(
    (material) =>
      material.kind === "past_paper" &&
      !snapshot.papers.some((paper) => paper.noteId === material.noteId),
  );
  const queued = new Set(
    snapshot.jobs
      .filter(
        (job) =>
          job.kind === "paper" &&
          (job.state === "pending" || job.state === "running"),
      )
      .map((job) => job.noteId),
  );
  const failedJobs = new Map(
    snapshot.jobs
      .filter(
        (job) =>
          job.kind === "paper" && job.state === "failed" && job.noteId !== null,
      )
      .map((job) => [job.noteId, job.error]),
  );

  async function analyse(noteId: string) {
    setAnalysing((current) => [...current, noteId]);
    setMessages((current) => {
      const next = { ...current };
      delete next[noteId];
      return next;
    });
    try {
      await onAnalyse(noteId);
      setMessages((current) => ({
        ...current,
        [noteId]: {
          error: false,
          text: "Analysis requested. Review the extracted paper when it is ready.",
        },
      }));
    } catch (cause) {
      setMessages((current) => ({
        ...current,
        [noteId]: {
          error: true,
          text:
            cause instanceof Error
              ? cause.message
              : "Analysis failed. Try again.",
        },
      }));
    } finally {
      setAnalysing((current) => current.filter((id) => id !== noteId));
    }
  }

  function analysisButton(noteId: string, reanalyse: boolean) {
    const busy = analysing.includes(noteId) || queued.has(noteId);
    return (
      <button
        type="button"
        className={buttonClass}
        disabled={busy || !snapshot.provider.generationReady}
        onClick={() => void analyse(noteId)}
      >
        {busy ? "Analysing…" : reanalyse ? "Reanalyse" : "Analyse paper"}
      </button>
    );
  }

  function analysisMessage(noteId: string) {
    const message = messages[noteId];
    const jobError = failedJobs.get(noteId);
    return message ? (
      <p
        role={message.error ? "alert" : "status"}
        className={`mt-2 text-sm ${message.error ? "text-error-600" : "text-text-secondary"}`}
      >
        {message.text}
      </p>
    ) : jobError && !queued.has(noteId) ? (
      <p role="alert" className="mt-2 text-sm text-error-600">
        Analysis failed: {jobError}
      </p>
    ) : null;
  }

  return (
    <div className="space-y-6 text-text">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="text-xl font-semibold tracking-tight">
            Past paper coverage
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-text-secondary">
            See what appeared in the papers you have uploaded. Coverage uses
            approved, current papers from one syllabus version. It describes
            this collection, not what will appear in your next exam.
          </p>
        </div>
        <label className="min-w-48 space-y-1 text-sm text-text-secondary">
          Syllabus version
          <select
            className={inputClass}
            value={selectedVersion}
            disabled={versions.length === 0}
            onChange={(event) => setVersion(event.target.value)}
          >
            {versions.length === 0 && (
              <option value="">No analysed papers</option>
            )}
            {versions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!snapshot.provider.generationReady && (
        <p className="rounded-radius-lg border border-border-subtle bg-surface p-4 text-sm text-text-secondary">
          Paper analysis is unavailable until a generation provider is
          configured. You can still review and edit existing analyses.
        </p>
      )}
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {[
          ["Analysed", summary.paperCount],
          ["Reviewed", summary.reviewedCount],
          ["Eligible", summary.eligibleCount],
          ["Unreviewed", summary.unreviewedCount],
          ["Unresolved", summary.unresolvedCount],
          ["Duplicates", summary.duplicateCount],
        ].map(([label, count]) => (
          <div
            key={label}
            className="rounded-radius-lg border border-border-subtle bg-surface p-4"
          >
            <dt className="text-xs text-text-secondary">{label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">
              {count}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-xs leading-relaxed text-text-tertiary">
        Counts above cover {selectedVersion || "the selected syllabus"}.
        Reviewed includes papers excluded as unresolved or duplicate. Only
        eligible papers contribute to the topic table.{" "}
        {snapshot.papers.length - selectedPapers.length} analysed papers belong
        to other syllabus versions. {unanalysed.length} past-paper materials
        await analysis.
      </p>
      {summary.issues.length > 0 && (
        <ul className="list-disc space-y-1 rounded-radius-lg border border-border-subtle py-3 pl-8 pr-4 text-sm text-text-secondary">
          {summary.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}

      <section
        className="overflow-hidden rounded-radius-xl border border-border-subtle"
        aria-label="Historical topic coverage"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 bg-surface px-4 py-3">
          <h3 className="text-base font-semibold">Topic coverage</h3>
          <label className="flex min-h-11 items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              className="size-4 accent-primary-600"
              checked={showBounds}
              onChange={(event) => setShowBounds(event.target.checked)}
            />
            Show choice bounds
          </label>
        </div>
        {summary.eligibleCount === 0 ? (
          <p className="p-5 text-sm leading-relaxed text-text-secondary">
            No eligible papers for this syllabus version yet. Analyse a paper,
            correct the extraction and approve it to start comparing historical
            coverage.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">
                Historical coverage across {summary.eligibleCount} eligible
                papers for {selectedVersion}
              </caption>
              <thead className="border-y border-border-subtle text-xs text-text-secondary">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Topic
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Paper frequency
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Exclusive printed marks
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Shared printed marks
                  </th>
                  {showBounds && (
                    <th scope="col" className="px-4 py-3 font-medium">
                      Answerable marks range
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {summary.topics.map((topic) => (
                  <tr key={topic.topicId} className="hover:bg-surface">
                    <th scope="row" className="px-4 py-3 font-medium">
                      {topic.name}
                    </th>
                    <td className="px-4 py-3 tabular-nums">
                      {topic.paperCount}/{summary.eligibleCount}{" "}
                      <span className="text-text-secondary">
                        · {Math.round(topic.paperFrequencyPercent ?? 0)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {marks(topic.exclusiveMarks)}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {marks(topic.sharedMarks)}
                    </td>
                    {showBounds && (
                      <td className="px-4 py-3 tabular-nums">
                        {topic.minAnswerableMarks === null ||
                        topic.maxAnswerableMarks === null
                          ? "Unknown"
                          : `${marks(topic.minAnswerableMarks)} to ${marks(topic.maxAnswerableMarks)}`}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-border-subtle px-4 py-3 text-xs leading-relaxed text-text-secondary">
          Shared marks are not additive across topics. A multi-topic question
          contributes its full marks to each assigned topic. Choice bounds show
          the minimum and maximum available under the recorded answer rules,
          summed across eligible papers. They are not a score or a measure of
          your understanding.
        </p>
      </section>

      <section aria-label="Papers to analyse and review" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-lg font-semibold tracking-tight">
            Paper library
          </h3>
          <p className="text-xs text-text-tertiary">
            {snapshot.papers.length + unanalysed.length} papers across all
            syllabus versions
          </p>
        </div>
        {snapshot.papers.length === 0 && unanalysed.length === 0 && (
          <p className="rounded-radius-lg border border-border-subtle p-5 text-sm text-text-secondary">
            Add a past paper in Materials, set its kind to Past paper, then
            analyse it here.
          </p>
        )}
        {unanalysed.map((material) => (
          <article
            key={material.noteId}
            className="rounded-radius-xl border border-border-subtle p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="break-words font-medium">{material.title}</h4>
                <p className="mt-1 text-xs text-text-tertiary">
                  Awaiting analysis · syllabus version not known
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`/notes/${material.noteId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClass}
                >
                  Open original note
                </a>
                {analysisButton(material.noteId, false)}
              </div>
            </div>
            {analysisMessage(material.noteId)}
          </article>
        ))}
        {snapshot.papers.map((paper) => {
          const metric = summary.papers.find(
            (item) => item.noteId === paper.noteId,
          );
          const outsideVersion =
            paper.structure.syllabusVersion !== selectedVersion;
          const stale = paper.sourceHash !== paper.currentHash;
          const paperStatus = stale
            ? "Source changed"
            : outsideVersion
              ? "Other syllabus version"
              : metric?.status === "eligible"
                ? "Eligible"
                : metric?.status === "duplicate"
                  ? "Duplicate"
                  : metric?.status === "unresolved"
                    ? "Unresolved"
                    : "Unreviewed";
          return (
            <article
              key={paper.noteId}
              className="overflow-hidden rounded-radius-xl border border-border-subtle"
            >
              <details
                onToggle={(event) => {
                  if (event.currentTarget.open)
                    setOpenedPapers((current) =>
                      current.includes(paper.noteId)
                        ? current
                        : [...current, paper.noteId],
                    );
                }}
              >
                <summary className="min-h-11 cursor-pointer p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500">
                  <span className="ml-1 font-medium">{paper.title}</span>
                  <span className="ml-3 inline-block rounded-radius-sm bg-surface px-2 py-1 text-xs text-text-secondary">
                    {paperStatus}
                  </span>
                  <span className="mt-1 block pl-5 text-xs text-text-tertiary">
                    {paper.structure.year} · {paper.structure.sitting} ·{" "}
                    {paper.structure.syllabusVersion} ·{" "}
                    {paper.reviewed ? "Reviewed" : "Review required"}
                  </span>
                </summary>
                {metric?.duplicateOf && (
                  <p className="px-4 pb-3 text-sm text-text-secondary">
                    This source matches another upload and is counted once.{" "}
                    <a
                      className="text-primary-500 underline underline-offset-4"
                      href={`/notes/${metric.duplicateOf}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open the counted source
                    </a>
                    .
                  </p>
                )}
                {openedPapers.includes(paper.noteId) && (
                  <PaperEditor
                    key={`${paper.sourceHash}:${paper.currentHash}:${paper.taxonomyVersion}:${paper.reviewed}:${JSON.stringify(paper.structure)}`}
                    paper={paper}
                    snapshot={snapshot}
                    onSavePaper={onSavePaper}
                    busy={
                      analysing.includes(paper.noteId) ||
                      queued.has(paper.noteId)
                    }
                  />
                )}
              </details>
              <div className="border-t border-border-subtle px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  {analysisButton(paper.noteId, true)}
                  <p className="text-xs text-text-tertiary">
                    Reanalysis replaces this analysis with a new, unreviewed
                    extraction.
                  </p>
                </div>
                {analysisMessage(paper.noteId)}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
