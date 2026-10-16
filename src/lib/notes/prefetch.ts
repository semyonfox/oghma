// background prefetch — runs after tree init, never blocks UI. expanded
// folders need no prefetch: the initial tree read already loads every folder
// whose expansion is saved on the server
import useNoteStore from "./state/note";
import useLayoutStore from "./state/layout";

function runWhenIdle(fn: () => void) {
  if (typeof window === "undefined") return;
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(fn, { timeout: 5000 });
  } else {
    setTimeout(fn, 1000);
  }
}

export function schedulePrefetch() {
  runWhenIdle(async () => {
    const { paneA, paneB } = useLayoutStore.getState();
    // a returning user almost certainly reopens the notes left in the panes
    const recentNoteIds = [...new Set([paneA.fileId, paneB?.fileId])].filter(
      (id): id is string => !!id,
    );
    for (const id of recentNoteIds) {
      try {
        await useNoteStore.getState().fetchNote(id);
      } catch {
        // prefetch failures are silent; the editor reports its own read
      }
    }
  });
}
