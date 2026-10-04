"use client";

import dynamic from "next/dynamic";
import type { StudyBoard, StudyMapSnapshot } from "@/lib/study-map/types";

export interface StudyCanvasProps {
  snapshot: StudyMapSnapshot;
  selected: { kind: "note" | "topic"; id: string } | null;
  onSelect: (selection: StudyCanvasProps["selected"]) => void;
  onBoardChange: (board: StudyBoard) => void;
  onBoardError: (message: string | null) => void;
}

const DrawingBoard = dynamic<StudyCanvasProps>(
  async () => {
    Object.assign(window, { EXCALIDRAW_ASSET_PATH: "/study-board-assets/" });
    return import("./study-drawing-board");
  },
  {
    ssr: false,
    loading: () => (
      <div
        role="status"
        className="flex min-h-80 flex-1 items-center justify-center rounded-radius-xl border border-border-subtle bg-surface text-sm text-text-secondary"
      >
        Opening your board...
      </div>
    ),
  },
);

export default function StudyCanvas(props: StudyCanvasProps) {
  return <DrawingBoard {...props} />;
}
