"use client";

import {
  createContext,
  type ReactNode,
  use,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useEffectEvent,
} from "react";
import { usePathname } from "next/navigation";
import useNoteTreeStore from "@/lib/notes/state/tree";
import {
  reconcileWorkspaceSession,
  resetWorkspaceClientState,
} from "@/lib/notes/workspace-lifecycle";
import {
  subscribeToWorkspaceInvalidations,
  type WorkspaceInvalidation,
} from "@/lib/notes/workspace-invalidation";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { ROOT_ID } from "@/lib/notes/types/tree";
import { serverEventsConnected, subscribeServerEvents } from "@/lib/server-events/client";

interface WorkspaceSessionValue {
  userId: string | null;
  ready: boolean;
  refreshIdentity: () => Promise<boolean>;
}

const WorkspaceSessionContext = createContext<WorkspaceSessionValue>({
  userId: null,
  ready: false,
  refreshIdentity: async () => false,
});

/** a tab coming back within this long of its last refresh keeps what it has */
const CATCH_UP_INTERVAL_MS = 30_000;
/** with live tree events the return check is only a safety net for missed ones */
const CATCH_UP_WITH_EVENTS_MS = 5 * 60_000;
/** past this many changed folders one full refresh is cheaper than branch reads */
const MAX_BRANCH_REFRESHES = 6;
/** a bulk import sends a burst, so changes are gathered briefly before reading */
const TREE_EVENT_BATCH_MS = 300;

function isWorkspacePath(pathname: string): boolean {
  return (
    pathname === "/notes" ||
    pathname.startsWith("/notes/") ||
    pathname === "/settings" ||
    pathname.startsWith("/settings/")
  );
}

function userIdFromResponse(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const user = (value as { user?: unknown }).user;
  if (!user || typeof user !== "object" || Array.isArray(user)) return null;
  const userId = (user as { user_id?: unknown }).user_id;
  return typeof userId === "string" && userId.length > 0 ? userId : null;
}

export default function WorkspaceLifecycleProvider({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { t } = useI18n();
  const managedPath = isWorkspacePath(pathname);
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [identityError, setIdentityError] = useState(false);
  const identityRequest = useRef(0);
  const identityResolved = useRef(false);
  const identityRequired = useRef(managedPath);
  const wasManagedPath = useRef(false);

  useLayoutEffect(() => {
    const enteringManagedPath = managedPath && !wasManagedPath.current;
    wasManagedPath.current = managedPath;
    if (enteringManagedPath) {
      identityRequired.current = true;
      setIdentityError(false);
      setReady(false);
    }
    if (!managedPath) {
      identityRequest.current += 1;
      identityRequired.current = false;
    }
    return () => {
      if (managedPath) identityRequest.current += 1;
    };
  }, [managedPath]);

  const refreshIdentity = async () => {
    const request = ++identityRequest.current;
    setIdentityError(false);
    const run = async () => {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      if (!response.ok && response.status !== 401 && response.status !== 403) {
        throw new Error(`auth API returned ${response.status}`);
      }
      const nextUserId = response.ok
        ? userIdFromResponse(await response.json())
        : null;
      if (response.ok && !nextUserId) {
        throw new Error("auth API returned no user ID");
      }
      if (request !== identityRequest.current) return false;
      await reconcileWorkspaceSession(nextUserId);
      if (request !== identityRequest.current) return false;
      setUserId(nextUserId);
      identityResolved.current = true;
      identityRequired.current = false;
      setReady(true);
      return true;
    };
    return await run()
      .catch((error: unknown) => {
        console.warn("Failed to resolve the workspace session:", error);
        if (request === identityRequest.current && identityRequired.current) {
          setIdentityError(true);
        }
        return false;
      });
  };

  // identity checks only read refs and setters, so effects call the latest one
  const verifyIdentity = useEffectEvent(refreshIdentity);

  useEffect(() => {
    if (!managedPath) {
      setReady(false);
      return;
    }
    void verifyIdentity();
  }, [managedPath]);

  useEffect(() => {
    if (!managedPath) return;
    // returning to a tab fires visibilitychange and focus together, and
    // alt-tabbing fires focus every time, so share one run and skip repeats
    // soon after a refresh. other tabs in this browser still invalidate at once
    let running: Promise<void> | null = null;
    let refreshedAt = Number.NEGATIVE_INFINITY;
    const run = async () => {
      const identityVerified = await verifyIdentity();
      if (!identityVerified) return;
      const treeState = useNoteTreeStore.getState();
      if (!identityResolved.current || !treeState.ownerUserId || !treeState.treeAPI) {
        return;
      }
      await treeState.refreshTree()
        .then(() => {
          refreshedAt = Date.now();
        })
        .catch((error: unknown) => {
          console.warn("Failed to refresh notes after returning to the app:", error);
        });
    };
    const catchUp = async () => {
      const interval = serverEventsConnected() ? CATCH_UP_WITH_EVENTS_MS : CATCH_UP_INTERVAL_MS;
      if (running || Date.now() - refreshedAt < interval) return;
      running = run().finally(() => {
        running = null;
      });
      await running;
    };
    const handleFocus = () => void catchUp();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void catchUp();
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [managedPath]);

  // tree changes from other devices, workers and imports arrive as server
  // events naming the folder that changed, so only that branch is re-read
  useEffect(() => {
    if (!userId) return;
    let parents = new Set<string>();
    let everything = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const flush = () => {
      timer = undefined;
      const changed = [...parents];
      const full = everything || changed.length > MAX_BRANCH_REFRESHES;
      parents = new Set();
      everything = false;
      const treeState = useNoteTreeStore.getState();
      if (treeState.ownerUserId !== userId || !treeState.treeAPI || !treeState.initLoaded) return;
      void (full ? treeState.refreshTree() : treeState.refreshBranches(changed))
        .catch((error: unknown) => {
          console.warn("Failed to apply a live tree change:", error);
        });
    };

    const unsubscribe = subscribeServerEvents((event) => {
      if (event.type === "resync") everything = true;
      else if (event.type === "tree") parents.add(event.parentId ?? ROOT_ID);
      else return;
      if (timer === undefined) timer = setTimeout(flush, TREE_EVENT_BATCH_MS);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    const handleInvalidation = async (event: WorkspaceInvalidation) => {
      if (event.scope === "session") {
        const identityVerified = await verifyIdentity();
        if (!identityVerified) {
          throw new Error("Workspace identity refresh did not complete");
        }
        return;
      }

      const currentTreeState = useNoteTreeStore.getState();
      if (event.scope === "vault") {
        if (currentTreeState.ownerUserId === event.userId) {
          await resetWorkspaceClientState(event.userId);
        }
        return;
      }

      const identityVerified = await verifyIdentity();
      if (!identityVerified) {
        throw new Error("Workspace identity refresh did not complete");
      }
      const treeState = useNoteTreeStore.getState();
      if (treeState.ownerUserId !== event.userId) return;
      if (!treeState.treeAPI) {
        throw new Error("Workspace tree is not ready");
      }
      await treeState.refreshTree();
    };

    return subscribeToWorkspaceInvalidations(userId, async (event) => {
      await handleInvalidation(event)
        .catch((error: unknown) => {
          console.warn("Failed to apply a workspace update from another tab:", error);
          throw error;
        });
    });
  }, [userId]);

  const value = { userId, ready, refreshIdentity };

  return (
    <WorkspaceSessionContext value={value}>
      {managedPath && !ready ? (
        <div className="flex min-h-dvh items-center justify-center bg-background px-6 text-center text-sm text-text-tertiary">
          {identityError ? (
            <div className="space-y-3">
              <p>{t("Something went wrong")}</p>
              <button
                type="button"
                className="rounded-radius-md bg-action px-3 py-2 font-semibold text-on-action hover:bg-action-hover"
                onClick={() => void refreshIdentity()}
              >
                {t("Try again")}
              </button>
            </div>
          ) : (
            <p role="status">{t("Loading...")}</p>
          )}
        </div>
      ) : (
        children
      )}
    </WorkspaceSessionContext>
  );
}

export function useWorkspaceSession(): WorkspaceSessionValue {
  return use(WorkspaceSessionContext);
}
