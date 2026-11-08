"use client";

import {
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import useI18n from "@/lib/notes/hooks/use-i18n";
import { useSettingsStore } from "@/lib/notes/state/ui/settings";
import type { FormState } from "./account-section";
import { saveBtnClass, cn, unsavedChipClass } from "./settings-utils";
import {
  SettingsCard,
  SettingsCardBody,
  SettingsCardFooter,
} from "./settings-card";
import {
  EDITOR_WIDTH_OPTIONS,
  normalizeEditorSize,
} from "@/lib/notes/editor-width";

type EditorSettings = Pick<FormState, "theme" | "editorWidth">;

type Props = {
  formState: FormState;
  setFormState: Dispatch<SetStateAction<FormState>>;
  savingSection: string | null;
  setSavingSection: Dispatch<SetStateAction<string | null>>;
  hasChanges: boolean;
  onSaved?: (savedSettings: EditorSettings) => void;
};

export default function EditorThemeSection({
  formState,
  setFormState,
  savingSection,
  setSavingSection,
  hasChanges,
  onSaved,
}: Props) {
  const { t } = useI18n();
  const { updateSettings } = useSettingsStore();
  const editorWidth = normalizeEditorSize(formState.editorWidth);

  // Preview theme changes immediately, but persist them with the rest of this
  // section so the Save button has one clear meaning.
  const handleThemeChange = (value: FormState["theme"]) => {
    setFormState((prev) => ({ ...prev, theme: value }));
  };

  const handleEditorSettingsSave = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSavingSection("editor");
    const run = async () => {
      const savedSettings = await updateSettings({
        theme: formState.theme,
        editorsize: normalizeEditorSize(formState.editorWidth),
      });
      onSaved?.({
        theme: savedSettings.theme ?? formState.theme,
        editorWidth: normalizeEditorSize(
          savedSettings.editorsize ?? formState.editorWidth,
        ),
      });
      toast.success(t("Editor settings saved"));
    };
    await run()
      .catch((error: unknown) => {
        console.error("Failed to save editor settings:", error);
        toast.error(t("Failed to save settings"));
      })
      .finally(() => {
        setSavingSection(null);
      });
  };

  const themeOptions: Array<{
    label: string;
    value: FormState["theme"];
    preview: ReactNode;
  }> = [
    {
      label: t("System"),
      value: "system",
      preview: (
        <span className="flex h-9 w-full overflow-hidden rounded-radius-sm ring-1 ring-border">
          <span className="w-1/2 bg-neutral-100" />
          <span className="w-1/2 bg-neutral-900" />
        </span>
      ),
    },
    {
      label: t("Light"),
      value: "light",
      preview: (
        <span className="block h-9 w-full rounded-radius-sm bg-neutral-100 ring-1 ring-border" />
      ),
    },
    {
      label: t("Dark"),
      value: "dark",
      preview: (
        <span className="block h-9 w-full rounded-radius-sm bg-neutral-900 ring-1 ring-border" />
      ),
    },
  ];

  // Selection is a ring, not a border, so choosing a tile never shifts layout.
  const tileClass = (active: boolean) =>
    cn(
      "flex min-h-11 flex-col items-center justify-center gap-1.5 rounded-radius-lg bg-surface p-2 text-sm transition-shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
      active
        ? "font-semibold text-text ring-2 ring-accent"
        : "font-medium text-text-secondary ring-1 ring-border hover:ring-border-strong",
    );

  return (
    <SettingsCard
      id="editor"
      title={t("Editor & Theme")}
      description={t("Customize your note editor appearance and behavior.")}
      aside={
        hasChanges ? (
          <span className={unsavedChipClass} role="status">
            {t("Unsaved")}
          </span>
        ) : null
      }
    >
      <form onSubmit={handleEditorSettingsSave}>
        <SettingsCardBody>
          <div className="grid grid-cols-1 gap-x-6 gap-y-6 md:grid-cols-2">
            {/* theme */}
            <div>
              <p
                id="settings-theme-label"
                className="block text-sm/6 font-medium text-text"
              >
                {t("Theme")}
              </p>
              <p className="mb-3 text-xs text-text-tertiary">
                {t(
                  "Choose how OghmaNotes looks. System follows your device setting.",
                )}
              </p>
              <div
                role="group"
                aria-labelledby="settings-theme-label"
                className="grid grid-cols-3 gap-2"
              >
                {themeOptions.map((opt) => {
                  const active = formState.theme === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleThemeChange(opt.value)}
                      aria-pressed={active}
                      className={tileClass(active)}
                    >
                      {opt.preview}
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* editor width */}
            <div>
              <p
                id="settings-editor-width-label"
                className="block text-sm/6 font-medium text-text"
              >
                {t("Editor Width")}
              </p>
              <p className="mb-3 text-xs text-text-tertiary">
                {t(
                  "Controls the max width of the note editor. Can also be overridden per note.",
                )}
              </p>
              <div
                role="group"
                aria-labelledby="settings-editor-width-label"
                className="grid grid-cols-2 gap-2"
              >
                {EDITOR_WIDTH_OPTIONS.map((size) => {
                  const active = editorWidth === size.value;
                  return (
                    <button
                      key={size.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setFormState((prev) => ({
                          ...prev,
                          editorWidth: size.value,
                        }))
                      }
                      className={cn(tileClass(active), "min-h-14 gap-0.5")}
                    >
                      <span>{t(size.label)}</span>
                      <span className="font-mono text-[11px] font-normal text-text-tertiary">
                        {t(size.detail)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </SettingsCardBody>
        <SettingsCardFooter>
          <button
            type="submit"
            disabled={savingSection !== null || !hasChanges}
            className={saveBtnClass}
          >
            {savingSection === "editor" ? t("Saving...") : t("Save changes")}
          </button>
        </SettingsCardFooter>
      </form>
    </SettingsCard>
  );
}
