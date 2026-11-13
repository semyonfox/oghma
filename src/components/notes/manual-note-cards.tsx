"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { z } from "zod";
import useI18n from "@/lib/notes/hooks/use-i18n";

const cardListSchema = z.object({ cards: z.array(z.object({
  id: z.string().uuid(), front: z.string(), back: z.string(), source_quote: z.string().nullable(),
})) });
type ManualCard = z.infer<typeof cardListSchema>["cards"][number];

export function ManualCardDialog({ noteId, sourceQuote, card, onClose }: {
  noteId: string;
  sourceQuote: string;
  card?: ManualCard;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [front, setFront] = useState(card?.front ?? sourceQuote);
  const [back, setBack] = useState(card?.back ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const save = async () => {
    if (saving || !front.trim() || !back.trim()) return;
    setSaving(true);
    setError(false);
    const run = async () => {
      const response = await fetch(card ? `/api/quiz/cards/${card.id}` : `/api/notes/${noteId}/cards`, {
        method: card ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ front, back, sourceQuote }),
      });
      if (!response.ok) throw new Error("Unable to save card");
      window.dispatchEvent(new CustomEvent("note-cards-changed", { detail: { noteId } }));
      onClose();
    };
    await run().catch(() => setError(true)).finally(() => setSaving(false));
  };
  return (
    <Dialog open onClose={() => { if (!saving) onClose(); }} className="relative z-[100]">
      <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4">
        <DialogPanel className="w-full max-w-lg space-y-4 rounded-radius-lg border border-border bg-surface p-5 text-text shadow-float">
          <DialogTitle className="text-lg font-semibold">{card ? t("cards.edit") : t("cards.make")}</DialogTitle>
          <label className="block space-y-1 text-sm">
            <span>{t("cards.front")}</span>
            <textarea autoFocus value={front} maxLength={5000} onChange={(event) => setFront(event.target.value)} rows={3} className="w-full rounded-radius-md border border-border bg-input p-3 text-base text-text focus:outline-accent" />
          </label>
          <label className="block space-y-1 text-sm">
            <span>{t("cards.back")}</span>
            <textarea value={back} maxLength={5000} onChange={(event) => setBack(event.target.value)} rows={4} className="w-full rounded-radius-md border border-border bg-input p-3 text-base text-text focus:outline-accent" />
          </label>
          {error && <p role="alert" className="text-sm text-error-700 dark:text-error-400">{t("cards.save_error")}</p>}
          <div className="flex justify-end gap-2">
            <button disabled={saving} onClick={onClose} className="min-h-11 rounded-radius-md px-4 text-sm hover:bg-subtle">{t("Cancel")}</button>
            <button disabled={saving || !front.trim() || !back.trim()} onClick={() => void save()} className="min-h-11 rounded-radius-md bg-action px-4 text-sm font-semibold text-on-action hover:bg-action-hover disabled:opacity-40">{t("cards.save")}</button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}

export default function ManualNoteCards({ noteId }: { noteId: string }) {
  const { t } = useI18n();
  const [cards, setCards] = useState<ManualCard[]>([]);
  const [editing, setEditing] = useState<ManualCard | null>(null);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/notes/${noteId}/cards`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load cards");
        return cardListSchema.parse(await response.json());
      })
      .then((data) => { setCards(data.cards); setError(false); })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    const changed = () => setRefresh((value) => value + 1);
    window.addEventListener("note-cards-changed", changed);
    return () => { controller.abort(); window.removeEventListener("note-cards-changed", changed); };
  }, [noteId, refresh]);
  const remove = async (cardId: string) => {
    if (deleting) return;
    setDeleting(cardId);
    const run = async () => {
      const response = await fetch(`/api/quiz/cards/${cardId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Unable to delete card");
      setRefresh((value) => value + 1);
    };
    await run().catch(() => setError(true)).finally(() => setDeleting(null));
  };
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-medium text-text-tertiary">{t("cards.title")} ({cards.length})</h4>
      {error && <p role="alert" className="text-xs text-error-700 dark:text-error-400">{t("cards.load_error")}</p>}
      {!cards.length && <p className="text-xs text-text-tertiary">{t("cards.hint")}</p>}
      {cards.map((card) => (
        <details key={card.id} className="rounded-radius-md border border-border p-2 text-sm text-text-secondary">
          <summary className="cursor-pointer whitespace-pre-wrap break-words">{card.front}</summary>
          <p className="mt-2 whitespace-pre-wrap break-words">{card.back}</p>
          <div className="mt-2 flex gap-2">
            <button onClick={() => setEditing(card)} className="min-h-11 rounded-radius-md px-2 hover:bg-subtle">{t("cards.edit")}</button>
            <button disabled={deleting !== null} onClick={() => void remove(card.id)} className="min-h-11 rounded-radius-md px-2 hover:bg-subtle disabled:opacity-40">{t("Delete")}</button>
          </div>
        </details>
      ))}
      {editing && <ManualCardDialog noteId={noteId} card={editing} sourceQuote={editing.source_quote ?? ""} onClose={() => setEditing(null)} />}
    </section>
  );
}
