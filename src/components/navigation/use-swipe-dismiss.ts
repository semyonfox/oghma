"use client";

import { useEffect, useState, type CSSProperties } from "react";

/** Only claims an outward, single-finger drag that no child scroller needs. */
export default function useSwipeDismiss({
  open,
  onClose,
  direction = "down",
  breakpoint = 640,
}: {
  open: boolean;
  onClose: () => void;
  direction?: "down" | "left" | "right";
  breakpoint?: number;
}) {
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    setOffset(0);
    if (!panel || !open) return;
    const horizontal = direction !== "down";
    const sign = direction === "left" ? -1 : 1;
    let gesture: { id: number; x: number; y: number; target: HTMLElement; claimed: boolean } | null = null;
    let distance = 0;
    const reset = () => {
      gesture = null;
      distance = 0;
      setOffset(0);
    };
    const start = (event: TouchEvent) => {
      reset();
      const target = event.target;
      if (
        window.innerWidth >= breakpoint || event.touches.length !== 1 ||
        !(target instanceof HTMLElement) ||
        target.closest('button, a, input, textarea, select, [contenteditable="true"], [role="slider"], [data-swipe-ignore]') ||
        window.getSelection()?.isCollapsed === false
      ) return;
      const touch = event.touches[0];
      gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, target, claimed: false };
    };
    const move = (event: TouchEvent) => {
      if (!gesture) return;
      if (event.touches.length !== 1 || window.getSelection()?.isCollapsed === false) {
        reset();
        return;
      }
      const touch = event.touches[0];
      if (touch.identifier !== gesture.id) { reset(); return; }
      const dx = touch.clientX - gesture.x;
      const dy = touch.clientY - gesture.y;
      const outward = (horizontal ? dx : dy) * sign;
      const across = horizontal ? dy : dx;
      if (!gesture.claimed) {
        if (Math.max(Math.abs(outward), Math.abs(across)) < 8) return;
        if (outward <= 0 || outward < Math.abs(across) * 1.25) { reset(); return; }
        // Let text/code carousels scroll horizontally. A sheet can be pulled
        // down from its content only when every enclosing scroller is at top.
        for (let node: HTMLElement | null = gesture.target; node; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (horizontal
            ? /auto|scroll/.test(style.overflowX) && node.scrollWidth > node.clientWidth
            : /auto|scroll/.test(style.overflowY) && node.scrollTop > 0) {
            reset();
            return;
          }
          if (node === panel) break;
        }
        if (!event.cancelable) { reset(); return; }
        gesture.claimed = true;
      }
      if (!event.cancelable) { reset(); return; }
      event.preventDefault();
      distance = Math.max(0, outward);
      setOffset(distance * sign);
    };
    const end = (event: TouchEvent) => {
      if (!gesture) return;
      const dismiss = gesture.claimed && distance >= 64;
      // Avoid a synthetic click on an action underneath the departing panel.
      if (gesture.claimed && event.cancelable) event.preventDefault();
      reset();
      if (dismiss) onClose();
    };
    panel.addEventListener("touchstart", start, { passive: true });
    // React's delegated touch handlers are passive in Android WebView.
    // This local listener cancels only a drag we have positively identified.
    panel.addEventListener("touchmove", move, { passive: false });
    panel.addEventListener("touchend", end, { passive: false });
    panel.addEventListener("touchcancel", reset);
    return () => {
      panel.removeEventListener("touchstart", start);
      panel.removeEventListener("touchmove", move);
      panel.removeEventListener("touchend", end);
      panel.removeEventListener("touchcancel", reset);
    };
  }, [panel, open, onClose, direction, breakpoint]);

  const style: CSSProperties | undefined = offset ? {
    transform: direction === "down" ? `translateY(${offset}px)` : `translateX(${offset}px)`,
    transitionDuration: "0ms",
  } : undefined;
  return { ref: setPanel, style };
}
