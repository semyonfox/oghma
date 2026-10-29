// extracted from Notea (MIT License)
import type { Locale } from "@/locales";
import {
  DEFAULT_EDITOR_SIZE,
  type EditorSize,
} from "@/lib/notes/editor-width";
import type { TreeViewSettings } from "@/lib/notes/tree-view-settings";

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
  tree_view?: Partial<TreeViewSettings>;
  /** the one-off pointer to the View menu after the first Canvas import */
  tree_view_hint_seen?: boolean;
}

/**
 * Settings persisted by the storage provider. Unknown legacy keys are kept
 * when settings are updated; known keys remain typed at the application edge.
 */
export interface StoredSettings extends Settings {
  avatarKey?: string;
  [key: string]: unknown;
}

/**
 * `locale` is deliberately absent. Defaulting it would make an account that
 * never chose a language indistinguishable from one that chose English, and
 * the client uses that difference to keep a language picked before signing in.
 */
export const DEFAULT_SETTINGS: Settings = {
  sidebar_is_fold: false,
  split_sizes: [200, 800],
  theme: "system",
  editorsize: DEFAULT_EDITOR_SIZE,
  ai_canvas_access: false,
};
