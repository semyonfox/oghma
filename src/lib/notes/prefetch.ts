// background prefetch tasks — runs after tree init, never blocks UI
// uses requestIdleCallback so the browser schedules it in dead time

import useNoteTreeStore from "./state/tree";
import useNoteStore from "./state/note";
import useLayoutStore from "./state/layout.zustand";

function runWhenIdle(fn: () => void) {
  if (typeof window === "undefined") return;
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(fn, { timeout: 5000 });
  } else {
    setTimeout(fn, 1000);
  }
}

// fire-and-forget with a small stagger between requests so we
// don't flood the API — prefetch failures are always silent
async function staggered<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  delayMs = 150,
) {
  for (const item of items) {
    try {
      await fn(item);
    } catch {
      // non-fatal
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
}

export function schedulePrefetch() {
  runWhenIdle(async () => {
    const { fetchNote } = useNoteStore.getState();
    const { loadChildren, tree } = useNoteTreeStore.getState();
    const { paneA, paneB, expandedNodes } = useLayoutStore.getState();

    // prefetch last-open notes — returning user almost certainly opens these
    const recentNoteIds = [paneA.fileId, paneB?.fileId].filter(
      (id): id is string => !!id,
    );
    await staggered(recentNoteIds, async (id) => { await fetchNote(id); });

    // prefetch children of previously expanded folders
    // expandedNodes is persisted in localStorage so we know exactly
    // which folders the user had open last session
    const foldersNeedingChildren = Array.from(expandedNodes).filter((id) => {
      const item = tree.items[id];
      return item?.isFolder && item.children.length === 0;
    });
    await staggered(foldersNeedingChildren, (id) => loadChildren(id), 300);
  });
}
