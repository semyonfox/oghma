// extracted from Notea (MIT License)
// original: libs/web/utils/markdown.ts

import rm from 'remove-markdown';

export const removeMarkdown = (markdown?: string) => {
  return rm(markdown || '').replace(/\\/g, '');
};
