"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import useI18n from "@/lib/notes/hooks/use-i18n";
import {
  TOPIC_CUTOUT_PX,
  TOPIC_DOT_PX,
  topicDotGap,
  topicMarkColour,
  visibleTopicMarks,
} from "@/lib/notes/tree-topics";
import type { TopicMark } from "@/lib/notes/types/note";

/** one topic mark in its map colour: filled when confirmed, a hollow ring while waiting for review */
export function TopicDot({
  mark,
  className = "h-1.5 w-1.5",
  style,
}: {
  mark: TopicMark;
  className?: string;
  style?: CSSProperties;
}) {
  const colour = topicMarkColour(mark);
  return (
    <span
      className={`inline-block shrink-0 rounded-full ${className}`}
      style={{ ...style, ...(mark.suggested ? { border: `1.5px solid ${colour}` } : { backgroundColor: colour }) }}
      aria-hidden="true"
    />
  );
}

function useTopicLabel(marks: readonly TopicMark[]): string {
  const { t } = useI18n();
  return `${t("Topics")}: ${marks
    .map((mark) => (mark.suggested ? `${mark.name} (${t("suggested")})` : mark.name))
    .join(", ")}`;
}

// long enough that moving down the tree doesn't flash a tooltip on every row
const TOOLTIP_DELAY_MS = 500;
const TOOLTIP_NAMES = 2;

/** a one-line hover summary: two topic names, then a count. portalled so the scrolling tree can't clip it */
function TopicTooltip({ marks, children }: { marks: readonly TopicMark[]; children: ReactNode }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancel, []);
  const shown = marks.slice(0, TOOLTIP_NAMES);
  const extra = marks.length - shown.length;
  return (
    <span
      className="inline-flex items-center"
      onMouseEnter={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        cancel();
        timer.current = setTimeout(() => setAnchor(rect), TOOLTIP_DELAY_MS);
      }}
      onMouseLeave={() => {
        cancel();
        setAnchor(null);
      }}
    >
      {children}
      {anchor &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[10001] flex max-w-72 items-center gap-2 whitespace-nowrap rounded-radius-md border border-border-subtle bg-surface px-2 py-1 text-xs text-text-secondary shadow-lg"
            style={{
              top: anchor.bottom + 6,
              left: Math.max(8, Math.min(anchor.left, window.innerWidth - 296)),
            }}
          >
            {shown.map((mark) => (
              <span key={`${mark.mapId}:${mark.topicId}`} className="flex min-w-0 items-center gap-1">
                <TopicDot mark={mark} />
                <span className={`truncate ${mark.main && !mark.suggested ? "font-medium text-text" : ""}`}>
                  {mark.name}
                </span>
              </span>
            ))}
            {extra > 0 && <span className="tabular-nums text-text-tertiary">+{extra}</span>}
          </div>,
          document.body,
        )}
    </span>
  );
}

/**
 * The mask punches the next dot, plus a thin ring, out of this one. Whatever
 * is behind the row shows through, so the cut-out matches the default, hover,
 * selected and drag states in both themes, and a hollow suggestion on top
 * reads as a ring rather than sitting on a filled dot.
 */
function cutOutNext(gap: number): CSSProperties {
  const centre = TOPIC_DOT_PX * 1.5 + gap;
  const radius = TOPIC_DOT_PX / 2 + TOPIC_CUTOUT_PX;
  const mask = `radial-gradient(circle at ${centre}px 50%, transparent ${radius}px, #000 ${radius + 0.5}px)`;
  return { maskImage: mask, WebkitMaskImage: mask };
}

/** R1 with D1: main first, then confirmed, then suggestions on top. five at most in a fixed slot, then a count */
export function TopicDots({ marks }: { marks: readonly TopicMark[] }) {
  const label = useTopicLabel(marks);
  if (marks.length === 0) return null;
  const shown = visibleTopicMarks(marks);
  const extra = marks.length - shown.length;
  const gap = topicDotGap(shown.length);
  return (
    <TopicTooltip marks={marks}>
      <span role="img" aria-label={label} className="ml-1 flex shrink-0 items-center">
        <span className="flex w-[27px] shrink-0 items-center justify-end">
          {shown.map((mark, index) => (
            <TopicDot
              key={`${mark.mapId}:${mark.topicId}`}
              mark={mark}
              className="h-[7px] w-[7px]"
              style={{
                marginLeft: index === 0 ? 0 : gap,
                ...(gap < 0 && index < shown.length - 1 ? cutOutNext(gap) : {}),
              }}
            />
          ))}
        </span>
        {/* kept even when empty so the dots line up down the tree */}
        <span className="ml-[3px] min-w-3.5 text-[10px] leading-none tabular-nums text-text-tertiary">
          {extra > 0 ? `+${extra}` : null}
        </span>
      </span>
    </TopicTooltip>
  );
}

/** R5: one quiet badge on the file icon in the main topic's colour, hollow while anything waits for review */
export function TopicBadge({ marks, children }: { marks: readonly TopicMark[]; children: ReactNode }) {
  const label = useTopicLabel(marks);
  if (marks.length === 0) return <>{children}</>;
  const pending = marks.find((mark) => mark.suggested);
  return (
    <TopicTooltip marks={marks}>
      <span className="relative inline-flex">
        {children}
        <span role="img" aria-label={label} className="absolute -bottom-0.5 right-1 flex">
          <TopicDot
            mark={pending ?? marks[0]}
            className="h-[7px] w-[7px] ring-2 ring-background"
          />
        </span>
      </span>
    </TopicTooltip>
  );
}
