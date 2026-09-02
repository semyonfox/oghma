import type { FileSpec, FileType, PaneId } from '@/lib/notes/state/layout.zustand';

export const FILE_DRAG_MIME = 'application/x-oghmanotes-file';

export interface FileDragPayload {
  file: FileSpec;
  sourcePane?: PaneId;
}

interface FileSource {
  id?: string;
  title?: string | null;
  content?: string | null;
  s3Key?: string | null;
  mimeType?: string | null;
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

export function inferFileType(title?: string | null, mimeType?: string | null): FileType {
  const normalizedMimeType = mimeType?.trim().toLowerCase();
  if (normalizedMimeType === 'application/pdf') return 'pdf';
  if (normalizedMimeType?.startsWith('image/')) return 'image';
  if (normalizedMimeType?.startsWith('video/')) return 'video';

  const extension = getExtension(title);

  if (PDF_EXTENSIONS.has(extension)) return 'pdf';
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';

  return 'note';
}

export function buildFileSpec(source: FileSource): FileSpec {
  const fileType = inferFileType(source.title, source.mimeType);
  // for PDFs/media, prefer s3Key over content (Canvas imports store path in s3Key, not content)
  const sourcePath = fileType !== 'note'
    ? (source.s3Key || source.content || undefined)
    : (source.content || undefined);

  return {
    fileId: source.id || '',
    fileType,
    title: source.title || undefined,
    sourcePath,
  };
}

export function parseFileDragPayload(raw: string): FileDragPayload | null {
  if (!raw) return null;

  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || !('file' in value)) return null;

    const file = value.file;
    if (typeof file !== 'object' || file === null) return null;

    const candidate = file as Record<string, unknown>;
    if (
      typeof candidate.fileId !== 'string' ||
      candidate.fileId.length === 0 ||
      (candidate.fileType !== 'note' &&
        candidate.fileType !== 'pdf' &&
        candidate.fileType !== 'image' &&
        candidate.fileType !== 'video') ||
      (candidate.title !== undefined && typeof candidate.title !== 'string') ||
      (candidate.sourcePath !== undefined && typeof candidate.sourcePath !== 'string') ||
      (candidate.editMode !== undefined && typeof candidate.editMode !== 'boolean') ||
      (candidate.lastOpened !== undefined && typeof candidate.lastOpened !== 'number')
    ) {
      return null;
    }

    const sourcePane = 'sourcePane' in value ? value.sourcePane : undefined;
    if (sourcePane !== undefined && sourcePane !== 'A' && sourcePane !== 'B') return null;

    return { file: file as FileSpec, sourcePane };
  } catch {
    return null;
  }
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
