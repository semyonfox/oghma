import type { CSSProperties } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import type { StudyAssignment, StudyBoard } from "@/lib/study-map/types";
import {
  LINK_LABELS,
  toolbarButton,
  type Model,
  type Placed,
} from "./study-flow-model";
import {
  ItemActions,
  ItemBody,
  ItemHeader,
  ItemRelations,
  primarySmall,
  secondarySmall,
} from "./study-flow-panels";

export interface PendingLink {
  from: string;
  to: string | null;
  label: string;
}

interface FlowConnectDialogProps {
  connect: PendingLink;
  setConnect: (connect: PendingLink | null) => void;
  model: Model;
  saveLink: () => void;
}

/** picks the target card, then names the link */
export function FlowConnectDialog({
  connect,
  setConnect,
  model,
  saveLink,
}: FlowConnectDialogProps) {
  return (
    <div
      data-flow-overlay
      className="absolute left-1/2 top-16 z-40 w-[min(440px,calc(100%-1.5rem))] -translate-x-1/2 rounded-radius-xl border border-border-subtle bg-surface-overlay p-3 text-sm shadow-float"
    >
      {!connect.to ? (
        <div className="flex items-center gap-2">
          <p className="text-text-secondary">
            Choose the card to link{" "}
            <b className="text-text">
              {model.byRef.get(connect.from)?.item.title}
            </b>{" "}
            to.
          </p>
          <button
            type="button"
            className={`${secondarySmall} ml-auto`}
            onClick={() => setConnect(null)}
          >
            Cancel
          </button>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            saveLink();
          }}
        >
          <p className="text-text-secondary">
            <b className="text-text">
              {model.byRef.get(connect.from)?.item.title}
            </b>{" "}
            →{" "}
            <b className="text-text">
              {model.byRef.get(connect.to)?.item.title}
            </b>
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {LINK_LABELS.map((label) => (
              <button
                key={label}
                type="button"
                className={`rounded-full border px-2 py-0.5 text-xs ${connect.label === label ? "border-accent bg-accent-soft text-accent-soft-text" : "border-border-subtle text-text-secondary"}`}
                onClick={() => setConnect({ ...connect, label })}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="mt-2 block text-xs text-text-tertiary">
            Relationship
            <input
              autoFocus
              maxLength={80}
              value={connect.label}
              onChange={(event) =>
                setConnect({ ...connect, label: event.target.value })
              }
              className="mt-1 min-h-9 w-full rounded-radius-md border border-border-subtle bg-background px-2 text-base text-text md:text-sm"
            />
          </label>
          <div className="mt-2 flex justify-end gap-1.5">
            <button
              type="button"
              className={secondarySmall}
              onClick={() => setConnect(null)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={primarySmall}
              disabled={!connect.label.trim()}
            >
              Save link
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

interface FlowPreviewProps {
  previewPlaced: Placed;
  previewStyle: CSSProperties;
  pinned: boolean;
  previewPin: StudyBoard["placements"][number] | undefined;
  deckMode: boolean;
  showLinks: boolean;
  model: Model;
  lookup: (ref: string) => Placed | undefined;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  closePreview: () => void;
  goTo: (ref: string, open?: boolean) => void;
  follow: (topicId: string) => void;
  openReader: (ref: string) => void;
  onReview: (mapId: string, noteId: string) => void;
  setAssignmentOpen: (assignment: StudyAssignment) => void;
  startLink: (ref: string) => void;
  togglePin: (ref: string) => void;
  resetPosition: (ref: string) => void;
  setWeek: (ref: string, value: string) => void;
  weekOptions: (placed: Placed) => number[];
  splitOut: (ref: string, copyRef: string) => void;
}

/** the hover card, which pins into a toolbar of board edits */
export function FlowPreview({
  previewPlaced,
  previewStyle,
  pinned,
  previewPin,
  deckMode,
  showLinks,
  model,
  lookup,
  onPointerEnter,
  onPointerLeave,
  closePreview,
  goTo,
  follow,
  openReader,
  onReview,
  setAssignmentOpen,
  startLink,
  togglePin,
  resetPosition,
  setWeek,
  weekOptions,
  splitOut,
}: FlowPreviewProps) {
  return (
    <div
      data-flow-overlay
      role="dialog"
      aria-label={`Preview of ${previewPlaced.item.title}`}
      className="study-glass study-glass-blur absolute z-40 overflow-y-auto rounded-[18px] p-4"
      style={previewStyle}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <ItemHeader placed={previewPlaced} />
        </div>
        {pinned && (
          <button
            type="button"
            className="rounded-radius-md p-1 text-text-tertiary hover:text-text"
            onClick={closePreview}
            aria-label="Close preview"
          >
            <XMarkIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {/* decks stay quick to scan: the file itself only shows up zoomed in */}
      {!deckMode && (
        <div className="mt-2">
          <ItemBody item={previewPlaced.item} full={false} />
        </div>
      )}
      <ItemRelations
        placed={previewPlaced}
        topics={model.topics}
        links={showLinks ? model.links : []}
        lookup={lookup}
        sources={model.sources.get(previewPlaced.item.ref) ?? []}
        usedBy={model.usedBy.get(previewPlaced.item.ref) ?? []}
        onGo={(ref) => goTo(ref, true)}
        onFollow={follow}
      />
      <ItemActions
        item={previewPlaced.item}
        onRead={() => openReader(previewPlaced.item.ref)}
        onReview={() => {
          closePreview();
          onReview(previewPlaced.item.mapId, previewPlaced.item.id);
        }}
        onAssignment={() =>
          previewPlaced.item.assignment &&
          setAssignmentOpen(previewPlaced.item.assignment)
        }
      />
      {pinned && (
        <div
          role="toolbar"
          aria-label={`Actions for ${previewPlaced.item.title}`}
          className="mt-2 flex flex-wrap items-center gap-1 text-xs"
        >
          <button
            type="button"
            className={toolbarButton}
            onClick={() => startLink(previewPlaced.item.ref)}
          >
            Link to…
          </button>
          {!previewPlaced.item.assignment && (
            <Link
              className={toolbarButton}
              href={`/chat?noteId=${previewPlaced.item.id}&noteTitle=${encodeURIComponent(previewPlaced.item.title || "Untitled")}`}
            >
              Chat
            </Link>
          )}
          <button
            type="button"
            className={toolbarButton}
            aria-pressed={Boolean(previewPin?.pinned)}
            onClick={() => togglePin(previewPlaced.item.ref)}
          >
            {previewPin?.pinned ? "Unpin" : "Pin"}
          </button>
          {previewPin && !previewPin.pinned && (
            <button
              type="button"
              className={toolbarButton}
              onClick={() => resetPosition(previewPlaced.item.ref)}
            >
              Reset
            </button>
          )}
          <label className="flex items-center gap-1 px-1 text-text-secondary">
            <span className="sr-only">Week</span>
            <select
              className="min-h-7 rounded-radius-md border border-border-subtle bg-surface px-1 text-xs text-text"
              value={
                previewPlaced.item.weekSource === "set"
                  ? String(previewPlaced.item.week ?? 0)
                  : "detected"
              }
              onChange={(event) =>
                setWeek(previewPlaced.item.ref, event.target.value)
              }
              title="Teaching week"
            >
              <option value="detected">
                {previewPlaced.item.weekSource === "set"
                  ? "Use detected week"
                  : `Detected: ${previewPlaced.item.week === null ? "no week" : `week ${previewPlaced.item.week}`}`}
              </option>
              <option value="0">No week</option>
              {weekOptions(previewPlaced).map((week) => (
                <option key={week} value={String(week)}>
                  Week {week}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {previewPlaced.item.copies?.length ? (
        <div className="mt-3 border-t border-[var(--study-glass-edge)] pt-2 text-xs text-text-secondary">
          <p>Also here, same file:</p>
          <ul className="mt-1 space-y-1">
            {previewPlaced.item.copies.map((copy) => (
              <li
                key={copy.noteId}
                className="flex min-w-0 items-center gap-2"
              >
                <span className="min-w-0 flex-1 truncate">
                  {copy.title}
                </span>
                <button
                  type="button"
                  className="shrink-0 text-accent hover:underline"
                  onClick={() =>
                    splitOut(
                      previewPlaced.item.ref,
                      `note:${copy.noteId}`,
                    )
                  }
                >
                  Split out
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
