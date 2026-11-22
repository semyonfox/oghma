import { XMarkIcon } from "@heroicons/react/24/outline";
import type { StudyAssignment } from "@/lib/study-map/types";
import type { Model, Placed } from "./study-flow-model";
import {
  ItemActions,
  ItemBody,
  ItemHeader,
  ItemRelations,
  secondarySmall,
} from "./study-flow-panels";

interface FlowReaderProps {
  readerPlaced: Placed;
  model: Model;
  lookup: (ref: string) => Placed | undefined;
  setReader: (ref: string | null) => void;
  setAssignmentOpen: (assignment: StudyAssignment) => void;
  onReview: (mapId: string, noteId: string) => void;
  goTo: (ref: string, open?: boolean) => void;
  follow: (topicId: string) => void;
}

/** the side panel that reads one note in full */
export function FlowReader({
  readerPlaced,
  model,
  lookup,
  setReader,
  setAssignmentOpen,
  onReview,
  goTo,
  follow,
}: FlowReaderProps) {
  return (
    <aside
      aria-label={`Reading ${readerPlaced.item.title}`}
      className="flex w-full max-w-[460px] shrink-0 flex-col border-l border-border-subtle bg-surface-overlay max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-50 max-lg:shadow-float"
    >
      <div className="flex items-start gap-2 border-b border-border-subtle px-4 py-3">
        <div className="min-w-0 flex-1">
          <ItemHeader placed={readerPlaced} />
        </div>
        <button
          type="button"
          className="rounded-radius-md p-1.5 text-text-tertiary hover:bg-subtle hover:text-text"
          onClick={() => setReader(null)}
          aria-label="Close reader"
        >
          <XMarkIcon className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <ItemActions
          item={readerPlaced.item}
          onReview={() =>
            onReview(readerPlaced.item.mapId, readerPlaced.item.id)
          }
          onAssignment={() =>
            readerPlaced.item.assignment &&
            setAssignmentOpen(readerPlaced.item.assignment)
          }
        >
          <button
            type="button"
            className={secondarySmall}
            onClick={() => goTo(readerPlaced.item.ref)}
          >
            Show on map
          </button>
        </ItemActions>
        <div className="mt-3">
          <ItemBody item={readerPlaced.item} full />
        </div>
        <div className="mt-3 border-t border-border-subtle pt-1">
          <ItemRelations
            placed={readerPlaced}
            topics={model.topics}
            links={model.links}
            lookup={lookup}
            sources={model.sources.get(readerPlaced.item.ref) ?? []}
            usedBy={model.usedBy.get(readerPlaced.item.ref) ?? []}
            onGo={(ref) => {
              setReader(ref.startsWith("note:") ? ref : null);
              goTo(ref, !ref.startsWith("note:"));
            }}
            onFollow={follow}
          />
        </div>
      </div>
    </aside>
  );
}
