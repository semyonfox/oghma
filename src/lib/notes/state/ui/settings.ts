// extracted from Notea (MIT License)
import { create } from "zustand";
import { Settings } from "@/lib/notes/types/settings";

/**
 * Carries the HTTP status so callers can tell an expected signed-out save
 * (401 on public pages) apart from a real failure worth surfacing.
 */
export class SettingsRequestError extends Error {
  readonly status: number;

  constructor(status: number) {
    super("failed to save settings");
    this.name = "SettingsRequestError";
    this.status = status;
  }
}

interface SettingsStore {
  settings: Settings;
  setSettings: (settings: Settings) => void;
  updateSettings: (body: Partial<Settings>) => Promise<Settings>;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: {} as Settings,
  setSettings: (settings) => set({ settings }),
  updateSettings: async (body: Partial<Settings>) => {
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new SettingsRequestError(response.status);
    }

    const savedSettings = await response.json();
    set({ settings: savedSettings });
    return savedSettings;
  },
}));

export default useSettingsStore;
