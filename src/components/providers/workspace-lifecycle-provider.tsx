"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
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

  const refreshIdentity = useCallback(async () => {
    const request = ++identityRequest.current;
    setIdentityError(false);
    try {
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
    } catch (error) {
      console.warn("Failed to resolve the workspace session:", error);
      if (request === identityRequest.current && identityRequired.current) {
        setIdentityError(true);
      }
      return false;
    }
  }, []);

  useEffect(() => {
    if (!managedPath) {
      setReady(false);
      return;
    }
    void refreshIdentity();
  }, [managedPath, refreshIdentity]);

  useEffect(() => {
    if (!managedPath) return;
    const catchUp = async () => {
      const identityVerified = await refreshIdentity();
      if (!identityVerified) return;
      const treeState = useNoteTreeStore.getState();
      if (!identityResolved.current || !treeState.ownerUserId || !treeState.treeAPI) {
        return;
      }
      try {
        await treeState.refreshTree();
      } catch (error) {
        console.warn("Failed to refresh notes after returning to the app:", error);
      }
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
  }, [managedPath, refreshIdentity]);

  useEffect(() => {
    if (!userId) return;

    const handleInvalidation = async (event: WorkspaceInvalidation) => {
      if (event.scope === "session") {
        const identityVerified = await refreshIdentity();
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

      const identityVerified = await refreshIdentity();
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
      try {
        await handleInvalidation(event);
      } catch (error) {
        console.warn("Failed to apply a workspace update from another tab:", error);
        throw error;
      }
    });
  }, [refreshIdentity, userId]);

  const value = useMemo(
    () => ({ userId, ready, refreshIdentity }),
    [ready, refreshIdentity, userId],
  );

  return (
    <WorkspaceSessionContext.Provider value={value}>
      {managedPath && !ready ? (
        <div className="flex min-h-dvh items-center justify-center bg-background px-6 text-center text-sm text-text-tertiary">
          {identityError ? (
            <div className="space-y-3">
              <p>{t("Something went wrong")}</p>
              <button
                type="button"
                className="rounded-radius-md bg-primary-600 px-3 py-2 font-semibold text-text-on-primary hover:bg-primary-700"
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
    </WorkspaceSessionContext.Provider>
  );
}

export function useWorkspaceSession(): WorkspaceSessionValue {
  return useContext(WorkspaceSessionContext);
}
