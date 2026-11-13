"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import useNoteTreeStore from "@/lib/notes/state/tree";
import useI18n from "@/lib/notes/hooks/use-i18n";

const sectionsSchema = z.object({ sections: z.array(z.object({ key: z.string(), title: z.string() })) });
const resultSchema = z.object({
  noteId: z.string().uuid().optional(),
  parentId: z.string().uuid().nullable().optional(),
  cards: z.array(z.object({ id: z.string().uuid(), front: z.string(), back: z.string() })).optional(),
});
type Result = z.infer<typeof resultSchema>;

export default function NoteSections({ noteId, revision }: { noteId: string; revision?: string }) {
  const { t } = useI18n();
  const [sections, setSections] = useState<z.infer<typeof sectionsSchema>["sections"]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [results, setResults] = useState<Record<string, Result>>({});
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/notes/${noteId}/sections`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load sections");
        return sectionsSchema.parse(await response.json());
      })
      .then((data) => { setSections(data.sections); setError(false); })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [noteId, revision]);
  const generate = async (key: string, action: "summary" | "cards") => {
    if (busy) return;
    setBusy(key);
    setError(false);
    const run = async () => {
      const response = await fetch(`/api/notes/${noteId}/sections/${encodeURIComponent(key)}/${action}`, { method: "POST" });
      if (!response.ok) throw new Error("Section generation failed");
      const result = resultSchema.parse(await response.json());
      if (result.noteId) void useNoteTreeStore.getState().refreshChildren(result.parentId ?? null).catch(() => {});
      setResults((previous) => ({ ...previous, [key]: { ...previous[key], ...result } }));
    };
    await run().catch(() => setError(true)).finally(() => setBusy(null));
  };
  if (!sections.length && !error) return null;
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-medium text-text-tertiary">{t("sections.title")}</h4>
      {error && <p role="alert" className="text-xs text-error-700 dark:text-error-400">{t("sections.error")}</p>}
      <ul className="space-y-2">
        {sections.map((section, index) => (
          <li key={section.key} className="rounded-radius-md border border-border-subtle p-2 text-sm text-text-secondary">
            <p className="break-words">{section.title || `${t("sections.part")} ${index + 1}`}</p>
            <div className="flex flex-wrap gap-2" aria-busy={busy === section.key}>
              <button disabled={busy !== null} onClick={() => void generate(section.key, "summary")} className="min-h-11 rounded-radius-md px-2 text-xs hover:bg-subtle disabled:opacity-40">{t("sections.summarise")}</button>
              <button disabled={busy !== null} onClick={() => void generate(section.key, "cards")} className="min-h-11 rounded-radius-md px-2 text-xs hover:bg-subtle disabled:opacity-40">{t("sections.cards")}</button>
            </div>
            {busy === section.key && <p role="status" className="text-xs text-text-tertiary">{t("sections.generating")}</p>}
            {results[section.key]?.noteId && <a href={`/notes/${results[section.key].noteId}`} className="block min-h-11 py-3 text-xs text-accent underline">{t("sections.open_summary")}</a>}
            {results[section.key]?.cards && <>
              <a href="/quiz" className="block py-2 text-xs text-accent underline">{t("sections.saved_cards")}</a>
              {results[section.key].cards?.map((card) => <details key={card.id} className="mt-2 break-words text-xs"><summary className="cursor-pointer">{card.front}</summary><p className="mt-2 whitespace-pre-wrap">{card.back}</p></details>)}
            </>}
          </li>
        ))}
      </ul>
    </section>
  );
}
