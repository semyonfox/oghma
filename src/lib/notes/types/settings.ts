// extracted from Notea (MIT License)
import { EDITOR_SIZE } from './meta';
import { Locale } from '@/locales';

export interface Settings {
  sidebar_is_fold?: boolean;
  split_sizes?: [number, number];
  editorsize?: EDITOR_SIZE;
  locale?: Locale;
  theme?: 'light' | 'dark' | 'system';
  daily_root_id?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  sidebar_is_fold: false,
  split_sizes: [200, 800],
  editorsize: EDITOR_SIZE.LARGE,
  locale: Locale.EN,
  theme: 'system',
};
