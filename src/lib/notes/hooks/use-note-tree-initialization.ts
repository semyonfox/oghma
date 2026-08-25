"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import useTreeAPI from "@/lib/notes/api/tree";
import useNoteAPI from "@/lib/notes/api/note";
import useNoteTreeStore from "@/lib/notes/state/tree";
import useNoteStore from "@/lib/notes/state/note";
import { clearDeduplicationCache } from "@/lib/notes/api/request-deduplicator";
import { purgeNonUUIDNoteCache } from "@/lib/notes/cache/note";

export default function useNoteTreeInitialization() {
  const treeAPI = useTreeAPI();
  const noteAPI = useNoteAPI();
  const initStarted = useRef(false);
  const [dependenciesReady, setDependenciesReady] = useState(false);

  useEffect(() => {
    if (initStarted.current) return;
    initStarted.current = true;

    const toastFn = (message: string, type?: "error") => {
      if (type === "error") toast.error(message);
      else toast(message);
    };

    useNoteTreeStore.getState().setDependencies(treeAPI, toastFn);
    useNoteStore.getState().setDependencies(noteAPI, useNoteTreeStore, toastFn);
    clearDeduplicationCache();
    setDependenciesReady(true);

    void purgeNonUUIDNoteCache().catch((error) =>
      console.warn("Failed to purge stale note cache:", error),
    );
    void useNoteTreeStore
      .getState()
      .initTree()
      .catch((error) => console.error("Error initializing tree:", error));
  }, [noteAPI, treeAPI]);

  return dependenciesReady;
}
