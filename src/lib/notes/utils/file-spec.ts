import type { FileSpec, FileType, PaneId } from '@/lib/notes/state/layout';

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

const TEXT_EXTENSIONS = new Set([
  'txt', 'java', 'py', 'js', 'jsx', 'ts', 'tsx', 'c', 'h', 'cpp', 'hpp',
  'cc', 'cs', 'go', 'rs', 'rb', 'php', 'swift', 'kt', 'kts', 'scala',
  'sh', 'bash', 'zsh', 'sql', 'json', 'jsonl', 'yaml', 'yml', 'toml',
  'xml', 'html', 'htm', 'css', 'scss', 'sass', 'less', 'csv', 'tsv',
  'log', 'ini', 'cfg', 'conf', 'r', 'tex', 'm', 'asm', 's',
]);
const TEXT_MIME_TYPES = new Set([
  'application/json', 'application/ld+json', 'application/xml',
  'application/javascript', 'application/x-javascript', 'application/typescript',
  'application/x-sh', 'application/x-httpd-php', 'application/yaml',
]);
const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown']);

const PDF_EXTENSIONS = new Set(['pdf']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'avif']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'ogg', 'mov', 'm4v']);

function getExtension(title?: string | null) {
  if (!title) return '';

  const normalized = title.trim().toLowerCase();
  const parts = normalized.split('.');
  return parts.length > 1 ? parts.at(-1) || '' : '';
}

export function inferFileType(
  title?: string | null,
  mimeType?: string | null,
  s3Key?: string | null,
): FileType {
  const normalizedMimeType = mimeType?.split(';')[0].trim().toLowerCase();
  if (normalizedMimeType === 'application/pdf') return 'pdf';
  if (normalizedMimeType?.startsWith('image/')) return 'image';
  if (normalizedMimeType?.startsWith('video/')) return 'video';

  // stored filenames survive title edits and older imports may lack MIME metadata
  const extension = getExtension(s3Key?.split('/').at(-1)) || getExtension(title);

  if (PDF_EXTENSIONS.has(extension)) return 'pdf';
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';

  if (s3Key) {
    if (normalizedMimeType === 'text/markdown' || normalizedMimeType === 'text/x-markdown'
      || MARKDOWN_EXTENSIONS.has(extension)) return 'note';
    if (normalizedMimeType?.startsWith('text/')
      || TEXT_MIME_TYPES.has(normalizedMimeType || '')
      || TEXT_EXTENSIONS.has(extension)) return 'text';
    return 'attachment';
  }

  return 'note';
}

export function buildFileSpec(source: FileSource): FileSpec {
  const fileType = inferFileType(source.title, source.mimeType, source.s3Key);
  // original files live in object storage; note content may be empty or extracted text
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
        candidate.fileType !== 'video' &&
        candidate.fileType !== 'text' &&
        candidate.fileType !== 'attachment') ||
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
