"use client";

import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { useSettingsStore } from "@/lib/notes/state/ui/settings";
import * as Headless from "@headlessui/react";
import {
  cn,
  inputClass,
  neutralChipClass,
  saveBtnClass,
  unsavedChipClass,
} from "./settings-utils";
import {
  SettingsCard,
  SettingsCardBody,
  SettingsCardFooter,
} from "./settings-card";

const FALLBACK_ACTIVE_MODEL = "deepseek/deepseek-v4-flash";

export default function AISection() {
  const { t } = useI18n();
  const settings = useSettingsStore((state) => state.settings);
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const [canvasAccessEnabled, setCanvasAccessEnabled] = useState(false);
  const [savedCanvasAccessEnabled, setSavedCanvasAccessEnabled] =
    useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const activeModel =
    typeof settings?.ai_model === "string" && settings.ai_model.trim()
      ? settings.ai_model.trim()
      : FALLBACK_ACTIVE_MODEL;

  useEffect(() => {
    if (typeof settings?.ai_canvas_access !== "boolean") return;
    setCanvasAccessEnabled(settings.ai_canvas_access);
    setSavedCanvasAccessEnabled(settings.ai_canvas_access);
  }, [settings?.ai_canvas_access]);

  const hasChanges =
    savedCanvasAccessEnabled !== null &&
    canvasAccessEnabled !== savedCanvasAccessEnabled;

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hasChanges) return;
    setSaving(true);
    const run = async () => {
      const savedSettings = await updateSettings({
        ai_canvas_access: canvasAccessEnabled,
      });
      setSavedCanvasAccessEnabled(
        typeof savedSettings?.ai_canvas_access === "boolean"
          ? savedSettings.ai_canvas_access
          : canvasAccessEnabled,
      );
      toast.success(t("AI settings saved"));
    };
    await run()
      .catch((error: unknown) => {
        console.error("Failed to save AI settings:", error);
        toast.error(t("Failed to save settings"));
      })
      .finally(() => {
        setSaving(false);
      });
  };

  return (
    <SettingsCard
      id="ai"
      title={t("AI Settings")}
      description={t("Configure AI-powered features for your notes.")}
      aside={
        hasChanges ? (
          <span className={unsavedChipClass} role="status">
            {t("Unsaved")}
          </span>
        ) : null
      }
    >
      <form onSubmit={handleSave}>
        <SettingsCardBody className="space-y-5">
          <div>
            <label
              htmlFor="ai-model"
              className="block text-sm/6 font-medium text-text"
            >
              {t("Model")}
            </label>
            <p className="text-xs text-text-tertiary">
              {t("Powers chat, search, and study features.")}
            </p>
            <div className="mt-2">
              <input
                id="ai-model"
                className={cn(inputClass, "font-mono")}
                value={activeModel}
                readOnly
              />
            </div>
            <p className="mt-1.5 text-xs text-text-tertiary">
              {t("Server-managed during beta.")}
            </p>
          </div>

          <div className="rounded-radius-lg border border-dashed border-border-strong px-4 py-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm/6 font-medium text-text">
                {t("Bring Your Own Key")}
              </h3>
              <span className={neutralChipClass}>{t("Beta")}</span>
            </div>
            <p className="mt-0.5 text-xs text-text-tertiary">
              {t(
                "Bring Your Own Key and per-user model selection are not available yet for beta users.",
              )}
            </p>
          </div>

          <div className="border-t border-border-subtle pt-5">
            <div className="flex items-center gap-2">
              <h3 className="text-sm/6 font-medium text-text">
                {t("Canvas In Chat")}
              </h3>
              <span className={neutralChipClass}>{t("Beta")}</span>
            </div>
            <p className="mt-0.5 text-xs text-text-tertiary">
              {t(
                "Allow AI chat to read your connected Canvas courses, modules, assignments, and file metadata through server-side tools.",
              )}
            </p>
            <Headless.Field className="mt-3 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Headless.Label className="block text-sm text-text">
                  {t("Enable Canvas access in AI chat")}
                </Headless.Label>
                <Headless.Description className="text-xs text-text-tertiary">
                  {t(
                    "Canvas tokens stay server-side. Chat only gets filtered Canvas results, never your raw API key.",
                  )}
                </Headless.Description>
              </div>
              {/* A checkbox drawn as a switch: on = action, off = strong border. */}
              <Headless.Checkbox
                checked={canvasAccessEnabled}
                onChange={setCanvasAccessEnabled}
                className="group relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full bg-border-strong p-0.5 transition-colors focus:outline-hidden data-checked:bg-action data-focus:outline-2 data-focus:outline-offset-2 data-focus:outline-accent"
              >
                <span
                  aria-hidden="true"
                  className="size-5 rounded-full bg-surface shadow-raised transition-transform group-data-checked:translate-x-5"
                />
              </Headless.Checkbox>
            </Headless.Field>
          </div>
        </SettingsCardBody>
        <SettingsCardFooter>
          <button
            type="submit"
            disabled={saving || !hasChanges}
            className={saveBtnClass}
          >
            {saving ? t("Saving...") : t("Save changes")}
          </button>
        </SettingsCardFooter>
      </form>
    </SettingsCard>
  );
}
