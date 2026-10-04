"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import useI18n from "@/lib/notes/hooks/use-i18n";

const responseSchema = z.object({ materials: z.array(z.object({
  id: z.string(), name: z.string(),
  status: z.enum(["available", "imported", "importing", "unsupported", "unavailable", "trashed"]),
  noteId: z.string().uuid().nullable(), url: z.url().refine(value => value.startsWith("https://")),
})) });
const importSchema = z.object({ queued: z.boolean(), jobId: z.string().uuid().optional() });

export default function AssignmentMaterials({ assignmentId }: { assignmentId: string }) {
  const { t } = useI18n();
  const [materials, setMaterials] = useState<z.infer<typeof responseSchema>["materials"]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [queued, setQueued] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const response = await fetch(`/api/assignments/${assignmentId}/materials`, { signal: controller.signal });
        if (!response.ok) throw new Error();
        const data = responseSchema.parse(await response.json());
        if (controller.signal.aborted) return;
        setMaterials(data.materials);
        setLoaded(true);
      } catch {
        if (!controller.signal.aborted) setError("Could not load assignment materials. Try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [assignmentId, refresh]);

  async function importMaterials() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/assignments/${assignmentId}/materials`, { method: "POST" });
      if (!response.ok) {
        const body: unknown = await response.json();
        const result = z.object({ error: z.string() }).safeParse(body);
        throw new Error(result.success ? result.data.error : "Could not import materials. Try again.");
      }
      const result = importSchema.parse(await response.json());
      setQueued(result.queued);
      setRefresh(value => value + 1);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not import materials. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const labels = {
    available: t("Ready to import"), imported: t("Imported"), importing: t("Importing..."),
    unsupported: t("Open this file in Canvas"), unavailable: t("Unavailable in Canvas"), trashed: t("Restore from Trash to open"),
  };
  return (
    <section aria-label={t("Materials")} className="space-y-3 border-t border-border-subtle pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-text-primary">{t("Materials")}</h3>
        <button type="button" disabled={loading || saving} onClick={() => { setError(""); setQueued(false); setRefresh(value => value + 1); }} className="min-h-11 px-2 text-sm text-text-secondary disabled:opacity-50">{t("Refresh materials")}</button>
      </div>
      {loading && <p role="status" className="text-sm text-text-tertiary">{t("Loading materials...")}</p>}
      {loaded && !loading && materials.length === 0 && <p className="text-sm text-text-tertiary">{t("No attached Canvas files found. Other links remain in the instructions above.")}</p>}
      <ul className="divide-y divide-border-subtle">
        {materials.map(material => <li key={material.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0 flex-1"><p className="break-words text-sm text-text-secondary">{material.name}</p><p className="mt-1 text-xs text-text-tertiary">{labels[material.status]}</p></div>
          <a href={material.noteId ? `/notes/${material.noteId}` : material.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm text-primary-400 underline underline-offset-4">{material.noteId ? t("Open in OghmaNotes") : t("Open in Canvas")}</a>
        </li>)}
      </ul>
      {materials.some(material => material.status === "available") && !queued && <button type="button" disabled={saving || loading} onClick={() => void importMaterials()} className="min-h-11 rounded-radius-md bg-primary-600 px-4 text-sm text-text-on-primary disabled:opacity-50">{saving ? t("Starting import...") : t("Import materials")}</button>}
      {queued && <p role="status" className="text-sm text-text-secondary">{t("Materials queued for import. You can close this assignment while they process. Refresh materials to check progress.")}</p>}
      {error && <p role="alert" className="text-sm text-error-300">{t(error)}</p>}
    </section>
  );
}
