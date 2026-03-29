import { useEffect, useRef, useState, useCallback } from "react";
import useFetcher from "@/lib/notes/api/fetcher";

type SyncStatus = "saved" | "saving" | "offline" | "error";

interface AutoSaveState {
  status: SyncStatus;
  lastSaved?: Date;
  error?: string;
}

/**
 * Hook to handle auto-saving notes to IndexedDB (immediate) and S3 (when online)
 * Debounces saves to every 3 seconds while typing
 */
export const useAutoSave = (noteId: string | undefined, content: string) => {
  const initialState: AutoSaveState = { status: "saved" };
  const [state, setState] = useState(initialState);
  const contentRef = useRef(content);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const { request } = useFetcher();

  // Keep ref in sync with latest content
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  // Save to IndexedDB
  const saveToIndexedDB = useCallback(async (id: string, text: string) => {
    try {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("oghmaNotes", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onupgradeneeded = (e) => {
          const db = (e.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains("notes")) {
            db.createObjectStore("notes", { keyPath: "id" });
          }
        };
      });

      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction("notes", "readwrite");
        const store = tx.objectStore("notes");
        const putRequest = store.put({
          id,
          content: text,
          timestamp: Date.now(),
        });

        putRequest.onerror = () => reject(putRequest.error);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (error) {
      console.error("IndexedDB save failed:", error);
      throw error;
    }
  }, []);

  // Sync to server/S3
  const syncToServer = useCallback(
    async (id: string, text: string) => {
      if (!navigator.onLine) {
        setState((prev) => ({ ...prev, status: "offline" }));
        return;
      }

      try {
        setState((prev) => ({ ...prev, status: "saving" }));

        const response = await request(
          {
            method: "PUT",
            url: `/api/notes/${id}`,
          },
          { content: text },
        );

        if (!response) {
          throw new Error("Server response was empty");
        }

        setState({
          status: "saved",
          lastSaved: new Date(),
        });
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        setState({
          status: "error",
          error: errorMsg,
        });
        console.error("Sync error:", error);
        throw error;
      }
    },
    [request],
  );

  // Main auto-save effect (debounced)
  const performSave = useCallback(async () => {
    if (!noteId) return;

    try {
      // Save to IndexedDB immediately (offline first)
      await saveToIndexedDB(noteId, contentRef.current);

      // Sync to server if online
      if (navigator.onLine) {
        await syncToServer(noteId, contentRef.current);
      } else {
        setState((prev) => ({ ...prev, status: "offline" }));
      }
    } catch (error) {
      console.error("Auto-save failed:", error);
    }
  }, [noteId, saveToIndexedDB, syncToServer]);

  // Set up auto-save timer (debounced to 3 seconds)
  useEffect(() => {
    if (!noteId) return;

    // Clear existing timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    // Set new timer
    timerRef.current = setTimeout(() => {
      performSave();
    }, 3000);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [noteId, content, performSave]);

  // Handle online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setState((prev) =>
        prev.status === "offline" ? { ...prev, status: "saved" } : prev,
      );
      // Attempt to sync when coming back online
      performSave();
    };

    const handleOffline = () => {
      setState((prev) => ({ ...prev, status: "offline" }));
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [performSave]);

  // Provide manual save function
  const saveNow = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    await performSave();
  }, [performSave]);

  return {
    ...state,
    saveNow,
  };
};
