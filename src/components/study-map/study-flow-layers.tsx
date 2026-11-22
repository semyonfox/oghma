import { Fragment, type CSSProperties } from "react";

import {
  FAN_CARD_HEIGHT,
  FAN_CARD_WIDTH,
  FAN_MAX_CARDS,
  fanPositions,
  type Deck,
} from "@/lib/study-map/decks";

import { CARD_WIDTH, CLUSTER_HEADER } from "@/lib/study-map/flow";

import { StudyFlowCard, cardLabel, readableExcerpt } from "./study-board-card";

import { type ColouredTopic } from "./study-flow-panels";

import {
  type Rect,
  type Unfold,
  type Placed,
  type Table,
  lerp,
  smooth,
} from "./study-flow-model";

export interface CardLayerProps {
  placed: Placed[];
  compact: boolean;
  state: Map<string, string>;
  stops: Map<string, number>;
  focusColour: string | null;
}

export function CardLayer({
  placed,
  compact,
  state,
  stops,
  focusColour,
}: CardLayerProps) {
  return (
    <>
      {placed.map(({ item, module, x, y }) => {
        const flags = state.get(item.ref) ?? "";
        const pinned = module.board.placements.some(
          (placement) => placement.id === item.ref && placement.pinned,
        );
        const stop = stops.get(item.ref);
        return (
          <article
            key={item.ref}
            data-card={item.ref}
            tabIndex={0}
            data-week={item.week ?? "none"}
            aria-label={`${item.title || "Untitled"}, ${item.week === null ? "no week" : `week ${item.week}`}, ${module.name}`}
            className={`absolute rounded-radius-lg outline-offset-2 transition-[opacity,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline focus-visible:outline-accent ${flags.includes("selected") ? "outline outline-[1.5px] outline-accent" : ""} ${flags.includes("related") ? "ring-1 ring-accent/40" : ""} ${flags.includes("dim") ? "opacity-15" : ""} ${flags.includes("supporting") ? "opacity-60" : ""} ${flags.includes("flash") ? "animate-pulse" : ""}`}
            style={{
              left: x,
              top: y,
              width: CARD_WIDTH,
              height: item.height,
              cursor: pinned ? "default" : "grab",
            }}
          >
            <StudyFlowCard
              item={item}
              compact={compact}
              pinned={pinned}
            />
            {stop !== undefined && (
              <span
                className="absolute -left-2.5 -top-2.5 grid h-5 w-5 place-items-center rounded-full text-[11px] font-semibold text-background"
                style={{
                  background: focusColour ?? "var(--color-accent)",
                }}
              >
                {stop + 1}
              </span>
            )}
          </article>
        );
      })}
    </>
  );
}

export interface DeckLayerProps {
  table: Table;
  topics: Map<string, ColouredTopic>;
  visibleRefs: (deck: Deck) => string[];
  byRef: Map<string, Placed>;
  openKey: string | null;
  selected: string | null;
  lit: Set<string>;
  query: string;
  matches: (ref: string) => boolean;
  lines: Array<{ key: string; d: string; x: number; y: number; label: string }>;
  unfold: Unfold | null;
  /** the fan card under the pointer or keyboard focus */
  hot: string | null;
  /** arrived by unfolding, so the layer is already in place and skips the fade */
  seam: boolean;
}

/** the far view: every topic is one deck, sized by the exam and thicker with more files */
export function DeckLayer({
  table,
  topics,
  visibleRefs,
  byRef,
  openKey,
  selected,
  lit,
  query,
  matches,
  lines,
  unfold,
  hot,
  seam,
}: DeckLayerProps) {
  const u = unfold?.u ?? 0;
  const opened = table.modules.flatMap((entry) =>
    entry.table.decks
      .filter((deck) => deck.id === openKey)
      .map((deck) => ({ deck, originY: entry.originY })),
  )[0];
  const openRefs = opened ? visibleRefs(opened.deck) : [];
  const shownRefs = openRefs.slice(0, FAN_MAX_CARDS);
  const more = openRefs.length - shownRefs.length;
  const slots = opened
    ? fanPositions(
        { x: opened.deck.x, y: opened.originY + opened.deck.y },
        shownRefs.length + (more > 0 ? 1 : 0),
        table.width,
      )
    : [];
  const fanColour = opened?.deck.cluster.topic
    ? topics.get(opened.deck.cluster.topic.id)?.colour
    : undefined;
  // the hovered card straightens, lifts and grows. the rest of its row leans away and dims
  const hotIndex = hot ? shownRefs.indexOf(hot) : -1;
  const lift = (index: number): CSSProperties => {
    const slot = slots[index];
    const base = { "--rot": `${slot.rotate}deg` } as CSSProperties;
    if (hotIndex < 0) return base;
    const gap = index - hotIndex;
    if (gap === 0)
      return { ...base, "--ty": "-68px", "--s": 1.13, "--dr": `${-slot.rotate}deg` } as CSSProperties;
    if (Math.abs(slot.y - slots[hotIndex].y) > FAN_CARD_HEIGHT / 2) return base;
    const near = Math.abs(gap) === 1;
    return {
      ...base,
      "--tx": `${Math.sign(gap) * (near ? 62 : 28)}px`,
      "--dr": `${Math.sign(gap) * (near ? 1.6 : 0.6)}deg`,
    } as CSSProperties;
  };
  const fanState = (index: number) =>
    hotIndex < 0 ? "" : index === hotIndex ? "study-fan-card-hot" : "study-fan-card-dim";
  return (
    <div className={seam ? undefined : "study-layer-in"}>
      {table.modules.flatMap(({ module, table: moduleTable, originY }) =>
        moduleTable.decks.map((deck) => {
          const topic = deck.cluster.topic
            ? topics.get(deck.cluster.topic.id)
            : undefined;
          const refs = visibleRefs(deck);
          const name = topic?.name ?? "Not sorted yet";
          const quiet =
            (openKey !== null && !lit.has(deck.id)) ||
            (query.length > 0 &&
              !name.toLocaleLowerCase().includes(query) &&
              !refs.some(matches));
          const exam =
            deck.share !== null
              ? `${Math.round(deck.share * 100)}%`
              : module.examMarks.size > 0 && topic
                ? "no exam data"
                : null;
          // while unfolding, a deck grows from its table spot into its cluster's frame
          const from: Rect = {
            x: deck.x,
            y: originY + deck.y,
            w: deck.width,
            h: deck.height,
          };
          const to: Rect = unfold
            ? {
                x: deck.cluster.x + unfold.off.x,
                y: module.originY + deck.cluster.y + unfold.off.y,
                w: deck.cluster.width,
                h: deck.cluster.height,
              }
            : from;
          const textOpacity = 1 - smooth(0.1, 0.5, unfold?.key === deck.id ? u : 0);
          const ghosts =
            u > 0
              ? refs.flatMap((ref) => {
                  const placed = byRef.get(ref);
                  return placed &&
                    module.layout.primary.get(ref) === deck.key
                    ? [placed]
                    : [];
                })
              : [];
          // the pointed deck morphs into its cluster. the others are laid out differently, so they cross-fade in place
          const morph = unfold?.key === deck.id;
          const at = morph ? u : 0;
          const fade = unfold && !morph ? 1 - smooth(0, 0.5, u) : 1;
          const frame = u > 0 && (
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute ${morph ? "inset-0" : "study-glass rounded-[20px]"}`}
              style={
                morph
                  ? { opacity: smooth(0.3, 1, u) }
                  : {
                      left: to.x,
                      top: to.y,
                      width: to.w,
                      height: to.h,
                      opacity: smooth(0.2, 0.75, u) * (quiet ? 0.2 : 1),
                      "--deck-colour": topic?.colour ?? "var(--color-text-tertiary)",
                    } as CSSProperties
              }
            >
              <div
                className="flex flex-col justify-center px-4"
                style={{ height: CLUSTER_HEADER - 4, opacity: morph ? smooth(0.5, 1, u) : 1 }}
              >
                <span className="flex min-w-0 items-center gap-2 text-[24px] font-semibold leading-tight text-text">
                  <span
                    className="shrink-0 rounded-full"
                    style={{ width: 8, height: 8, background: "var(--deck-colour)" }}
                  />
                  <span className="truncate">{name}</span>
                </span>
                <span className="truncate text-[16px] text-text-tertiary">
                  {ghosts.length} {ghosts.length === 1 ? "card" : "cards"}
                </span>
              </div>
              {ghosts.map((placed) => (
                <i
                  key={placed.item.ref}
                  className="study-deck-ghost"
                  style={{
                    left: `${((placed.x - deck.cluster.x) / deck.cluster.width) * 100}%`,
                    top: `${((placed.y - module.originY - deck.cluster.y) / deck.cluster.height) * 100}%`,
                    width: `${(CARD_WIDTH / deck.cluster.width) * 100}%`,
                    height: `${(placed.item.height / deck.cluster.height) * 100}%`,
                  }}
                />
              ))}
            </div>
          );
          return (
            <Fragment key={deck.id}>
            <div
              role="button"
              tabIndex={0}
              data-deck={deck.id}
              aria-expanded={openKey === deck.id}
              aria-label={`${name}, ${refs.length} ${refs.length === 1 ? "file" : "files"}${deck.share !== null ? `, ${Math.round(deck.share * 100)}% of exam marks` : ""}`}
              className={`study-deck study-deck-${deck.tier} absolute cursor-pointer outline-offset-8 focus-visible:outline-8 focus-visible:outline focus-visible:outline-accent ${unfold ? (morph ? "z-[1]" : "") : "transition-opacity duration-200"} ${quiet && !unfold ? "opacity-20" : ""}`}
              style={
                {
                  left: lerp(from.x, to.x, at),
                  top: lerp(from.y, to.y, at),
                  width: lerp(from.w, to.w, at),
                  height: lerp(from.h, to.h, at),
                  opacity: unfold ? fade * (quiet ? 0.2 : 1) : undefined,
                  transform: fade < 1 ? `scale(${0.94 + 0.06 * fade})` : undefined,
                  "--deck-colour": topic?.colour ?? "var(--color-text-tertiary)",
                  "--deck-fill": 1 - smooth(0.4, 1, at),
                } as CSSProperties
              }
            >
              {deck.layers >= 2 && (
                <i
                  className="study-deck-under study-deck-under-2"
                  style={at > 0 ? { opacity: 0.6 * (1 - smooth(0, 0.4, at)) } : undefined}
                />
              )}
              {deck.layers >= 1 && (
                <i
                  className="study-deck-under study-deck-under-1"
                  style={at > 0 ? { opacity: 1 - smooth(0, 0.4, at) } : undefined}
                />
              )}
              <div
                className="study-deck-face"
                style={
                  at > 0
                    ? { borderRadius: lerp(48, 20, at), borderWidth: lerp(3, 1, at) }
                    : undefined
                }
              >
                <b style={at > 0 ? { opacity: textOpacity } : undefined}>{name}</b>
                <span style={at > 0 ? { opacity: textOpacity } : undefined}>
                  {refs.length} {refs.length === 1 ? "file" : "files"}
                </span>
                {exam && (
                  <em style={at > 0 ? { opacity: textOpacity } : undefined}>
                    {exam}
                    {deck.share !== null && (
                      <span className="sr-only"> of exam marks</span>
                    )}
                  </em>
                )}
              </div>
              {morph && frame}
            </div>
            {!morph && frame}
            </Fragment>
          );
        }),
      )}
      {lines.length > 0 && (
        <svg
          className="pointer-events-none absolute left-0 top-0 z-10 overflow-visible"
          width={1}
          height={1}
          aria-hidden="true"
        >
          {lines.map((line) => (
            <path
              key={line.key}
              d={line.d}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth={7}
              strokeLinecap="round"
            />
          ))}
        </svg>
      )}
      {lines
        .filter((line) => line.label)
        .map((line) => (
          <div
            key={`${line.key}-label`}
            className="absolute z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-background px-5 py-1 font-semibold text-accent"
            style={{ left: line.x, top: line.y, fontSize: 34 }}
          >
            {line.label}
          </div>
        ))}
      {shownRefs.map((ref, index) => {
        const placed = byRef.get(ref);
        if (!placed) return null;
        const slot = slots[index];
        return (
          <div
            key={ref}
            role="button"
            tabIndex={0}
            data-fan={ref}
            aria-pressed={selected === ref}
            aria-label={placed.item.title || "Untitled"}
            className={`study-fan-card absolute cursor-pointer ${index === hotIndex ? "z-30" : "z-20"} ${fanState(index)} ${selected === ref ? "study-fan-card-selected" : ""}`}
            style={{
              ...lift(index),
              "--fan-colour": fanColour ?? "var(--color-accent)",
              left: slot.x,
              top: slot.y,
              width: FAN_CARD_WIDTH,
              height: FAN_CARD_HEIGHT,
            } as CSSProperties}
          >
            <small>{cardLabel(placed.item)}</small>
            <b>{placed.item.title || "Untitled"}</b>
            <p>
              {readableExcerpt(
                (placed.item.material?.excerpt ?? "").replace(
                  /^\s*#\s+[^\n]*\n+/,
                  "",
                ),
              )}
            </p>
          </div>
        );
      })}
      {more > 0 && opened && (
        <div
          role="button"
          tabIndex={0}
          data-deck-all={opened.deck.id}
          className={`study-fan-card study-fan-more absolute z-20 cursor-pointer ${fanState(shownRefs.length)}`}
          style={{
            ...lift(shownRefs.length),
            left: slots[shownRefs.length].x,
            top: slots[shownRefs.length].y,
            width: FAN_CARD_WIDTH,
            height: FAN_CARD_HEIGHT,
          }}
        >
          <b>+{more} more</b>
          <small>Zoom in to see them all</small>
        </div>
      )}
    </div>
  );
}
