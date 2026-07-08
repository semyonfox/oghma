"use client";

import { toast } from "sonner";
import {
  ComputerDesktopIcon,
  SunIcon,
  MoonIcon,
} from "@heroicons/react/24/outline";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { useSettingsStore } from "@/lib/notes/state/ui/settings";
import { saveBtnClass, cn } from "./settings-utils";
import {
  EDITOR_WIDTH_OPTIONS,
  getEditorSizeFromIndex,
  getEditorWidthIndex,
  normalizeEditorSize,
} from "@/lib/notes/editor-width";

export default function EditorThemeSection({
  formState,
  setFormState,
  savingSection,
  setSavingSection,
}) {
  const { t } = useI18n();
  const { updateSettings } = useSettingsStore();
  const editorWidth = normalizeEditorSize(formState.editorWidth);
  const editorWidthIndex = getEditorWidthIndex(editorWidth);
  const editorWidthOption = EDITOR_WIDTH_OPTIONS[editorWidthIndex];

  // theme persists immediately on change — no Save needed
  const handleThemeChange = (value) => {
    setFormState((prev) => ({ ...prev, theme: value }));
    try {
      localStorage.setItem("ogma-theme", value);
      document.cookie = `ogma-theme=${value}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      /* ignore storage errors */
    }
    updateSettings({ theme: value }).catch(() => {});
  };

  const handleEditorSettingsSave = async (e) => {
    e.preventDefault();
    setSavingSection("editor");
    try {
      await updateSettings({
        theme: formState.theme,
        editorsize: normalizeEditorSize(formState.editorWidth),
      });
      localStorage.setItem("ogma-theme", formState.theme);
      toast.success(t("Editor settings saved"));
    } catch (error) {
      console.error("Failed to save editor settings:", error);
      toast.error(t("Failed to save settings"));
    } finally {
      setSavingSection(null);
    }
  };

  return (
    <div
      id="editor"
      className="grid grid-cols-1 gap-x-8 gap-y-10 py-12 md:grid-cols-3"
    >
      <div>
        <h2 className="text-base/7 font-semibold text-text">
          {t("Editor & Theme")}
        </h2>
        <p className="mt-1 text-sm/6 text-text-tertiary">
          {t("Customize your note editor appearance and behavior.")}
        </p>
      </div>

      <form className="md:col-span-2" onSubmit={handleEditorSettingsSave}>
        <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:max-w-xl">
          {/* theme */}
          <div>
            <label className="block text-sm/6 font-medium text-text mb-1">
              {t("Theme")}
            </label>
            <p className="text-xs text-text-tertiary mb-3">
              {t(
                "Choose how OghmaNotes looks. System follows your device setting.",
              )}
            </p>
            <div className="inline-flex gap-1 rounded-radius-lg border border-border-subtle bg-surface p-1">
              {[
                {
                  label: t("System"),
                  value: "system",
                  icon: ComputerDesktopIcon,
                },
                { label: t("Light"), value: "light", icon: SunIcon },
                { label: t("Dark"), value: "dark", icon: MoonIcon },
              ].map((opt) => {
                const active = formState.theme === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleThemeChange(opt.value)}
                    aria-pressed={active}
                    className={cn(
                      "flex items-center gap-2 rounded-radius-md px-3 py-1.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary-600 text-text-on-primary"
                        : "text-text-secondary hover:bg-subtle",
                    )}
                  >
                    <opt.icon className="h-4 w-4" aria-hidden="true" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* editor width */}
          <div>
            <label className="block text-sm/6 font-medium text-text mb-1">
              {t("Editor Width")}
            </label>
            <p className="text-xs text-text-tertiary mb-3">
              {t(
                "Controls the max width of the note editor. Can also be overridden per note.",
              )}
            </p>
            <div className="max-w-lg">
              <div className="mb-3 flex items-baseline justify-between gap-4">
                <span className="text-sm font-medium text-text">
                  {t(editorWidthOption.label)}
                </span>
                <span className="text-xs text-text-tertiary">
                  {t(editorWidthOption.detail)}
                </span>
              </div>
              <input
                type="range"
                name="editor-width"
                min="0"
                max={EDITOR_WIDTH_OPTIONS.length - 1}
                step="1"
                value={editorWidthIndex}
                aria-label={t("Editor Width")}
                aria-valuetext={`${t(editorWidthOption.label)} ${t(
                  editorWidthOption.detail,
                )}`}
                onChange={(e) =>
                  setFormState((prev) => ({
                    ...prev,
                    editorWidth: getEditorSizeFromIndex(e.target.value),
                  }))
                }
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-border-subtle accent-primary-500 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary-500 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary-500"
              />
              <div className="mt-2 grid grid-cols-4 text-[11px] font-medium text-text-tertiary">
                {EDITOR_WIDTH_OPTIONS.map((size, index) => (
                  <span
                    key={size.value}
                    className={cn(
                      index === 0 && "text-left",
                      index > 0 &&
                        index < EDITOR_WIDTH_OPTIONS.length - 1 &&
                        "text-center",
                      index === EDITOR_WIDTH_OPTIONS.length - 1 && "text-right",
                      editorWidth === size.value && "text-text-secondary",
                    )}
                  >
                    {t(size.label)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex">
          <button
            type="submit"
            disabled={savingSection === "editor"}
            className={saveBtnClass}
          >
            {savingSection === "editor" ? t("Saving...") : t("Save changes")}
          </button>
        </div>
      </form>
    </div>
  );
}
