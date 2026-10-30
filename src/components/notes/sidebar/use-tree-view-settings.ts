import { useEffect } from "react";
import { toast } from "sonner";
import useI18n from "@/lib/notes/hooks/use-i18n";
import useSettingsStore from "@/lib/notes/state/ui/settings";
import { readTreeViewSettings, type TreeViewSettings } from "@/lib/notes/tree-view-settings";
import type { Settings } from "@/lib/notes/types/settings";

let settingsRequest: Promise<void> | null = null;

// the notes page doesn't load settings up front, so the first reader fetches them once
function loadSettings(setSettings: (settings: Settings) => void): Promise<void> {
  settingsRequest ??= fetch("/api/settings", { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) return;
      const body: Settings = await response.json();
      // a save made while this was in flight wins over the older read
      const current = useSettingsStore.getState().settings;
      setSettings({ ...body, ...current });
    })
    .catch(() => {})
    .finally(() => {
      settingsRequest = null;
    });
  return settingsRequest;
}

export function useTreeViewSettings() {
  const { t } = useI18n();
  const settings = useSettingsStore((state) => state.settings);
  const setSettings = useSettingsStore((state) => state.setSettings);
  // merged server settings always carry a theme, so its absence means nothing has loaded
  const loaded = settings?.theme !== undefined;

  useEffect(() => {
    if (!loaded) void loadSettings(setSettings);
  }, [loaded, setSettings]);

  const view = readTreeViewSettings(settings?.tree_view);

  const save = (patch: Partial<Settings>) => {
    const previous = useSettingsStore.getState().settings;
    setSettings({ ...previous, ...patch });
    void useSettingsStore
      .getState()
      .updateSettings(patch)
      .catch(() => {
        setSettings({ ...useSettingsStore.getState().settings, ...previous });
        toast.error(t("Failed to save settings"));
      });
  };

  return {
    loaded,
    view,
    hintSeen: settings?.tree_view_hint_seen === true,
    updateView: (patch: Partial<TreeViewSettings>) =>
      save({ tree_view: { ...view, ...patch } }),
    dismissHint: () => save({ tree_view_hint_seen: true }),
  };
}
