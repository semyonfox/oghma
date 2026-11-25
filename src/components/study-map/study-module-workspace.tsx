
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  useEffectEvent,
} from "react";

import { z } from "zod";
import { serverEventsConnected, subscribeServerEvents } from "@/lib/server-events/client";
import { createPoller } from "@/lib/server-events/poller";
import { ModuleMenu } from "./study-module-menu";
import StudyCanvas, { type FlowScope } from "./study-canvas";
import { ChromeFrame, Toast } from "./study-chrome";
import StudyDrawer from "./study-drawer";
import StudyInspector from "./study-inspector";
import StudyExams from "./study-exams";
import ExamPaperImportControl from "./exam-paper-import";

import { secondarySmall } from "./study-flow-panels";
import { messageFor, requestJson, snapshotSchema } from "./study-client";
import {
  mapUpdateSchema,
  type StudyMapSnapshot,
  type StudyMapSummary,
  type StudyTopic,
} from "@/lib/study-map/types";

import { MapForm, AddMaterials, ManualTopic } from "./study-map-forms";
import { MaterialList } from "./study-material-list";
import {
  type Selection,
  type Panel,
  panelTitles,
  updateLocation,
  secondaryClass,
  dangerClass,
  errorClass,
} from "./study-workspace-shared";

// one module's map with its panels, setup progress and menu

type ActiveJob = StudyMapSnapshot["jobs"][number];

/** what the automatic setup is doing, or the one action it could use */
function describeSetup(
  snapshot: StudyMapSnapshot,
  activeJobs: ActiveJob[],
): { short: string; text: string; action?: "find" | "find-now" } | null {
  const { map, provider } = snapshot;
  if (activeJobs.some((job) => job.kind === "taxonomy"))
    return {
      short: "Finding topics…",
      text: "Reading this module's material to find its topics...",
    };
  const sorting = activeJobs.filter((job) => job.kind === "classify").length;
  if (sorting > 0)
    return {
      short: `Sorting ${sorting} ${sorting === 1 ? "note" : "notes"}…`,
      text: `Sorting ${sorting} ${sorting === 1 ? "note" : "notes"} into topics. The map fills in as they finish.`,
    };
  if (map.topics.length > 0) return null;
  if (snapshot.materials.length === 0)
    return {
      short: "No notes yet",
      text:
        map.rootNoteId || map.canvasCourseId
          ? "Waiting for this module's notes to arrive."
          : "This module has no notes yet. Add materials or choose its notes folder in Module settings.",
    };
  if (!provider.generationReady)
    return {
      short: "No topics yet",
      text: "Topic suggestions are unavailable right now. Notes wait under Not sorted yet, and you can add topics yourself under Topics.",
    };
  const proposal = snapshot.jobs.find((job) => job.kind === "taxonomy");
  if (proposal?.state === "failed")
    return {
      short: "Topics not found",
      text: `Topics could not be found. ${proposal.error ?? ""}`,
      action: "find",
    };
  if (proposal)
    return {
      short: "No topics found",
      text: "No topics were found in this module's material. Add one yourself under Topics, or try again.",
      action: "find",
    };
  return {
    short: "No topics yet",
    text: map.autoClassify
      ? "Notes wait under Not sorted yet. Topics are found automatically once the course finishes importing."
      : "Notes wait under Not sorted yet. Find topics to group them.",
    action: map.autoClassify ? "find-now" : "find",
  };
}


export function ModuleWorkspace({
  mapId,
  initialNoteId,
  noteRequest,
  panel,
  docked,
  maps,
  scope,
  notices,
  onPanelChange,
  onScopeChange,
  onOpenModule,
  onRefreshMaps,
  onDeleted,
  onBusyChange,
}: {
  mapId: string;
  initialNoteId?: string | null;
  noteRequest: number;
  panel: Panel | null;
  docked: boolean;
  maps: StudyMapSummary[];
  scope: FlowScope;
  notices: ReactNode;
  onPanelChange: (panel: Panel | null) => void;
  onScopeChange: (scope: FlowScope) => void;
  onOpenModule: (mapId: string, noteId?: string | null) => void;
  onRefreshMaps: () => Promise<void>;
  onDeleted: () => Promise<void>;
  onBusyChange: (busy: boolean) => void;
}) {
  const [snapshot, setSnapshot] = useState<StudyMapSnapshot | null>(null);
  const snapshotRef = useRef(snapshot);
  const requestSequence = useRef(0);
  const mounted = useRef(true);
  const operationRef = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(
    initialNoteId ? { kind: "note", id: initialNoteId } : null,
  );
  const [topicForm, setTopicForm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [noteOfferHidden, setNoteOfferHidden] = useState(false);
  const closeInspector = () => {
    setSelection(null);
    updateLocation({ note: null });
  };
  const selectInspector = (selection: Selection | null) => {
    setSelection(selection);
    updateLocation({ note: selection?.kind === "note" ? selection.id : null });
  };
  // a drawer opened from the menu replaces the inspector; one opened from a drawer sits on top of it
  function openPanel(next: Panel) {
    closeInspector();
    onPanelChange(next);
  }
  const closePanel = () => onPanelChange(null);

  const refresh = async (signal?: AbortSignal) => {
    const sequence = ++requestSequence.current;
    const incoming = snapshotSchema.parse(
      await requestJson(`/api/study-maps/${mapId}`, { signal }),
    );
    if (
      !mounted.current ||
      signal?.aborted ||
      sequence !== requestSequence.current
    )
      return;
    snapshotRef.current = incoming;
    setSnapshot(incoming);
  };

  useEffect(() => {
    if (initialNoteId) setSelection({ kind: "note", id: initialNoteId });
    else setSelection((current) => (current?.kind === "note" ? null : current));
  }, [initialNoteId, noteRequest]);

  const refreshSnapshot = useEffectEvent(refresh);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void refreshSnapshot(controller.signal).catch((error) => {
      if (!controller.signal.aborted) setError(messageFor(error));
    });
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, [mapId]);

  const hasActiveJobs =
    snapshot?.jobs.some(
      (job) => job.state === "pending" || job.state === "running",
    ) ?? false;
  useEffect(() => {
    if (!hasActiveJobs) return;
    // with events on, each job change nudges a refresh, so it only polls without them
    const nextDelay = () => (serverEventsConnected() ? null : 3000);
    const poller = createPoller(async () => {
      if (!operationRef.current) {
        await refreshSnapshot().catch((error: unknown) => {
          if (mounted.current) setError(messageFor(error));
        });
      }
      return nextDelay();
    }, 1000, nextDelay());
    const unsubscribe = subscribeServerEvents((event) => {
      if (event.type === "resync" || (event.type === "study" && event.mapId === mapId)) poller.nudge();
    });
    return () => {
      poller.stop();
      unsubscribe();
    };
  }, [hasActiveJobs, mapId]);

  async function operate(
    name: string,
    operation: () => Promise<void>,
    success: string,
    reload = true,
  ) {
    if (operationRef.current)
      throw new Error("Another change is being saved. Wait for it to finish.");
    operationRef.current = true;
    setBusy(name);
    onBusyChange(true);
    setError(null);
    setMessage(null);
    const run = async () => {
      await operation();
      if (reload) {
        await refresh().catch((error: unknown) => {
          if (mounted.current)
            setError(
              `${success} The latest view could not be refreshed. ${messageFor(error)}`,
            );
        });
      }
      if (mounted.current) setMessage(success);
      await onRefreshMaps().catch((error: unknown) => {
        if (mounted.current)
          setError(
            `${success} The module list could not be refreshed. ${messageFor(error)}`,
          );
      });
    };
    await run()
      .catch((error: unknown) => {
        if (mounted.current) setError(messageFor(error));
        throw error;
      })
      .finally(() => {
        operationRef.current = false;
        if (mounted.current) setBusy(null);
        onBusyChange(false);
      });
  }

  function launch(operation: Promise<void>) {
    void operation.catch(() => undefined);
  }

  function mutation(
    path: string,
    method: string,
    body: unknown,
    success: string,
  ) {
    return operate(
      path || "settings",
      async () => {
        await requestJson(`/api/study-maps/${mapId}${path}`, {
          method,
          body: JSON.stringify(body),
        });
      },
      success,
    );
  }

  async function saveTopics(topics: StudyTopic[]) {
    const current = snapshotRef.current;
    if (!current) throw new Error("The module is still loading.");
    await mutation(
      "/topics",
      "PUT",
      { version: current.map.version, topics },
      "Topics saved.",
    );
  }

  async function queue(
    kind: "taxonomy" | "classify" | "paper",
    noteId: string | null = null,
  ) {
    const current = snapshotRef.current;
    if (!current) throw new Error("The module is still loading.");
    if (
      kind !== "taxonomy" &&
      !current.map.topics.some((topic) => topic.reviewed)
    )
      throw new Error(
        "Approve at least one topic before processing materials.",
      );
    let queued = 0;
    await operate(
      kind,
      async () => {
        const result = z
          .object({ queued: z.number().int().nonnegative() })
          .parse(
            await requestJson(`/api/study-maps/${mapId}/jobs`, {
              method: "POST",
              body: JSON.stringify({ kind, noteId }),
            }),
          );
        queued = result.queued;
      },
      "Processing requested. Results will appear here for review.",
    );
    if (queued === 0)
      setMessage(
        "No new jobs were needed. Existing jobs and current materials are kept.",
      );
  }

  if (!snapshot)
    return (
      <ChromeFrame notices={notices}>
        {error ? (
          <div className="max-w-md space-y-3 rounded-radius-xl border border-border-subtle bg-surface-overlay p-5 shadow-float">
            <p role="alert" className={errorClass}>
              {error}
            </p>
            <button
              type="button"
              className={secondaryClass}
              onClick={() =>
                void refresh().catch((error) => setError(messageFor(error)))
              }
            >
              Retry loading module
            </button>
          </div>
        ) : (
          <p role="status" className="text-sm text-text-secondary">
            Loading module map...
          </p>
        )}
      </ChromeFrame>
    );
  const map = snapshot.map;
  const activeJobs = snapshot.jobs.filter(
    (job) => job.state === "pending" || job.state === "running",
  );
  const failedJobs = snapshot.jobs.filter((job) => job.state === "failed");
  const reviewedTopics = map.topics.filter((topic) => topic.reviewed).length;
  const toCheck = map.topics.length - reviewedTopics;
  const setupStatus = describeSetup(snapshot, activeJobs);
  const findingTopics = activeJobs.some((job) => job.kind === "taxonomy");
  const missingNote =
    initialNoteId &&
    !snapshot.materials.some((material) => material.noteId === initialNoteId)
      ? initialNoteId
      : null;
  const modulePanel =
    panel && panel !== "search" && panel !== "create" ? panel : null;
  const globalPanel = panel === "search" || panel === "create";
  const findTopics = () => launch(queue("taxonomy"));
  const inspector = selection && (
    <StudyInspector
      snapshot={snapshot}
      selection={selection}
      onClose={closeInspector}
      onReviewMaterial={(input) =>
        mutation("/materials", "PATCH", input, "Material corrections saved.")
      }
      onSaveTopics={saveTopics}
      onRemoveMaterial={(noteId) =>
        mutation(
          "/materials",
          "DELETE",
          { noteId },
          "Material removed from this map. Your original note is kept.",
        )
      }
      onClassify={(noteId) => queue("classify", noteId)}
    />
  );

  const menu = (
    <ModuleMenu
      snapshot={snapshot}
      busy={busy !== null}
      toCheck={toCheck}
      reviewedTopics={reviewedTopics}
      findingTopics={findingTopics}
      classifying={activeJobs.some((job) => job.kind === "classify")}
      failedCount={failedJobs.length}
      openPanel={openPanel}
      onFindTopics={findTopics}
      onSync={() =>
        launch(
          mutation(
            "/refresh",
            "POST",
            {},
            "Source folder and course materials synced.",
          ),
        )
      }
      onClassify={() => launch(queue("classify"))}
    />
  );

  const setupPill = setupStatus && (
    <div
      role="status"
      title={setupStatus.text}
      className={`pointer-events-auto flex max-w-[min(22rem,calc(100vw-1.5rem))] items-center gap-2 rounded-full border border-border-subtle bg-surface-overlay/95 py-1 pl-3 text-xs text-text-secondary shadow-float backdrop-blur ${setupStatus.action ? "pr-1" : "pr-3"}`}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${setupStatus.action ? "bg-warning-500" : "animate-pulse bg-accent"}`}
        aria-hidden="true"
      />
      <button
        type="button"
        className="min-w-0 truncate text-left hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
        onClick={() => openPanel("topics")}
      >
        {setupStatus.short}
      </button>
      {setupStatus.action && (
        <button
          type="button"
          className="shrink-0 rounded-full bg-action px-2.5 py-1 font-medium text-on-action hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
          disabled={busy !== null}
          onClick={findTopics}
        >
          {setupStatus.action === "find-now"
            ? "Find topics now"
            : "Find topics"}
        </button>
      )}
    </div>
  );

  const topicsPanel = (
    <div className="space-y-4">
      <p className="text-xs text-text-tertiary">
        {map.topics.length} topics
        {toCheck > 0 ? ` · ${toCheck} to check` : ""}
        {map.autoClassify ? " · organised automatically" : ""}
      </p>
      {setupStatus && (
        <div className="space-y-2 rounded-radius-lg bg-surface-elevated p-3 text-sm text-text-secondary">
          <p className="break-words">{setupStatus.text}</p>
          {setupStatus.action && (
            <button
              type="button"
              className={secondaryClass}
              disabled={busy !== null}
              onClick={findTopics}
            >
              {setupStatus.action === "find-now"
                ? "Find topics now"
                : "Find topics"}
            </button>
          )}
        </div>
      )}
      <button
        type="button"
        className={secondaryClass}
        disabled={busy !== null || map.topics.length >= 80}
        aria-expanded={topicForm}
        onClick={() => setTopicForm((value) => !value)}
      >
        Add a topic
      </button>
      {topicForm && (
        <ManualTopic
          busy={busy !== null}
          onClose={() => setTopicForm(false)}
          onAdd={async (topic) => {
            await saveTopics([...map.topics, topic]);
            selectInspector({ kind: "topic", id: topic.id });
          }}
        />
      )}
      {map.topics.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {map.topics.map((topic) => (
            <li key={topic.id}>
              <button
                type="button"
                className={`${secondaryClass} w-full justify-start text-left`}
                onClick={() => selectInspector({ kind: "topic", id: topic.id })}
              >
                <span className="min-w-0">
                  <span className="block break-words">{topic.name}</span>
                  <span className="block text-xs text-text-tertiary">
                    {topic.reviewed ? "In use" : "Check and approve"}
                    {topic.sources.length === 0
                      ? " · Your definition"
                      : " · From the syllabus"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!snapshot.provider.ready && (
        <p className="text-sm text-text-secondary">
          Automatic sorting is unavailable. You can organise materials and
          topics yourself.
        </p>
      )}
      {failedJobs.length > 0 && (
        <section
          aria-label="Processing errors"
          className="space-y-2 rounded-radius-lg border border-border-subtle p-3"
        >
          <h3 className="text-sm font-medium text-text-secondary">
            Processing errors
          </h3>
          <ul className="space-y-2">
            {failedJobs.map((job) => (
              <li
                key={job.id}
                className="text-sm text-error-700 dark:text-error-300"
              >
                {job.kind === "taxonomy"
                  ? "Topic proposal"
                  : job.kind === "paper"
                    ? "Paper analysis"
                    : "Classification"}
                {job.noteId
                  ? ` · ${snapshot.materials.find((material) => material.noteId === job.noteId)?.title || "Material"}`
                  : ""}
                : {job.error || "Processing failed. Try again."}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );

  const settingsPanel = (
    <div className="space-y-5">
      <MapForm
        key={map.id}
        initial={map}
        creating={false}
        busy={busy !== null}
        onCancel={closePanel}
        onSave={async (fields, version) => {
          const parsed = mapUpdateSchema.parse({ ...fields, version });
          await mutation("", "PATCH", parsed, "Module settings saved.");
          closePanel();
        }}
      />
      <div className="space-y-2 border-t border-border-subtle pt-4">
        <p className="text-sm text-text-secondary">
          Deleting this module removes its map, topic definitions, and exam
          reviews. Your notes and files stay in the library.
        </p>
        {deleteConfirm ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Delete this module map?</span>
            <button
              type="button"
              className={dangerClass}
              disabled={busy !== null}
              onClick={() =>
                launch(
                  operate(
                    "delete",
                    async () => {
                      await requestJson(`/api/study-maps/${mapId}`, {
                        method: "DELETE",
                      });
                      await onDeleted();
                    },
                    "Module deleted.",
                    false,
                  ),
                )
              }
            >
              Confirm deletion
            </button>
            <button
              type="button"
              className={secondaryClass}
              disabled={busy !== null}
              onClick={() => setDeleteConfirm(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={dangerClass}
            disabled={busy !== null}
            onClick={() => setDeleteConfirm(true)}
          >
            Delete module map
          </button>
        )}
      </div>
    </div>
  );

  const panelContent =
    modulePanel === "topics" ? (
      topicsPanel
    ) : modulePanel === "materials" ? (
      <MaterialList
        snapshot={snapshot}
        onSelect={selectInspector}
        selected={selection}
      />
    ) : modulePanel === "exams" ? (
      <div className="space-y-4">
        <ExamPaperImportControl
          key={snapshot.map.id}
          mapId={snapshot.map.id}
          moduleName={snapshot.map.name}
          onImported={() => refresh()}
        />
        <StudyExams
          snapshot={snapshot}
          onAnalyse={(noteId) => queue("paper", noteId)}
          onSavePaper={(input) =>
            mutation("/papers", "PUT", input, "Exam review saved.")
          }
        />
      </div>
    ) : modulePanel === "add" ? (
      <AddMaterials
        snapshot={snapshot}
        busy={busy !== null}
        onAdd={(noteIds) =>
          mutation("/materials", "POST", { noteIds }, "Materials added.")
        }
        onClose={closePanel}
      />
    ) : modulePanel === "settings" ? (
      settingsPanel
    ) : null;

  return (
    <>
      <StudyCanvas
        snapshot={snapshot}
        maps={maps}
        scope={scope}
        onScopeChange={onScopeChange}
        onReview={(reviewMap, noteId) => {
          if (reviewMap === mapId)
            selectInspector({ kind: "note", id: noteId });
          else onOpenModule(reviewMap, noteId);
        }}
        onOpenModule={(target) => onOpenModule(target)}
        actions={menu}
        status={setupPill}
        notices={
          <>
            {notices}
            {error && (
              <Toast
                key={`error:${error}`}
                tone="error"
                onDismiss={() => setError(null)}
              >
                {error}
              </Toast>
            )}
            {message && (
              <Toast
                key={`message:${message}`}
                tone="info"
                timeout={6000}
                onDismiss={() => setMessage(null)}
              >
                {message}
              </Toast>
            )}
            {missingNote && !noteOfferHidden && (
              <Toast tone="info" onDismiss={() => setNoteOfferHidden(true)}>
                <span>The note you opened is not in this module.</span>
                <button
                  type="button"
                  className={secondarySmall}
                  disabled={busy !== null}
                  onClick={() =>
                    launch(
                      mutation(
                        "/materials",
                        "POST",
                        { noteIds: [missingNote] },
                        "Note added to this module.",
                      ),
                    )
                  }
                >
                  Add this note
                </button>
              </Toast>
            )}
          </>
        }
      />
      <StudyDrawer
        open={!globalPanel && (selection !== null || modulePanel !== null)}
        title={
          selection
            ? "Study map inspector"
            : modulePanel
              ? panelTitles[modulePanel]
              : ""
        }
        docked={docked}
        wide={
          !selection && (modulePanel === "materials" || modulePanel === "exams")
        }
        header={!selection}
        focusSelector={selection ? '[aria-label="Close inspector"]' : undefined}
        onClose={selection ? closeInspector : closePanel}
      >
        {selection ? inspector : panelContent}
      </StudyDrawer>
    </>
  );
}
