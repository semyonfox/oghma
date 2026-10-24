"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  useEffectEvent,
} from "react";
import { z } from "zod";
import type {
  StudyBoard,
  StudyMapSnapshot,
  StudyMapSummary,
} from "@/lib/study-map/types";
import {
  RequestError,
  messageFor,
  requestJson,
  snapshotSchema,
} from "./study-client";
import StudyFlow, { type FlowModule } from "./study-flow";
import { clearNoteCache, secondarySmall } from "./study-flow-panels";
import { Toast } from "./study-chrome";

export type FlowScope = "module" | "all";

export interface StudyCanvasProps {
  snapshot: StudyMapSnapshot;
  maps: StudyMapSummary[];
  scope: FlowScope;
  onScopeChange: (scope: FlowScope) => void;
  onReview: (mapId: string, noteId: string) => void;
  onOpenModule: (mapId: string) => void;
  actions?: ReactNode;
  status?: ReactNode;
  notices?: ReactNode;
}

type SaveStatus = "saved" | "pending" | "saving" | "conflict" | "error";
interface BoardEntry {
  board: StudyBoard;
  version: number;
  status: SaveStatus;
  message: string | null;
}

const SAVE_DELAY = 700;
export const MAX_MODULES = 12;
const versionSchema = z.object({ version: z.number().int().nonnegative() });

function adopt(snapshot: StudyMapSnapshot): BoardEntry {
  return {
    board: snapshot.map.board,
    version: snapshot.map.boardVersion,
    status: "saved",
    message: null,
  };
}

export default function StudyCanvas({
  snapshot,
  maps,
  scope,
  onScopeChange,
  onReview,
  onOpenModule,
  actions,
  status,
  notices,
}: StudyCanvasProps) {
  const [entries, setEntries] = useState<Record<string, BoardEntry>>(() => ({
    [snapshot.map.id]: adopt(snapshot),
  }));
  // save timers and the pagehide flush read the latest boards; every
  // setEntries updater writes this too, so the ref never waits for a commit
  const entriesRef = useRef(entries);
  useLayoutEffect(() => {
    entriesRef.current = entries;
  });
  const timers = useRef(new Map<string, number>());
  const inflight = useRef(new Set<string>());
  const [others, setOthers] = useState<Record<string, StudyMapSnapshot>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scopeNoticeHidden, setScopeNoticeHidden] = useState(false);

  const update = (mapId: string, change: (entry: BoardEntry) => BoardEntry) => {
    setEntries((current) => {
      const entry = current[mapId];
      if (!entry) return current;
      const next = { ...current, [mapId]: change(entry) };
      entriesRef.current = next;
      return next;
    });
  };

  // a refreshed snapshot replaces the board only when nothing local is waiting to be saved
  const receive = (incoming: StudyMapSnapshot) => {
    setEntries((current) => {
      const entry = current[incoming.map.id];
      // a newer server board under local edits surfaces as a 409 on the next save
      if (
        entry &&
        (entry.status !== "saved" ||
          entry.version === incoming.map.boardVersion)
      )
        return current;
      const next = { ...current, [incoming.map.id]: adopt(incoming) };
      entriesRef.current = next;
      return next;
    });
  };

  const receiveSnapshot = useEffectEvent(receive);
  useEffect(() => {
    receiveSnapshot(snapshot);
    clearNoteCache();
  }, [snapshot]);

  // one PUT of the current board; true when it changed again meanwhile
  const saveOnce = async (mapId: string): Promise<boolean> => {
    const entry = entriesRef.current[mapId];
    if (!entry || entry.status === "conflict" || inflight.current.has(mapId))
      return false;
    inflight.current.add(mapId);
    const submitted = entry.board;
    update(mapId, (current) => ({
      ...current,
      status: "saving",
      message: null,
    }));
    const outcome = await requestJson(`/api/study-maps/${mapId}/board`, {
      method: "PUT",
      body: JSON.stringify({ version: entry.version, board: submitted }),
    })
      .then((value) => versionSchema.parse(value))
      .then(
        (result) => ({ result }),
        (error: unknown) => ({ error }),
      );
    inflight.current.delete(mapId);
    if ("error" in outcome) {
      const { error } = outcome;
      update(mapId, (current) => ({
        ...current,
        status:
          error instanceof RequestError && error.status === 409
            ? "conflict"
            : "error",
        message: messageFor(error),
      }));
      return false;
    }
    const changed = entriesRef.current[mapId]?.board !== submitted;
    update(mapId, (current) => ({
      ...current,
      version: outcome.result.version,
      status: changed ? "pending" : "saved",
    }));
    return changed;
  };
  const save = async (mapId: string) => {
    while (await saveOnce(mapId));
  };

  const change = (mapId: string, board: StudyBoard) => {
    update(mapId, (entry) => ({
      ...entry,
      board,
      status: entry.status === "conflict" ? "conflict" : "pending",
    }));
    window.clearTimeout(timers.current.get(mapId));
    timers.current.set(
      mapId,
      window.setTimeout(() => void save(mapId), SAVE_DELAY),
    );
  };

  // leaving the page should not lose a move made in the last moment
  useEffect(() => {
    const flush = () => {
      for (const [mapId, entry] of Object.entries(entriesRef.current)) {
        if (entry.status !== "pending") continue;
        void fetch(`/api/study-maps/${mapId}/board`, {
          method: "PUT",
          keepalive: true,
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version: entry.version, board: entry.board }),
        }).catch(() => undefined);
      }
    };
    const pending = timers.current;
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
      for (const timer of pending.values()) window.clearTimeout(timer);
    };
  }, []);

  const resolve = async (mapId: string, keepMine: boolean) => {
    const fetched = await requestJson(`/api/study-maps/${mapId}`)
      .then((value) => snapshotSchema.parse(value))
      .then(
        (incoming) => ({ incoming }),
        (error: unknown) => ({ error }),
      );
    if ("error" in fetched) {
      update(mapId, (entry) => ({ ...entry, message: messageFor(fetched.error) }));
      return;
    }
    const { incoming } = fetched;
    if (mapId !== snapshot.map.id)
      setOthers((current) => ({ ...current, [mapId]: incoming }));
    if (keepMine) {
      update(mapId, (entry) => ({
        ...entry,
        version: incoming.map.boardVersion,
        status: "pending",
        message: null,
      }));
      void save(mapId);
    } else {
      setEntries((current) => {
        const next = { ...current, [mapId]: adopt(incoming) };
        entriesRef.current = next;
        return next;
      });
    }
  };

  const otherIds = maps
    .filter((map) => map.id !== snapshot.map.id)
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, MAX_MODULES - 1)
    .map((map) => map.id);
  const otherKey = otherIds.join(",");

  useEffect(() => {
    if (scope !== "all" || !otherKey) return;
    const controller = new AbortController();
    const ids = otherKey.split(",");
    setLoading(true);
    setLoadError(null);
    setScopeNoticeHidden(false);
    let failures = 0;
    void (async () => {
      // a few at a time keeps a large library from flooding the API
      for (let index = 0; index < ids.length; index += 3) {
        const batch = await Promise.allSettled(
          ids.slice(index, index + 3).map(async (id) =>
            snapshotSchema.parse(
              await requestJson(`/api/study-maps/${id}`, {
                signal: controller.signal,
              }),
            ),
          ),
        );
        if (controller.signal.aborted) return;
        for (const result of batch) {
          if (result.status === "rejected") {
            failures += 1;
            continue;
          }
          setOthers((current) => ({
            ...current,
            [result.value.map.id]: result.value,
          }));
          receiveSnapshot(result.value);
        }
      }
      setLoading(false);
      if (failures)
        setLoadError(
          `${failures} ${failures === 1 ? "module" : "modules"} could not be loaded. The rest are shown.`,
        );
    })();
    return () => controller.abort();
  }, [otherKey, scope]);

  const moduleSnapshots = [
    snapshot,
    ...(scope === "all"
      ? otherIds
          .map((id) => others[id])
          .filter((entry): entry is StudyMapSnapshot => Boolean(entry))
      : []),
  ];
  const modules: FlowModule[] = moduleSnapshots.map((entry) => ({
    snapshot: entry,
    board: entries[entry.map.id]?.board ?? entry.map.board,
  }));

  const statuses = modules.map((module) => ({
    module,
    entry: entries[module.snapshot.map.id],
  }));
  const conflict = statuses.find(({ entry }) => entry?.status === "conflict");
  const failed = statuses.find(({ entry }) => entry?.status === "error");
  const saving = statuses.some(
    ({ entry }) => entry?.status === "saving" || entry?.status === "pending",
  );
  const hiddenCount = maps.length - 1 - otherIds.length;

  const saveText = conflict
    ? "Changed elsewhere"
    : failed
      ? "Not saved"
      : saving
        ? "Saving…"
        : loading
          ? "Loading modules…"
          : "Saved";

  return (
    <StudyFlow
      modules={modules}
      viewKey={scope === "all" ? "all" : snapshot.map.id}
      actions={actions}
      status={status}
      saveStatus={
        <span
          role="status"
          title="Layout changes save automatically"
          className={`whitespace-nowrap px-2 text-xs ${conflict || failed ? "text-error-700 dark:text-error-300" : "text-text-tertiary"}`}
        >
          {saveText}
        </span>
      }
      notices={
        <>
          {conflict && (
            <Toast tone="warning">
              <span>
                The {conflict.module.snapshot.map.name} layout changed in
                another tab or device.
              </span>
              <span className="flex gap-1.5">
                <button
                  type="button"
                  className={secondarySmall}
                  onClick={() =>
                    void resolve(conflict.module.snapshot.map.id, false)
                  }
                >
                  Use the latest
                </button>
                <button
                  type="button"
                  className={secondarySmall}
                  onClick={() =>
                    void resolve(conflict.module.snapshot.map.id, true)
                  }
                >
                  Keep mine
                </button>
              </span>
            </Toast>
          )}
          {failed && !conflict && (
            <Toast tone="error">
              <span>
                {failed.entry.message ?? "The layout could not be saved."}
              </span>
              <button
                type="button"
                className={secondarySmall}
                onClick={() => void save(failed.module.snapshot.map.id)}
              >
                Try again
              </button>
            </Toast>
          )}
          {scope === "all" &&
            !scopeNoticeHidden &&
            (loadError || hiddenCount > 0) && (
              <Toast tone="info" onDismiss={() => setScopeNoticeHidden(true)}>
                {loadError ?? ""}
                {hiddenCount > 0
                  ? ` Showing ${MAX_MODULES} modules; open another from the module list.`
                  : ""}
              </Toast>
            )}
          {notices}
        </>
      }
      onBoardChange={change}
      onReview={onReview}
      onOpenModule={onOpenModule}
      onShowAllModules={
        scope === "module" && maps.length > 1
          ? () => onScopeChange("all")
          : undefined
      }
    />
  );
}
