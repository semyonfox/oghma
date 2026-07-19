// extracted from Notea (MIT License)
import { Locale } from "@/locales";
import {
  DEFAULT_EDITOR_SIZE,
  type EditorSize,
} from "@/lib/notes/editor-width";

export interface Settings {
  sidebar_is_fold?: boolean;
  split_sizes?: [number, number];
  locale?: Locale;
  theme?: "light" | "dark" | "system";
  daily_root_id?: string;
  firstName?: string;
  lastName?: string;
  timezone?: string;
  editorsize?: EditorSize;
  ai_canvas_access?: boolean;
  ai_model?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  sidebar_is_fold: false,
  split_sizes: [200, 800],
  locale: Locale.EN,
  theme: "system",
  editorsize: DEFAULT_EDITOR_SIZE,
  ai_canvas_access: false,
};
