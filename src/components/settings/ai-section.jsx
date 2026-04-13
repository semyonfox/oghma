"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { useSettingsStore } from "@/lib/notes/state/ui/settings";
import { Checkbox, CheckboxField } from "@/components/catalyst/checkbox";
import { inputClass, saveBtnClass } from "./settings-utils";

export default function AISection() {
  const { t } = useI18n();
  const settings = useSettingsStore((state) => state.settings);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const [canvasAccessEnabled, setCanvasAccessEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCanvasAccessEnabled(Boolean(settings?.ai_canvas_access));
  }, [settings?.ai_canvas_access]);

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await updateSettings({ ai_canvas_access: canvasAccessEnabled });
      toast.success(t("AI settings saved"));
    } catch (error) {
      console.error("Failed to save AI settings:", error);
      toast.error(t("Failed to save settings"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      id="ai"
      className="grid grid-cols-1 gap-x-8 gap-y-10 py-12 md:grid-cols-3"
    >
      <div>
        <h2 className="text-base/7 font-semibold text-text">
          {t("AI Settings")}
        </h2>
        <p className="mt-1 text-sm/6 text-text-tertiary">
          {t("Configure AI-powered features for your notes.")}
        </p>
      </div>

      <form className="md:col-span-2 space-y-8" onSubmit={handleSave}>
        <div>
          <label
            htmlFor="ai-model"
            className="block text-sm/6 font-medium text-text"
          >
            {t("Model")}
          </label>
          <p className="mt-1 text-sm text-text-tertiary">
            {t("Powers chat, search, and study features.")}
          </p>
          <div className="mt-2 sm:max-w-xs">
            <select
              id="ai-model"
              className={`${inputClass} appearance-auto`}
              defaultValue="kimi-k2.5"
              disabled
            >
              <option value="kimi-k2.5">Kimi K2.5</option>
            </select>
          </div>
        </div>

        <div className="border-t border-border pt-6">
          <div className="flex items-center gap-2">
            <h3 className="text-sm/6 font-medium text-text">
              {t("Bring Your Own Key")}
            </h3>
            <span className="inline-flex items-center rounded-md bg-primary-500/10 px-2 py-0.5 text-xs font-medium text-primary-400 ring-1 ring-inset ring-primary-500/20">
              {t("Beta")}
            </span>
          </div>
          <p className="mt-1 text-sm text-text-tertiary">
            {t("Bring Your Own Key is not available yet for beta users.")}
          </p>
        </div>

        <div className="border-t border-border pt-6">
          <div className="flex items-center gap-2">
            <h3 className="text-sm/6 font-medium text-text">
              {t("Canvas In Chat")}
            </h3>
            <span className="inline-flex items-center rounded-md bg-primary-500/10 px-2 py-0.5 text-xs font-medium text-primary-400 ring-1 ring-inset ring-primary-500/20">
              {t("Beta")}
            </span>
          </div>
          <p className="mt-1 text-sm text-text-tertiary">
            {t(
              "Allow AI chat to read your connected Canvas courses, modules, assignments, and file metadata through server-side tools.",
            )}
          </p>
          <div className="mt-4 rounded-radius-lg border border-border-subtle bg-surface/70 p-4">
            <CheckboxField>
              <Checkbox
                color="indigo"
                checked={canvasAccessEnabled}
                onChange={setCanvasAccessEnabled}
              />
              <label data-slot="label" className="text-sm text-text">
                {t("Enable Canvas access in AI chat")}
              </label>
              <p data-slot="description" className="text-xs text-text-tertiary">
                {t(
                  "Canvas tokens stay server-side. Chat only gets filtered Canvas results, never your raw API key.",
                )}
              </p>
            </CheckboxField>
          </div>
        </div>

        <div className="flex">
          <button type="submit" disabled={saving} className={saveBtnClass}>
            {saving ? t("Saving...") : t("Save changes")}
          </button>
        </div>
      </form>
    </div>
  );
}
