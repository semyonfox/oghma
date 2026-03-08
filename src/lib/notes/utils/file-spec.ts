import type { FileSpec, FileType } from '@/lib/notes/state/layout.zustand';

interface FileSource {
  id?: string;
  title?: string | null;
  content?: string | null;
}

const PDF_EXTENSIONS = new Set(['pdf']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'avif']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'ogg', 'mov', 'm4v']);

function getExtension(title?: string | null) {
  if (!title) return '';

  const normalized = title.trim().toLowerCase();
  const parts = normalized.split('.');
  return parts.length > 1 ? parts.at(-1) || '' : '';
}

export function inferFileType(title?: string | null): FileType {
  const extension = getExtension(title);

  if (PDF_EXTENSIONS.has(extension)) return 'pdf';
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';

  return 'note';
}

export function buildFileSpec(source: FileSource): FileSpec {
  return {
    fileId: source.id || '',
    fileType: inferFileType(source.title),
    title: source.title || undefined,
    sourcePath: source.content || undefined,
  };
}

export function extractTags(content?: string | null): string[] {
  if (!content) return [];

  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  const frontmatterTags = frontmatterMatch?.[1]
    ? Array.from(
        frontmatterMatch[1]
          .matchAll(/^(?:tags?|keywords?)\s*:\s*(.+)$/gim),
        (match) => match[1]
      )
        .flatMap((raw) => raw.split(/[,\[\]]/))
        .map((tag) => tag.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean)
    : [];

  const hashtagTags = Array.from(content.matchAll(/(^|\s)#([a-z0-9][\w/-]*)/gi), (match) =>
    match[2].toLowerCase()
  );

  return Array.from(new Set([...frontmatterTags, ...hashtagTags]));
}
