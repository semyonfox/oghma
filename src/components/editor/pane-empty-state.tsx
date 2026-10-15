"use client";

import { FC, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { DocumentIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import useLayoutStore from "@/lib/notes/state/layout";
import useNoteStore from "@/lib/notes/state/note";
import useNoteTreeStore from "@/lib/notes/state/tree";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { buildFileSpec } from "@/lib/notes/utils/file-spec";

const FirstNoteOnboarding: FC = () => {
  const { t } = useI18n();
  const router = useRouter();
  const setPaneA = useLayoutStore((s) => s.setPaneA);
  const genNewId = useNoteTreeStore((s) => s.genNewId);
  const setRenamingId = useNoteTreeStore((s) => s.setRenamingId);
  const createNote = useNoteStore((s) => s.createNote);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateFirstNote = useCallback(async () => {
    if (isCreating) return;
    setIsCreating(true);

    const id = genNewId();
    try {
      const note = await createNote({
        id,
        title: t("My first note"),
        content: t("# Welcome to OghmaNotes\n\nStart typing here."),
      });

      if (!note) {
        toast.error(t("Could not create your first note. Please try again."));
        return;
      }

      setPaneA(buildFileSpec(note));
      setRenamingId(id);
      router.push(`/notes/${id}`);
    } catch {
      toast.error(t("Could not create your first note. Please try again."));
    } finally {
      setIsCreating(false);
    }
  }, [createNote, genNewId, isCreating, router, setPaneA, setRenamingId, t]);

  return (
    <div className="flex h-full flex-col overflow-y-auto p-6">
      <div className="mx-auto my-auto w-full max-w-lg rounded-radius-lg border border-border-subtle bg-surface/70 p-6">
        <h2 className="text-lg font-semibold text-text-secondary">
          {t("Welcome to OghmaNotes")}
        </h2>
        <p className="mt-2 text-sm text-text-tertiary leading-relaxed">
          {t(
            "You are all set. Create your first note now, then import your Canvas files when you are ready.",
          )}
        </p>
        <div className="mt-4 space-y-2 text-sm text-text-tertiary">
          <p>{t("1. Create your first note.")}</p>
          <p>{t("2. Import Canvas courses from Settings.")}</p>
          <p>
            {t("3. Open AI Chat when you want summaries or quick answers.")}
          </p>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleCreateFirstNote()}
            disabled={isCreating}
            className="rounded-md bg-primary-600 px-3 py-2 text-sm font-semibold text-text-on-primary hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreating ? t("Creating note...") : t("Create first note")}
          </button>
          <a
            href="/settings#canvas"
            className="rounded-radius-md glass-card-interactive px-3 py-2 text-sm font-semibold text-text-secondary"
          >
            {t("Open Canvas import")}
          </a>
          <a
            href="/chat"
            className="rounded-radius-md glass-card-interactive px-3 py-2 text-sm font-semibold text-text-secondary"
          >
            {t("Open AI chat")}
          </a>
        </div>
      </div>
    </div>
  );
};

/**
 * What a pane shows with no file in it: first-run onboarding for an empty
 * workspace in pane A, otherwise a prompt to pick a file. Kept apart from
 * EditorPane so open panes do not subscribe to the tree root.
 */
const PaneEmptyState: FC<{ pane: "A" | "B" }> = ({ pane }) => {
  const { t } = useI18n();
  const initLoaded = useNoteTreeStore((s) => s.initLoaded);
  const workspaceIsEmpty = useNoteTreeStore(
    (s) => (s.tree.items.root?.children?.length ?? 0) === 0,
  );

  if (pane === "A" && initLoaded && workspaceIsEmpty) {
    return <FirstNoteOnboarding />;
  }

  return (
    <div className="h-full flex flex-col items-center justify-center px-6 text-text-tertiary gap-4">
      <div className="rounded-radius-xl border border-border-subtle bg-subtle p-3">
        <DocumentIcon className="w-7 h-7" aria-hidden="true" />
      </div>
      <div className="text-center">
        <p className="text-base font-medium text-text-secondary">
          {t("file_view_pane.select_file")}
        </p>
        <p className="text-sm text-text-tertiary mt-2 max-w-xs leading-relaxed">
          {t("file_view_pane.select_file_hint")}
        </p>
      </div>
    </div>
  );
};

export default PaneEmptyState;
