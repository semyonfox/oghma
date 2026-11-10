"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  addDaysToDateKey,
  parseLocalDateKey,
} from "@/lib/notes/utils/calendar-date";

const SIDE = 10;

interface DayStripProps {
  selectedDate: string;
  today: string;
  onSelect: (dateKey: string) => void;
  weekdayFormatter: Intl.DateTimeFormat;
  fullDateFormatter: Intl.DateTimeFormat;
  label: string;
}

// a strip of days centred on the selected one. dragging sideways steps a day
// per column, the same feel as the fox focus day strip
export default function DayStrip({
  selectedDate,
  today,
  onSelect,
  weekdayFormatter,
  fullDateFormatter,
  label,
}: DayStripProps) {
  const strip = useRef<HTMLDivElement>(null);
  const selectedButton = useRef<HTMLButtonElement>(null);
  const [motion, setMotion] = useState({ offset: 0, dragging: false });
  const gesture = useRef<{
    pointerId: number;
    x: number;
    y: number;
    date: string;
    step: number;
    steps: number;
    dragged: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const days = Array.from({ length: SIDE * 2 + 1 }, (_, index) =>
    addDaysToDateKey(selectedDate, index - SIDE),
  );

  useLayoutEffect(() => {
    if (strip.current?.contains(document.activeElement)) {
      selectedButton.current?.focus({ preventScroll: true });
    }
  }, [selectedDate]);

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (!current.dragged) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 6) return;
      // a vertical move belongs to the page scroll
      if (Math.abs(dy) > Math.abs(dx)) {
        gesture.current = null;
        return;
      }
      current.dragged = true;
      suppressClick.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const steps = -Math.round(dx / current.step);
    if (steps !== current.steps) {
      current.steps = steps;
      onSelect(addDaysToDateKey(current.date, steps));
    }
    setMotion({ offset: dx + steps * current.step, dragging: true });
  };

  const finish = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = null;
    setMotion({ offset: 0, dragging: false });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      ref={strip}
      role="group"
      aria-label={label}
      data-swipe-ignore
      className="relative h-14 touch-pan-y select-none overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_14%,#000_86%,transparent)]"
      onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0 || gesture.current) return;
        const step = strip.current
          ? strip.current.getBoundingClientRect().width / 7
          : 0;
        if (!step) return;
        suppressClick.current = false;
        gesture.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          date: selectedDate,
          step,
          steps: 0,
          dragged: false,
        };
      }}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={finish}
      onClickCapture={(event) => {
        if (!suppressClick.current) return;
        suppressClick.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
      onKeyDown={(event) => {
        const direction =
          event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (!direction) return;
        event.preventDefault();
        onSelect(addDaysToDateKey(selectedDate, direction));
      }}
    >
      {days.map((dateKey, index) => {
        const date = parseLocalDateKey(dateKey);
        if (!date) return null;
        const selected = dateKey === selectedDate;
        const isToday = dateKey === today;
        return (
          <button
            key={dateKey}
            ref={selected ? selectedButton : undefined}
            type="button"
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(dateKey)}
            aria-pressed={selected}
            aria-current={isToday ? "date" : undefined}
            aria-label={fullDateFormatter.format(date)}
            style={{
              transform: `translateX(calc(${index - SIDE} * 100% - 50% + ${motion.offset}px))`,
            }}
            className={`absolute inset-y-0 left-1/2 flex w-[calc(100%/7)] flex-col items-center justify-center gap-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50 ${motion.dragging ? "" : "transition-transform duration-[260ms] ease-[cubic-bezier(0.2,0.7,0.2,1)] motion-reduce:transition-none"} ${selected ? "text-text" : "text-text-tertiary"}`}
          >
            <span className="text-[10px] font-medium uppercase">
              {weekdayFormatter.format(date)}
            </span>
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold tabular-nums transition-colors ${
                selected
                  ? "bg-text text-background"
                  : isToday
                    ? "bg-accent text-on-action"
                    : ""
              }`}
            >
              {date.getDate()}
            </span>
          </button>
        );
      })}
    </div>
  );
}
