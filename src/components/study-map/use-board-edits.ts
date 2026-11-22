import type { FlowLink } from "@/lib/study-map/flow";
import type { StudyBoard } from "@/lib/study-map/types";
import type { Model } from "./study-flow-model";

// every edit goes back to the module's board through onBoardChange, and the
// screen reader hears what changed
export function useBoardEdits(
  model: Model,
  onBoardChange: (mapId: string, board: StudyBoard) => void,
  setAnnouncement: (message: string) => void,
) {
  const moduleOf = (ref: string) => model.byRef.get(ref)?.module;
  const updateBoard = (ref: string, change: (board: StudyBoard) => StudyBoard) => {
    const module = moduleOf(ref);
    if (!module) return;
    onBoardChange(module.mapId, change(module.board));
  };

  const place = (ref: string, x: number, y: number) => {
    updateBoard(ref, (board) => {
      const module = moduleOf(ref)!;
      const existing = board.placements.find(
        (placement) => placement.id === ref,
      );
      const placement = {
        id: ref,
        x: Math.round(x / 8) * 8,
        y: Math.round((y - module.originY) / 8) * 8,
        pinned: existing?.pinned ?? false,
        topicId: null,
      };
      return {
        ...board,
        placements: [
          ...board.placements.filter((entry) => entry.id !== ref),
          placement,
        ],
      };
    });
  };

  const togglePin = (ref: string) => {
    const placed = model.byRef.get(ref);
    if (!placed) return;
    const existing = placed.module.board.placements.find(
      (placement) => placement.id === ref,
    );
    updateBoard(ref, (board) => ({
      ...board,
      placements: [
        ...board.placements.filter((entry) => entry.id !== ref),
        {
          id: ref,
          x: existing?.x ?? placed.x,
          y: existing?.y ?? placed.y - placed.module.originY,
          pinned: !existing?.pinned,
          topicId: null,
        },
      ],
    }));
    setAnnouncement(existing?.pinned ? "Unpinned" : "Pinned in place");
  };

  const resetPosition = (ref: string) => {
    updateBoard(ref, (board) => ({
      ...board,
      placements: board.placements.filter((entry) => entry.id !== ref),
    }));
    setAnnouncement("Back in its topic cluster");
  };

  const setWeek = (ref: string, value: string) => {
    updateBoard(ref, (board) => {
      const weeks = { ...board.weeks };
      if (value === "detected") delete weeks[ref];
      else weeks[ref] = Number(value);
      // a new week reorders its cluster, so an unpinned card goes back into its place there
      return {
        ...board,
        weeks,
        placements: board.placements.filter(
          (entry) => entry.id !== ref || entry.pinned,
        ),
      };
    });
  };

  const splitOut = (ref: string, copyRef: string) => {
    updateBoard(ref, (board) => ({
      ...board,
      unfolded: [...(board.unfolded ?? []), copyRef],
    }));
    setAnnouncement("Split out. It has its own card again.");
  };

  const tidy = () => {
    let moved = 0;
    for (const module of model.modules) {
      const kept = module.board.placements.filter(
        (placement) => placement.pinned,
      );
      moved += module.board.placements.length - kept.length;
      if (kept.length !== module.board.placements.length)
        onBoardChange(module.mapId, { ...module.board, placements: kept });
    }
    setAnnouncement(
      moved
        ? `Tidied ${moved} ${moved === 1 ? "card" : "cards"}. Pinned cards stay put.`
        : "Everything is already in its topic cluster.",
    );
  };

  const addLink = (from: string, to: string, label: string) => {
    updateBoard(from, (board) => ({
      ...board,
      links: [
        ...board.links,
        {
          id: crypto.randomUUID(),
          source: from,
          target: to,
          label: label.trim().slice(0, 80),
        },
      ],
    }));
    setAnnouncement(`Linked: ${label.trim()}`);
  };

  const removeLink = (link: FlowLink) => {
    updateBoard(link.source, (board) => ({
      ...board,
      links: board.links.filter((entry) => entry.id !== link.id),
    }));
    setAnnouncement("Link removed");
  };

  return {
    place,
    togglePin,
    resetPosition,
    setWeek,
    splitOut,
    tidy,
    addLink,
    removeLink,
  };
}
