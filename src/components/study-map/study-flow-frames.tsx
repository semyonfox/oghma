import { CLUSTER_HEADER } from "@/lib/study-map/flow";

import {
  lerp,
  type Model,
  type Table,
  type Unfold,
} from "./study-flow-model";

interface ModulePanelsProps {
  model: Model;
  deckTable: Table;
  deckMode: boolean;
  view: { unfold: Unfold | null };
  unfolded: number;
  compact: boolean;
}

/** one panel per module with its title, which grows with the decks as they unfold */
export function ModulePanels({
  model,
  deckTable,
  deckMode,
  view,
  unfolded,
  compact,
}: ModulePanelsProps) {
  return model.modules.map((module) => {
    const tabled = deckTable.modules.find(
      (entry) => entry.module === module,
    );
    // the module panel unfolds with its decks
    const off = view.unfold?.off ?? { x: 0, y: 0 };
    const panel = deckMode
      ? {
          left: lerp(-24, off.x - 24, unfolded),
          top: lerp(tabled?.originY ?? 0, module.originY + off.y, unfolded),
          width: lerp(deckTable.width, model.width, unfolded) + 48,
          height: lerp(
            tabled?.table.height ?? 0,
            module.layout.height,
            unfolded,
          ),
        }
      : {
          left: -24,
          top: module.originY,
          width: model.width + 48,
          height: module.layout.height,
        };
    return (
    <section
      key={module.mapId}
      aria-label={`${module.name} ${module.year}`}
      className="absolute rounded-[28px] bg-surface/40"
      style={panel}
    >
      <header
        className="absolute left-10 flex items-baseline gap-4 whitespace-nowrap"
        style={{
          top: deckMode ? lerp(30, 32, unfolded) : 32,
          fontSize: deckMode
            ? lerp(72, 44, unfolded)
            : compact
              ? 44
              : 34,
        }}
      >
        <h2 className="font-semibold tracking-tight text-text">
          {module.name}
        </h2>
        <span className="text-[0.45em] text-text-tertiary">
          {module.year} ·{" "}
          {
            module.items.filter((item) => item.kind !== "assignment")
              .length
          }{" "}
          materials
          {module.items.some((item) => item.kind === "assignment")
            ? ` · ${module.items.filter((item) => item.kind === "assignment").length} assignments`
            : ""}
          {module.paperCount
            ? ` · ${module.paperCount} past ${module.paperCount === 1 ? "paper" : "papers"} in Exam history`
            : ""}
        </span>
        {model.modules.length > 1 && (
          <button
            type="button"
            data-open-module={module.mapId}
            className="self-center rounded-radius-md border border-border-subtle bg-surface px-2.5 py-1 text-[0.4em] font-medium text-text-secondary hover:text-text"
          >
            Open module
          </button>
        )}
      </header>
    </section>
    );
  });
}

interface ClusterFramesProps {
  model: Model;
  focus: { topicId: string } | null;
  lowerQuery: string;
  compact: boolean;
}

/** the glass frame and header of every topic cluster */
export function ClusterFrames({
  model,
  focus,
  lowerQuery,
  compact,
}: ClusterFramesProps) {
  return (
    <>
    {model.modules.map((module) => (
      <div key={`clusters-${module.mapId}`}>
        {module.layout.clusters.map((cluster) => {
          const topic = cluster.topic
            ? model.topics.get(cluster.topic.id)
            : undefined;
          const parent = cluster.topic?.parentId
            ? module.topics.find(
                (entry) => entry.id === cluster.topic!.parentId,
              )
            : undefined;
          const on = focus?.topicId === cluster.key;
          const count = cluster.refs.length;
          const elsewhere = cluster.topic
            ? module.items.filter(
                (item) =>
                  module.layout.primary.get(item.ref) !== cluster.key &&
                  item.tags.some((tag) => tag.topicId === cluster.key),
              ).length
            : 0;
          const meta = cluster.topic
            ? [
                parent?.name,
                `${count} ${count === 1 ? "card" : "cards"}`,
                topic?.exam
                  ?.replace(/^In /, "in ")
                  .replace(/ reviewed.*/, " papers"),
              ]
                .filter(Boolean)
                .join(" · ")
            : `${count} ${count === 1 ? "card" : "cards"} · classify these to sort them`;
          return (
            <div
              key={cluster.key}
              data-cluster={cluster.key}
              className={`study-glass absolute rounded-[20px] ${on ? "study-glass-on" : ""} ${lowerQuery && cluster.topic && !cluster.topic.name.toLocaleLowerCase().includes(lowerQuery) ? "opacity-60" : ""}`}
              style={{
                left: cluster.x,
                top: module.originY + cluster.y,
                width: cluster.width,
                height: cluster.height,
              }}
            >
              <button
                type="button"
                data-legend={cluster.topic ? cluster.key : undefined}
                disabled={!cluster.topic}
                aria-pressed={cluster.topic ? on : undefined}
                title={
                  cluster.topic
                    ? `${cluster.topic.name}: follow this topic`
                    : undefined
                }
                className={`flex w-full min-w-0 flex-col justify-center rounded-t-[18px] px-4 text-left transition-colors ${on ? "bg-subtle-hover" : cluster.topic ? "hover:bg-subtle" : ""}`}
                style={{ height: CLUSTER_HEADER - 4 }}
              >
                <span
                  className="flex w-full min-w-0 items-center gap-2 font-semibold leading-tight text-text"
                  style={{ fontSize: compact ? 24 : 15 }}
                >
                  <span
                    className="shrink-0 rounded-full"
                    style={{
                      width: 8,
                      height: 8,
                      background:
                        topic?.colour ?? "var(--color-text-tertiary)",
                    }}
                    aria-hidden="true"
                  />
                  <span className="truncate">
                    {cluster.topic
                      ? cluster.topic.name
                      : "Not sorted yet"}
                  </span>
                </span>
                <span
                  className="w-full truncate text-xs text-text-tertiary"
                  style={{ fontSize: compact ? 16 : undefined }}
                >
                  {meta}
                </span>
              </button>
              {count === 0 && (
                <p className="px-4 text-xs text-text-tertiary">
                  {elsewhere
                    ? `Covered by ${elsewhere} ${elsewhere === 1 ? "card" : "cards"} in other clusters`
                    : "No material yet"}
                </p>
              )}
            </div>
          );
        })}
      </div>
    ))}
    </>
  );
}
