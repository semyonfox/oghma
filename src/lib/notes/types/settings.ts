// extracted from Notea (MIT License)
import { Locale } from "@/locales";

export interface Settings {
  sidebar_is_fold?: boolean;
  split_sizes?: [number, number];
  locale?: Locale;
  theme?: "light" | "dark" | "system";
  daily_root_id?: string;
  firstName?: string;
  lastName?: string;
  timezone?: string;
  editorsize?: "small" | "large";
}

export const DEFAULT_SETTINGS: Settings = {
  sidebar_is_fold: false,
  split_sizes: [200, 800],
  locale: Locale.EN,
  theme: "system",
};
