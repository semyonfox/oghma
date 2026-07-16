"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import useTreeAPI from "@/lib/notes/api/tree";
import useNoteAPI from "@/lib/notes/api/note";
import useTrashAPI from "@/lib/notes/api/trash";
import useNoteTreeStore from "@/lib/notes/state/tree";
import useNoteStore from "@/lib/notes/state/note";
import useTrashStore from "@/lib/notes/state/trash";
import { clearDeduplicationCache } from "@/lib/notes/api/request-deduplicator";
import { purgeNonUUIDNoteCache } from "@/lib/notes/cache/note";

export default function useNoteTreeInitialization() {
  const treeAPI = useTreeAPI();
  const noteAPI = useNoteAPI();
  const trashAPI = useTrashAPI();
  const initStarted = useRef(false);
  const [dependenciesReady, setDependenciesReady] = useState(false);

  useEffect(() => {
    if (initStarted.current) return;
    initStarted.current = true;

    const toastFn = (message: string, type?: string) => {
      if (type === "error") toast.error(message);
      else toast(message);
    };

    useNoteTreeStore.getState().setDependencies(treeAPI, noteAPI, toastFn);
    useNoteStore.getState().setDependencies(noteAPI, useNoteTreeStore, toastFn);
    useTrashStore.getState().setDependencies(trashAPI, useNoteTreeStore);
    clearDeduplicationCache();
    setDependenciesReady(true);

    void purgeNonUUIDNoteCache().catch((error) =>
      console.warn("Failed to purge stale note cache:", error),
    );
    void useNoteTreeStore
      .getState()
      .initTree()
      .catch((error) => console.error("Error initializing tree:", error));
  }, [noteAPI, trashAPI, treeAPI]);

  return dependenciesReady;
}
