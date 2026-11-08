"use client";

import { FC, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowPathIcon, ArrowUpTrayIcon, DocumentIcon } from "@heroicons/react/24/outline";
import { OPEN_UPLOAD_EVENT } from "@/lib/notes/upload-events";
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

  const handleCreateFirstNote = async () => {
    if (isCreating) return;
    setIsCreating(true);

    const id = genNewId();
    const note = await createNote({
      id,
      title: t("My first note"),
      content: t("# Welcome to OghmaNotes\n\nStart typing here."),
    }).catch(() => undefined);
    setIsCreating(false);

    if (!note) {
      toast.error(t("Could not create your first note. Please try again."));
      return;
    }

    setPaneA(buildFileSpec(note));
    setRenamingId(id);
    router.push(`/notes/${id}`);
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto px-6 py-10">
      <div className="mx-auto my-auto w-full max-w-[520px]">
        <span className="grid h-10 w-10 place-items-center rounded-radius-lg border border-border bg-surface text-text-secondary">
          <DocumentIcon className="h-5 w-5" aria-hidden="true" />
        </span>
        <h2 className="mt-6 font-serif text-[34px] font-bold leading-[1.15] tracking-tight text-text">
          {t("Start with what you already have.")}
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-text-secondary">
          {t("Bring in your lecture slides and OghmaNotes will read them, so you can search, ask and quiz yourself straight away.")}
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <a
            href="/settings#canvas"
            className="flex flex-col gap-1.5 rounded-radius-lg border-2 border-accent bg-surface p-4 transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <ArrowPathIcon className="h-5 w-5 text-accent" aria-hidden="true" />
            <span className="text-[15px] font-semibold text-text">{t("Connect Canvas")}</span>
            <span className="text-sm text-text-secondary">
              {t("Connect your Canvas LMS account to import your courses and lecture materials.")}
            </span>
          </a>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(OPEN_UPLOAD_EVENT))}
            className="flex flex-col gap-1.5 rounded-radius-lg border border-border bg-surface p-4 text-left transition-colors hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <ArrowUpTrayIcon className="h-5 w-5 text-text-secondary" aria-hidden="true" />
            <span className="text-[15px] font-semibold text-text">{t("Upload PDFs")}</span>
            <span className="text-sm text-text-secondary">
              {t("Or drop files anywhere. Scanned slides are read with OCR.")}
            </span>
          </button>
        </div>
        <button
          type="button"
          onClick={() => void handleCreateFirstNote()}
          disabled={isCreating}
          className="mt-5 text-sm font-semibold text-accent underline underline-offset-2 hover:text-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isCreating ? t("Creating note...") : t("Or start a blank note")}
        </button>
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
