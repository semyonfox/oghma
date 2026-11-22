
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { DECK_COLUMNS, DECK_COLUMNS_NARROW } from "@/lib/study-map/decks";

import {
  DECK_ZOOM,
  UNFOLD_LOG,
  COMPACT_ZOOM,
  MIN_ZOOM,
  MAX_ZOOM,
  TOP_INSET,
  type Camera,
  type Rect,
  type Unfold,
  deckTableFor,
  clamp,
  reducedMotion,
  readSavedCamera,
  type Model,
} from "./study-flow-model";

// pan, zoom and the fold between topic decks and clusters. the camera lives in
// refs and is written straight to the DOM, and `view` is the throttled copy for
// rendering
export function useFlowCamera(
  model: Model,
  viewKey: string,
  /** called when zooming out folds the clusters back into decks */
  onFold: () => void,
) {
  const boardRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<Camera>({ x: 40, y: 20, z: 0.3 });
  // set while the camera is parked on DECK_ZOOM in deck coordinates. the board shows decks whenever z < DECK_ZOOM or this is set
  const unfoldRef = useRef<Unfold | null>(null);
  // whether the last switch between decks and clusters was a seamless unfold rather than a snap
  const seamRef = useRef(false);
  const [view, setView] = useState<
    Camera & { w: number; h: number; unfold: Unfold | null; seam: boolean }
  >({
    x: 40,
    y: 20,
    z: 0.3,
    w: 1200,
    h: 800,
    unfold: null,
    seam: false,
  });
  const deckTable = useMemo(
    () =>
      deckTableFor(
        model.modules,
        view.w < 640 ? DECK_COLUMNS_NARROW : DECK_COLUMNS,
      ),
    [model, view.w],
  );
  const frameRef = useRef(0);
  const animationRef = useRef(0);

  const apply = () => {
    const world = worldRef.current;
    const board = boardRef.current;
    if (!world || !board) return;
    const { x, y, z } = cameraRef.current;
    world.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
    const spacing = 28 * z < 10 ? 28 * z * 4 : 28 * z;
    board.style.backgroundSize = `${spacing}px ${spacing}px`;
    board.style.backgroundPosition = `${x}px ${y}px`;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      setView({
        ...cameraRef.current,
        w: board.clientWidth,
        h: board.clientHeight,
        unfold: unfoldRef.current && { ...unfoldRef.current },
        seam: seamRef.current,
      });
    });
  };

  // the camera only touches refs and the DOM, so effects call the latest one
  const applyCamera = useEffectEvent(apply);

  // decks and clusters have different coordinates. the topic under the pointer, or the closest one in a gap, ties
  // them together: the spot under the pointer in its deck lines up with the same spot in its cluster
  const anchorAt = (
    px: number,
    py: number,
    decks: boolean,
  ): Omit<Unfold, "u"> => {
    const anchors = deckTable.modules.flatMap(({ module, table, originY }) =>
      table.decks.map((deck) => ({
        key: deck.id,
        deck: { x: deck.x, y: originY + deck.y, w: deck.width, h: deck.height },
        cluster: {
          x: deck.cluster.x,
          y: module.originY + deck.cluster.y,
          w: deck.cluster.width,
          h: deck.cluster.height,
        },
      })),
    );
    if (!anchors.length) return { key: "", off: { x: 0, y: 0 }, full: DECK_ZOOM };
    const { x, y, z } = cameraRef.current;
    const wx = (px - x) / z;
    const wy = (py - y) / z;
    const rectOfAnchor = (anchor: (typeof anchors)[number]) =>
      decks ? anchor.deck : anchor.cluster;
    const inside = (rect: Rect) =>
      wx >= rect.x && wx <= rect.x + rect.w && wy >= rect.y && wy <= rect.y + rect.h;
    const distance = (rect: Rect) =>
      Math.hypot(rect.x + rect.w / 2 - wx, rect.y + rect.h / 2 - wy);
    const nearest =
      anchors.find((anchor) => inside(rectOfAnchor(anchor))) ??
      anchors.reduce((best, anchor) =>
        distance(rectOfAnchor(anchor)) < distance(rectOfAnchor(best))
          ? anchor
          : best,
      );
    const { deck, cluster } = nearest;
    // only the top of a tall cluster counts, so it opens downwards from its deck
    const clusterH = Math.min(cluster.h, 400);
    const from = decks ? deck : { ...cluster, h: clusterH };
    const rx = clamp((wx - from.x) / from.w, 0, 1);
    const ry = clamp((wy - from.y) / from.h, 0, 1);
    return {
      key: nearest.key,
      off: {
        x: deck.x + rx * deck.w - (cluster.x + rx * cluster.w),
        y: deck.y + ry * deck.h - (cluster.y + ry * clusterH),
      },
      // same area on screen, but never past the compact cards
      full: clamp(
        DECK_ZOOM * Math.sqrt((deck.w * deck.h) / (cluster.w * cluster.h)),
        DECK_ZOOM,
        COMPACT_ZOOM - 0.02,
      ),
    };
  };

  const zoomAbout = (next: number, px: number, py: number) => {
    const { x, y, z } = cameraRef.current;
    cameraRef.current = {
      x: px - ((px - x) / z) * next,
      y: py - ((py - y) / z) * next,
      z: next,
    };
  };

  // zooming in stops at DECK_ZOOM and the rest unfolds the decks into clusters in place, so cards show without going
  // closer. zooming out folds them back first. both layers only swap once they line up exactly
  const zoomInput = (logDelta: number, px: number, py: number) => {
    // a fly that was cut short can leave a stale park below the threshold
    if (unfoldRef.current && cameraRef.current.z < DECK_ZOOM) unfoldRef.current = null;
    let rest = logDelta;
    for (let guard = 0; Math.abs(rest) > 1e-9 && guard < 6; guard++) {
      const { z } = cameraRef.current;
      const parked = unfoldRef.current;
      if (parked) {
        if (rest > 0 || parked.u > 0) {
          const du =
            rest > 0
              ? Math.min(1 - parked.u, rest / UNFOLD_LOG)
              : Math.max(-parked.u, rest / UNFOLD_LOG);
          rest -= du * UNFOLD_LOG;
          const next = parked.u + du;
          const done = next > 1 - 1e-6;
          const shut = next < 1e-6;
          zoomAbout(
            done
              ? parked.full
              : shut
                ? DECK_ZOOM
                : DECK_ZOOM * Math.pow(parked.full / DECK_ZOOM, next),
            px,
            py,
          );
          if (done) {
            const c = cameraRef.current;
            cameraRef.current = {
              x: c.x + parked.off.x * c.z,
              y: c.y + parked.off.y * c.z,
              z: c.z,
            };
            unfoldRef.current = null;
            seamRef.current = true;
          } else {
            unfoldRef.current = { ...parked, u: shut ? 0 : next };
          }
        } else {
          unfoldRef.current = null;
          zoomAbout(clamp(z * Math.exp(rest), MIN_ZOOM, DECK_ZOOM), px, py);
          rest = 0;
        }
      } else if (z < DECK_ZOOM) {
        const room = Math.log(DECK_ZOOM / z);
        if (rest > 0 && rest >= room) {
          rest -= room;
          zoomAbout(DECK_ZOOM, px, py);
          unfoldRef.current = { u: 0, ...anchorAt(px, py, true) };
          onFold();
        } else {
          zoomAbout(clamp(z * Math.exp(rest), MIN_ZOOM, DECK_ZOOM), px, py);
          rest = 0;
        }
      } else {
        // folding starts where unfolding that topic would have ended, or right away if already closer than that
        const anchor = rest < 0 ? anchorAt(px, py, false) : null;
        const room = anchor ? Math.log(Math.min(anchor.full, z) / z) : 0;
        if (anchor && rest <= room) {
          rest -= room;
          zoomAbout(Math.min(anchor.full, z), px, py);
          const c = cameraRef.current;
          cameraRef.current = {
            x: c.x - anchor.off.x * c.z,
            y: c.y - anchor.off.y * c.z,
            z: c.z,
          };
          unfoldRef.current = { u: 1, ...anchor, full: c.z };
          seamRef.current = true;
        } else {
          zoomAbout(clamp(z * Math.exp(rest), DECK_ZOOM, MAX_ZOOM), px, py);
          rest = 0;
        }
      }
    }
  };

  const flyTo = (target: Camera, ms = 380) => {
    cancelAnimationFrame(animationRef.current);
    // no sliding between two coordinate systems: the layers cross-fade instead
    const decks = cameraRef.current.z < DECK_ZOOM || unfoldRef.current !== null;
    const crossing = decks !== target.z < DECK_ZOOM;
    if (crossing) seamRef.current = false;
    if (reducedMotion() || ms === 0 || crossing) {
      cameraRef.current = target;
      unfoldRef.current = null;
      apply();
      return;
    }
    // a half unfolded table folds back up on the way
    const folding = unfoldRef.current;
    const from = { ...cameraRef.current };
    // the first frame's timestamp starts the clock, so nothing impure runs here
    let start: number | null = null;
    const step = (now: number) => {
      if (start === null) start = now;
      const t = clamp((now - start) / ms, 0, 1);
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const z = Math.exp(
        Math.log(from.z) + (Math.log(target.z) - Math.log(from.z)) * ease,
      );
      // interpolate the world point at the screen centre so zooming feels anchored
      const board = boardRef.current;
      const w = board?.clientWidth ?? 1200;
      const h = board?.clientHeight ?? 800;
      const fromCentre = {
        x: (w / 2 - from.x) / from.z,
        y: (h / 2 - from.y) / from.z,
      };
      const toCentre = {
        x: (w / 2 - target.x) / target.z,
        y: (h / 2 - target.y) / target.z,
      };
      const cx = fromCentre.x + (toCentre.x - fromCentre.x) * ease;
      const cy = fromCentre.y + (toCentre.y - fromCentre.y) * ease;
      cameraRef.current = { x: w / 2 - cx * z, y: h / 2 - cy * z, z };
      if (folding)
        unfoldRef.current = t < 1 ? { ...folding, u: folding.u * (1 - ease) } : null;
      apply();
      if (t < 1) animationRef.current = requestAnimationFrame(step);
    };
    animationRef.current = requestAnimationFrame(step);
  };

  const frameRect = (
    rect: { x: number; y: number; w: number; h: number },
    maxZoom = 1,
    padding = 48,
    leftInset = 0,
    topInset = TOP_INSET,
    minZoom = MIN_ZOOM,
  ) => {
    const board = boardRef.current;
    const w = (board?.clientWidth ?? 1200) - leftInset;
    const h = (board?.clientHeight ?? 800) - topInset;
    const z = clamp(
      Math.min((w - padding * 2) / rect.w, (h - padding * 2) / rect.h),
      minZoom,
      maxZoom,
    );
    return {
      x: leftInset + w / 2 - (rect.x + rect.w / 2) * z,
      y: topInset + h / 2 - (rect.y + rect.h / 2) * z,
      z,
    };
  };

  const fit = () => {
    flyTo(
      frameRect(
        { x: 0, y: 0, w: deckTable.width, h: Math.max(deckTable.height, 400) },
        DECK_ZOOM - 0.02,
      ),
    );
  };

  const zoomBy = (factor: number, sx?: number, sy?: number) => {
    const board = boardRef.current;
    if (!board) return;
    zoomInput(
      Math.log(factor),
      sx ?? board.clientWidth / 2,
      sy ?? board.clientHeight / 2,
    );
    apply();
  };

  // restore the last camera for this scope, otherwise start on the first
  // clusters at a readable size. only the scope decides where the camera
  // starts, so the latest model is read through an effect event
  const placeInitialCamera = useEffectEvent((board: HTMLElement) => {
    const restored = readSavedCamera(viewKey);
    // decks first, so opening a module starts from the overview. a phone gets two columns and pans
    const table = deckTableFor(
      model.modules,
      board.clientWidth < 640 ? DECK_COLUMNS_NARROW : DECK_COLUMNS,
    );
    const start = frameRect(
      { x: 0, y: 0, w: table.width, h: Math.min(Math.max(table.height, 400), 1900) },
      DECK_ZOOM - 0.02,
      16,
    );
    cameraRef.current =
      restored ??
      (board.clientWidth < 640 ? { ...start, y: TOP_INSET + 4 } : start);
    unfoldRef.current = null;
    seamRef.current = false;
    apply();
  });
  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    placeInitialCamera(board);
  }, [viewKey]);

  // a parked camera is in deck coordinates at or above DECK_ZOOM, which would read back as clusters
  const savedCamera = useEffectEvent((): Camera => {
    const parked = unfoldRef.current;
    const { x, y, z } = cameraRef.current;
    if (!parked) return cameraRef.current;
    if (parked.u >= 0.5)
      return { x: x + parked.off.x * z, y: y + parked.off.y * z, z };
    const board = boardRef.current;
    const cx = (board?.clientWidth ?? 1200) / 2;
    const cy = (board?.clientHeight ?? 800) / 2;
    const next = DECK_ZOOM * 0.998;
    return {
      x: cx - ((cx - x) / z) * next,
      y: cy - ((cy - y) / z) * next,
      z: next,
    };
  });

  useEffect(() => {
    const save = () => {
      try {
        window.sessionStorage.setItem(
          `oghma-study-flow-camera-v2:${viewKey}`,
          JSON.stringify(savedCamera()),
        );
      } catch {
        // the camera is a convenience; private browsing can refuse storage
      }
    };
    const timer = window.setTimeout(save, 300);
    return () => window.clearTimeout(timer);
  }, [view, viewKey]);

  useEffect(() => {
    const board = boardRef.current;
    if (!board || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => applyCamera());
    observer.observe(board);
    return () => observer.disconnect();
  }, []);

  // wheel must be non-passive to keep the page from scrolling under the canvas
  const zoomFromWheel = useEffectEvent(zoomBy);
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const onWheel = (event: WheelEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-flow-overlay]")
      )
        return;
      event.preventDefault();
      cancelAnimationFrame(animationRef.current);
      const rect = board.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) {
        zoomFromWheel(
          Math.exp(
            -event.deltaY *
              (event.ctrlKey && !event.metaKey && Math.abs(event.deltaY) < 30
                ? 0.012
                : 0.002),
          ),
          event.clientX - rect.left,
          event.clientY - rect.top,
        );
        return;
      }
      const unit = event.deltaMode === 1 ? 16 : 1;
      cameraRef.current = {
        ...cameraRef.current,
        x:
          cameraRef.current.x -
          (event.shiftKey ? event.deltaY : event.deltaX) * unit,
        y: cameraRef.current.y - (event.shiftKey ? 0 : event.deltaY) * unit,
      };
      applyCamera();
    };
    board.addEventListener("wheel", onWheel, { passive: false });
    return () => board.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(
    () => () => {
      cancelAnimationFrame(frameRef.current);
      cancelAnimationFrame(animationRef.current);
    },
    [],
  );

  return {
    boardRef,
    worldRef,
    cameraRef,
    view,
    deckTable,
    animationRef,
    apply,
    zoomInput,
    flyTo,
    frameRect,
    fit,
    zoomBy,
  };
}
