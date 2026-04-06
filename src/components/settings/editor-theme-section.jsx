"use client";

import { toast } from "sonner";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { useSettingsStore } from "@/lib/notes/state/ui/settings";
import { saveBtnClass } from "./settings-utils";

export default function EditorThemeSection({
  formState,
  setFormState,
  savingSection,
  setSavingSection,
}) {
  const { t } = useI18n();
  const { updateSettings } = useSettingsStore();

  const handleEditorSettingsSave = async (e) => {
    e.preventDefault();
    setSavingSection("editor");
    try {
      await updateSettings({
        theme: formState.theme,
        editorsize: formState.editorWidth === "small" ? "small" : "large",
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
            <label className="block text-sm/6 font-medium text-text mb-3">
              {t("Theme")}
            </label>
            <div className="flex gap-3">
              {[{ label: t("Dark"), value: "dark" }].map((theme) => (
                <label
                  key={theme.value}
                  className="flex items-center cursor-pointer"
                >
                  <input
                    type="radio"
                    name="theme"
                    value={theme.value}
                    checked={formState.theme === theme.value}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        theme: e.target.value,
                      }))
                    }
                    className="mr-2 accent-primary-500"
                  />
                  <span className="text-sm text-text-secondary">
                    {theme.label}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-text-tertiary mt-2">
              {t("Dark theme is enabled for beta users right now.")}
            </p>
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
            <div className="flex gap-3">
              {[
                { label: t("Small"), value: "small" },
                { label: t("Large"), value: "large" },
              ].map((size) => (
                <label
                  key={size.value}
                  className="flex items-center cursor-pointer"
                >
                  <input
                    type="radio"
                    name="editor-width"
                    value={size.value}
                    checked={formState.editorWidth === size.value}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        editorWidth: e.target.value,
                      }))
                    }
                    className="mr-2 accent-primary-500"
                  />
                  <span className="text-sm text-text-secondary">
                    {size.label}
                  </span>
                </label>
              ))}
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
