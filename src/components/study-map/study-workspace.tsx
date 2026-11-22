"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { z } from "zod";
import { MAX_MODULES, type FlowScope } from "./study-canvas";
import {
  ChromeFrame,
  ModuleSwitcher,
  ScopeToggle,
  Toast,
  islandClass,
  islandDivider,
} from "./study-chrome";
import StudyDrawer, { useDockedSheet } from "./study-drawer";

import StudySearch from "./study-search";

import { messageFor, requestJson, summarySchema } from "./study-client";
import { mapCreateSchema, type StudyMapSummary } from "@/lib/study-map/types";

import { MapForm } from "./study-map-forms";
import { ModuleWorkspace } from "./study-module-workspace";
import {
  type MapFields,
  panelSchema,
  type Panel,
  panelTitles,
  browsingPanels,
  clearedFilters,
  updateLocation,
  secondaryClass,
  primaryClass,
} from "./study-workspace-shared";

export interface StudyWorkspaceProps {
  initialMaps: StudyMapSummary[];
  initialMapId?: string | null;
  initialNoteId?: string | null;
}

export default function StudyWorkspace({
  initialMaps,
  initialMapId,
  initialNoteId,
}: StudyWorkspaceProps) {
  const [maps, setMaps] = useState(initialMaps);
  const [mapId, setMapId] = useState(initialMapId ?? initialMaps[0]?.id ?? "");
  // imported courses become modules on open; only an empty result shows the manual form
  const [settingUp, setSettingUp] = useState(true);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [noteId, setNoteId] = useState(initialNoteId);
  const [noteRequest, setNoteRequest] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [scope, setScope] = useState<FlowScope>("module");
  const docked = useDockedSheet();
  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const restoredMap = z.uuid().safeParse(parameters.get("map"));
    const restoredNote = z.uuid().safeParse(parameters.get("note"));
    if (restoredMap.success) setMapId(restoredMap.data);
    // back navigation can replay the note the page was first opened with, after it was closed
    setNoteId(restoredNote.success ? restoredNote.data : null);
    if (parameters.get("scope") === "all") setScope("all");
    updateLocation({ map: restoredMap.success ? restoredMap.data : mapId });
  }, [mapId]);
  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    // older links name the open view with tab
    const restored = panelSchema.safeParse(
      parameters.get("panel") ?? parameters.get("tab"),
    );
    if (restored.success) setPanel(restored.data);
    updateLocation({
      panel: restored.success ? restored.data : null,
      tab: null,
    });
  }, []);
  const choosePanel = (next: Panel | null) => {
    setPanel(next);
    updateLocation({ panel: next });
  };

  const refreshMaps = async () => {
    const incoming = summarySchema
      .array()
      .parse(await requestJson("/api/study-maps"));
    setMaps(incoming);
  };

  // a ref rather than a cancel flag: strict mode reruns the effect, and the
  // first request may already have created the modules the second one would miss
  const setupStarted = useRef(false);
  useEffect(() => {
    if (setupStarted.current) return;
    setupStarted.current = true;
    const setup = async () => {
      const { created } = z
        .object({ created: z.number().int().nonnegative() })
        .parse(
          await requestJson("/api/study-maps/setup", {
            method: "POST",
            body: "{}",
          }),
        );
      if (created === 0) return;
      const incoming = summarySchema
        .array()
        .parse(await requestJson("/api/study-maps"));
      setMaps(incoming);
      setMapId((current) => current || incoming[0]?.id || "");
      setMessage(
        `Added ${created} ${created === 1 ? "module" : "modules"} from your Canvas courses.`,
      );
    };
    void setup()
      .catch((error: unknown) => setError(messageFor(error)))
      .finally(() => setSettingUp(false));
  }, []);

  async function create(fields: MapFields) {
    setBusy(true);
    setError(null);
    setMessage(null);
    const run = async () => {
      const result = z
        .object({ mapId: z.uuid(), warning: z.string().nullable() })
        .parse(
          await requestJson("/api/study-maps", {
            method: "POST",
            body: JSON.stringify(mapCreateSchema.parse(fields)),
          }),
        );
      await refreshMaps();
      updateLocation({ map: result.mapId, note: null, ...clearedFilters });
      setNoteId(null);
      setMapId(result.mapId);
      choosePanel(null);
      if (result.warning)
        setMessage(
          `Module created. Source sync needs attention: ${result.warning}`,
        );
    };
    await run()
      .catch((error: unknown) => {
        setError(messageFor(error));
        throw error;
      })
      .finally(() => setBusy(false));
  }

  async function deleted() {
    const incoming = summarySchema
      .array()
      .parse(await requestJson("/api/study-maps"));
    setMaps(incoming);
    updateLocation({
      map: incoming[0]?.id ?? null,
      note: null,
      ...clearedFilters,
    });
    setNoteId(null);
    setMapId(incoming[0]?.id ?? "");
    choosePanel(null);
  }

  const changeScope = (next: FlowScope) => {
    setScope(next);
    updateLocation({ scope: next === "all" ? "all" : null });
  };
  // rendered once at page level so an open switcher menu survives the map loading or changing
  const island = (
    <div className="pointer-events-none absolute left-3 top-3 z-40 flex max-w-[calc(100%-1.5rem)]">
      <div className={islandClass}>
        <ModuleSwitcher
          maps={maps}
          mapId={mapId}
          disabled={busy}
          onSelect={(target) => {
            if (target === mapId) return;
            updateLocation({ map: target, note: null, ...clearedFilters });
            setMapId(target);
            setNoteId(null);
            setError(null);
            setMessage(null);
            if (panel && !browsingPanels.has(panel)) choosePanel(null);
          }}
          onSearch={() => choosePanel("search")}
          onAddModule={() => choosePanel("create")}
        />
        {mapId && (
          <>
            <span className={islandDivider} aria-hidden="true" />
            <ScopeToggle
              scope={scope}
              count={Math.min(maps.length, MAX_MODULES)}
              onChange={changeScope}
            />
          </>
        )}
      </div>
    </div>
  );
  const notices = (
    <>
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
    </>
  );

  return (
    <main className="relative h-full min-h-0 overflow-hidden bg-app-page text-text">
      <h1 className="sr-only">Study maps</h1>
      {mapId ? (
        <ModuleWorkspace
          key={mapId}
          mapId={mapId}
          initialNoteId={noteId}
          noteRequest={noteRequest}
          panel={panel}
          docked={docked}
          maps={maps}
          scope={scope}
          notices={notices}
          onPanelChange={choosePanel}
          onScopeChange={changeScope}
          onOpenModule={(target, note) => {
            updateLocation({
              map: target,
              note: note ?? null,
              ...clearedFilters,
            });
            setMapId(target);
            setNoteId(note ?? null);
            if (note) setNoteRequest((value) => value + 1);
          }}
          onRefreshMaps={refreshMaps}
          onDeleted={deleted}
          onBusyChange={setBusy}
        />
      ) : (
        <ChromeFrame notices={notices}>
          {settingUp ? (
            <p role="status" className="text-sm text-text-secondary">
              Setting up your modules...
            </p>
          ) : (
            <section className="max-w-md rounded-radius-xl border border-border-subtle bg-surface-overlay p-6 shadow-float">
              <h2 className="font-serif text-lg font-semibold tracking-tight">No modules yet</h2>
              <p className="mt-2 text-sm text-text-secondary">
                Import a course from Canvas and its module map appears here on
                its own, with its notes grouped by topic.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/settings#canvas" className={primaryClass}>
                  Connect Canvas
                </Link>
                <button
                  type="button"
                  className={secondaryClass}
                  onClick={() => choosePanel("create")}
                >
                  Add a module from a folder
                </button>
              </div>
            </section>
          )}
        </ChromeFrame>
      )}
      {island}
      <StudyDrawer
        open={panel === "create" || panel === "search"}
        title={panel === "search" ? panelTitles.search : panelTitles.create}
        docked={docked}
        wide={panel === "search"}
        onClose={() => choosePanel(null)}
      >
        {panel === "search" ? (
          <StudySearch
            onOpenMap={(mapId, noteId) => {
              updateLocation({ map: mapId, note: noteId, ...clearedFilters });
              setMapId(mapId);
              setNoteId(noteId);
              setNoteRequest((value) => value + 1);
              choosePanel(null);
            }}
          />
        ) : (
          <MapForm
            creating
            busy={busy}
            onSave={create}
            onCancel={() => choosePanel(null)}
          />
        )}
      </StudyDrawer>
    </main>
  );
}
