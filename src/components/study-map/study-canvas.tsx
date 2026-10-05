"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
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

export type FlowScope = "module" | "all";

export interface StudyCanvasProps {
  snapshot: StudyMapSnapshot;
  maps: StudyMapSummary[];
  scope: FlowScope;
  onScopeChange: (scope: FlowScope) => void;
  onReview: (mapId: string, noteId: string) => void;
  onOpenModule: (mapId: string) => void;
  actions?: ReactNode;
}

type SaveStatus = "saved" | "pending" | "saving" | "conflict" | "error";
interface BoardEntry {
  board: StudyBoard;
  version: number;
  status: SaveStatus;
  message: string | null;
}

const SAVE_DELAY = 700;
const MAX_MODULES = 12;
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
}: StudyCanvasProps) {
  const [entries, setEntries] = useState<Record<string, BoardEntry>>(() => ({
    [snapshot.map.id]: adopt(snapshot),
  }));
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const timers = useRef(new Map<string, number>());
  const inflight = useRef(new Set<string>());
  const [others, setOthers] = useState<Record<string, StudyMapSnapshot>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const update = useCallback(
    (mapId: string, change: (entry: BoardEntry) => BoardEntry) => {
      setEntries((current) => {
        const entry = current[mapId];
        if (!entry) return current;
        const next = { ...current, [mapId]: change(entry) };
        entriesRef.current = next;
        return next;
      });
    },
    [],
  );

  // a refreshed snapshot replaces the board only when nothing local is waiting to be saved
  const receive = useCallback((incoming: StudyMapSnapshot) => {
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
  }, []);

  useEffect(() => {
    receive(snapshot);
    clearNoteCache();
  }, [receive, snapshot]);

  const save = useCallback(
    async (mapId: string) => {
      const entry = entriesRef.current[mapId];
      if (!entry || entry.status === "conflict" || inflight.current.has(mapId))
        return;
      inflight.current.add(mapId);
      const submitted = entry.board;
      update(mapId, (current) => ({
        ...current,
        status: "saving",
        message: null,
      }));
      try {
        const result = versionSchema.parse(
          await requestJson(`/api/study-maps/${mapId}/board`, {
            method: "PUT",
            body: JSON.stringify({ version: entry.version, board: submitted }),
          }),
        );
        inflight.current.delete(mapId);
        const changed = entriesRef.current[mapId]?.board !== submitted;
        update(mapId, (current) => ({
          ...current,
          version: result.version,
          status: changed ? "pending" : "saved",
        }));
        if (changed) void save(mapId);
      } catch (error) {
        inflight.current.delete(mapId);
        update(mapId, (current) => ({
          ...current,
          status:
            error instanceof RequestError && error.status === 409
              ? "conflict"
              : "error",
          message: messageFor(error),
        }));
      }
    },
    [update],
  );

  const change = useCallback(
    (mapId: string, board: StudyBoard) => {
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
    },
    [save, update],
  );

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

  const resolve = useCallback(
    async (mapId: string, keepMine: boolean) => {
      try {
        const incoming = snapshotSchema.parse(
          await requestJson(`/api/study-maps/${mapId}`),
        );
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
      } catch (error) {
        update(mapId, (entry) => ({ ...entry, message: messageFor(error) }));
      }
    },
    [save, snapshot.map.id, update],
  );

  const otherIds = useMemo(
    () =>
      maps
        .filter((map) => map.id !== snapshot.map.id)
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, MAX_MODULES - 1)
        .map((map) => map.id),
    [maps, snapshot.map.id],
  );
  const otherKey = otherIds.join(",");

  useEffect(() => {
    if (scope !== "all" || !otherKey) return;
    const controller = new AbortController();
    const ids = otherKey.split(",");
    setLoading(true);
    setLoadError(null);
    let failures = 0;
    void (async () => {
      // a few at a time keeps a large library from flooding the API
      for (let index = 0; index < ids.length; index += 3) {
        const batch = await Promise.allSettled(
          ids
            .slice(index, index + 3)
            .map(async (id) =>
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
            failures++;
            continue;
          }
          setOthers((current) => ({
            ...current,
            [result.value.map.id]: result.value,
          }));
          receive(result.value);
        }
      }
      setLoading(false);
      if (failures)
        setLoadError(
          `${failures} ${failures === 1 ? "module" : "modules"} could not be loaded. The rest are shown.`,
        );
    })();
    return () => controller.abort();
  }, [otherKey, receive, scope]);

  const modules = useMemo<FlowModule[]>(() => {
    const snapshots = [
      snapshot,
      ...(scope === "all"
        ? otherIds
            .map((id) => others[id])
            .filter((entry): entry is StudyMapSnapshot => Boolean(entry))
        : []),
    ];
    return snapshots.map((entry) => ({
      snapshot: entry,
      board: entries[entry.map.id]?.board ?? entry.map.board,
    }));
  }, [entries, otherIds, others, scope, snapshot]);

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

  const toolbar = (
    <>
      <div
        role="group"
        aria-label="Map scope"
        className="flex rounded-radius-md border border-border-subtle p-0.5"
      >
        {(["module", "all"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={scope === value}
            className={`min-h-8 rounded-[5px] px-2.5 text-xs font-medium ${scope === value ? "bg-primary-600 text-text-on-primary" : "text-text-secondary hover:text-text"}`}
            onClick={() => onScopeChange(value)}
          >
            {value === "module"
              ? "This module"
              : `All modules${maps.length > 1 ? ` (${Math.min(maps.length, MAX_MODULES)})` : ""}`}
          </button>
        ))}
      </div>
      <span role="status" className="text-xs text-text-tertiary">
        {conflict
          ? "Layout changed elsewhere"
          : failed
            ? "Layout not saved"
            : saving
              ? "Saving layout…"
              : loading
                ? "Loading modules…"
                : "Layout saved"}
      </span>
      {actions}
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-radius-xl border border-border-subtle bg-surface">
      {conflict && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 border-b border-border-subtle bg-ai-500/10 px-3 py-2 text-sm"
        >
          <span>
            The {conflict.module.snapshot.map.name} layout changed in another
            tab or device.
          </span>
          <button
            type="button"
            className={secondarySmall}
            onClick={() => void resolve(conflict.module.snapshot.map.id, false)}
          >
            Use the latest
          </button>
          <button
            type="button"
            className={secondarySmall}
            onClick={() => void resolve(conflict.module.snapshot.map.id, true)}
          >
            Keep mine
          </button>
        </div>
      )}
      {failed && !conflict && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 border-b border-border-subtle bg-error-500/10 px-3 py-2 text-sm"
        >
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
        </div>
      )}
      {scope === "all" && (loadError || hiddenCount > 0) && (
        <p
          role="status"
          className="border-b border-border-subtle px-3 py-1.5 text-xs text-text-secondary"
        >
          {loadError ?? ""}
          {hiddenCount > 0
            ? ` Showing ${MAX_MODULES} modules; open another from the module list.`
            : ""}
        </p>
      )}
      <div className="min-h-0 flex-1">
        <StudyFlow
          modules={modules}
          viewKey={scope === "all" ? "all" : snapshot.map.id}
          toolbar={toolbar}
          onBoardChange={change}
          onReview={onReview}
          onOpenModule={onOpenModule}
          onShowAllModules={
            scope === "module" && maps.length > 1
              ? () => onScopeChange("all")
              : undefined
          }
        />
      </div>
    </div>
  );
}
