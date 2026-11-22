import type { ReactNode } from "react";
import { CARD_WIDTH, CLUSTER_HEADER, type FlowItem, type FlowLink } from "@/lib/study-map/flow";
import {
  connector,
  headerRect,
  rectOf,
  ribbon,
  type Model,
  type Placed,
} from "./study-flow-model";

export interface FlowSvgInput {
  activeRef: string | null;
  /** a link is being drawn, so the active card's topic lines stay hidden */
  connecting: boolean;
  focus: { topicId: string; stop: number } | null;
  hoverTopic: string | null;
  model: Model;
  positionOf: (ref: string) => Placed | undefined;
  showLinks: boolean;
  stops: Map<string, number>;
  tagsShown: (item: FlowItem) => FlowItem["tags"];
  trail: FlowItem[];
}

export interface FlowSvgLabel {
  key: string;
  x: number;
  y: number;
  text: string;
  link?: FlowLink;
  tone: "plain" | "cross" | "strong";
}

/** geometry for topic relations, links and bridges */
export function buildFlowSvg({
  activeRef,
  connecting,
  focus,
  hoverTopic,
  model,
  positionOf,
  showLinks,
  stops,
  tagsShown,
  trail,
}: FlowSvgInput) {
  // edges sit under the cluster frames so they only show in the gaps between clusters
  const edges: ReactNode[] = [];
  const under: ReactNode[] = [];
  const over: ReactNode[] = [];
  const labels: FlowSvgLabel[] = [];
  const active = activeRef ? model.byRef.get(activeRef) : undefined;
  const activeTopic = active?.module.layout.primary.get(active.item.ref);
  for (const module of model.modules) {
    const strongest = Math.max(
      0,
      ...module.layout.relations.map((relation) => relation.weight),
    );
    for (const relation of module.layout.relations) {
      const a = module.layout.clusters.find(
        (cluster) => cluster.key === relation.a,
      );
      const b = module.layout.clusters.find(
        (cluster) => cluster.key === relation.b,
      );
      if (!a || !b) continue;
      const ra = headerRect(module, a);
      const rb = headerRect(module, b);
      // on one shelf with clusters between them, a straight line would run behind those clusters, so it arcs over
      const blocked =
        a.y === b.y &&
        module.layout.clusters.some(
          (cluster) =>
            cluster.y === a.y &&
            cluster.x > Math.min(a.x, b.x) &&
            cluster.x < Math.max(a.x, b.x),
        );
      const ax = ra.x + ra.w / 2;
      const bx = rb.x + rb.w / 2;
      const lift = Math.min(60, 28 + Math.abs(bx - ax) * 0.04);
      const d = blocked
        ? `M${ax},${ra.y} C${ax},${ra.y - lift} ${bx},${rb.y - lift} ${bx},${rb.y}`
        : connector(ra, rb).d;
      const lit = [focus?.topicId, hoverTopic, activeTopic].some(
        (topicId) => topicId === relation.a || topicId === relation.b,
      );
      if (!lit) continue;
      edges.push(
        <path
          key={`relation-${relation.a}-${relation.b}`}
          data-relation={`${relation.a} ${relation.b}`}
          d={d}
          fill="none"
          stroke="var(--color-text-secondary)"
          strokeWidth={1.5 + 5 * (relation.weight / (strongest || 1))}
          strokeLinecap="round"
          opacity={0.7}
        />,
      );
    }
  }
  // a hovered or selected card points at the clusters of its other topics
  if (active && !connecting) {
    for (const tag of tagsShown(active.item)) {
      if (tag.topicId === activeTopic) continue;
      const target = model.clusters.get(tag.topicId);
      if (!target || target.module !== active.module) continue;
      const position = positionOf(active.item.ref) ?? active;
      over.push(
        <path
          key={`topic-line-${tag.topicId}`}
          data-topic-line={tag.topicId}
          d={
            connector(
              rectOf(position),
              headerRect(target.module, target.cluster),
            ).d
          }
          fill="none"
          stroke={model.topics.get(tag.topicId)?.colour}
          strokeWidth={tag.relevance === "core" ? 2 : 1.4}
          strokeDasharray="3 5"
          strokeLinecap="round"
          opacity={0.55}
        />,
      );
    }
  }
  // following a topic draws its stops in order, wherever their clusters are
  if (focus && trail.length > 1) {
    const points = trail
      .map((item) => positionOf(item.ref))
      .filter((placed): placed is Placed => placed !== undefined)
      .map((placed) => ({
        x: placed.x + CARD_WIDTH / 2,
        y: placed.y + Math.min(placed.item.height / 2, 70),
      }));
    if (points.length > 1)
      under.push(
        <path
          key="trail"
          d={ribbon(points)}
          fill="none"
          stroke={model.topics.get(focus.topicId)?.colour}
          strokeWidth={8}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.22}
        />,
      );
  }
  if (showLinks) {
    for (const link of model.links) {
      const a = positionOf(link.source);
      const b = positionOf(link.target);
      if (!a || !b) continue;
      const geometry = connector(rectOf(a), rectOf(b));
      const cross = a.item.mapId !== b.item.mapId;
      const strong =
        activeRef === link.source ||
        activeRef === link.target ||
        (focus !== null && stops.has(link.source) && stops.has(link.target));
      // links stay out of the way until a card that has them is picked
      if (!strong) continue;
      const path = (
        <path
          key={link.id}
          d={geometry.d}
          fill="none"
          stroke="var(--color-text-secondary)"
          strokeWidth={2.4}
          strokeDasharray={
            cross ? "8 6" : link.origin === "note" ? undefined : "2 4"
          }
          opacity={0.85}
          markerEnd="url(#flow-arrow)"
        />
      );
      over.push(
        <path
          key={`${link.id}-halo`}
          d={geometry.d}
          fill="none"
          stroke="var(--color-background)"
          strokeWidth={8}
          opacity={0.8}
        />,
        path,
      );
      labels.push({
        key: link.id,
        x: geometry.mid.x,
        y: geometry.mid.y,
        text: link.label,
        link,
        tone: "strong",
      });
    }
  }
  if (activeRef && model.sources.has(activeRef)) {
    const assignment = positionOf(activeRef);
    for (const source of model.sources.get(activeRef) ?? []) {
      const placed = positionOf(source.ref);
      if (!assignment || !placed) continue;
      const geometry = connector(rectOf(placed), rectOf(assignment));
      over.push(
        <path
          key={`source-${source.ref}`}
          d={geometry.d}
          fill="none"
          stroke="var(--color-ai-500)"
          strokeWidth={2.2}
          strokeDasharray="2 5"
          strokeLinecap="round"
          markerEnd="url(#flow-arrow)"
        />,
      );
    }
  }
  // topics linked across modules curve out through the left margin
  for (const bridge of model.bridges) {
    const ca = model.clusters.get(bridge.a);
    const cb = model.clusters.get(bridge.b);
    if (!ca || !cb) continue;
    const ra = headerRect(ca.module, ca.cluster);
    const rb = headerRect(cb.module, cb.cluster);
    const ya = ra.y + CLUSTER_HEADER / 2;
    const yb = rb.y + CLUSTER_HEADER / 2;
    const bend = -120 - Math.abs(yb - ya) * 0.05;
    const d = `M${ra.x},${ya} C${bend},${ya} ${bend},${yb} ${rb.x},${yb}`;
    const on =
      [bridge.a, bridge.b].includes(focus?.topicId ?? "") ||
      [bridge.a, bridge.b].includes(hoverTopic ?? "");
    if (!on) continue;
    over.push(
      <path
        key={`bridge-${bridge.a}-${bridge.b}-${bridge.reason}`}
        d={d}
        fill="none"
        stroke="var(--color-text-tertiary)"
        strokeWidth={2.4}
        strokeDasharray="8 6"
        opacity={0.9}
      />,
    );
    labels.push({
        key: `bridge-${bridge.a}-${bridge.b}-${bridge.reason}`,
        x: bend * 0.75 + 4,
        y: (ya + yb) / 2,
        text:
          bridge.reason === "same name"
            ? "same topic name"
            : `${bridge.count} linked notes`,
        tone: "cross",
      });
  }
  return { edges, under, over, labels };
}
