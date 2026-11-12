"use client";

import { useEffect, useState } from "react";

// true while an on-screen keyboard is up for a focused field. the page uses
// interactive-widget=resizes-content and the android app adjustResize, so the
// keyboard shrinks the layout and anything pinned to the bottom would ride up
// on top of it. callers hide those bars instead so they stay out of the way
export default function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let restingHeight = window.innerHeight;
    const update = () => {
      const target = document.activeElement;
      const editing =
        target instanceof HTMLElement &&
        (target.matches("input,textarea") || target.isContentEditable);
      const height = window.visualViewport?.height ?? window.innerHeight;
      if (!editing) restingHeight = window.innerHeight;
      setOpen(editing && restingHeight - height > 120);
    };
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    window.visualViewport?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    return () => {
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return open;
}
