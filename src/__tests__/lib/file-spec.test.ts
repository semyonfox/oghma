import { describe, it, expect } from 'vitest';
import { inferFileType, buildFileSpec, extractTags } from '@/lib/notes/utils/file-spec';

describe('inferFileType', () => {
    it('returns "pdf" for .pdf files', () => {
        expect(inferFileType('lecture.pdf')).toBe('pdf');
        expect(inferFileType('NOTES.PDF')).toBe('pdf');
    });

    it('returns "image" for image extensions', () => {
        expect(inferFileType('photo.png')).toBe('image');
        expect(inferFileType('banner.jpg')).toBe('image');
        expect(inferFileType('icon.svg')).toBe('image');
        expect(inferFileType('pic.webp')).toBe('image');
        expect(inferFileType('frame.avif')).toBe('image');
    });

    it('returns "video" for video extensions', () => {
        expect(inferFileType('clip.mp4')).toBe('video');
        expect(inferFileType('screen.webm')).toBe('video');
        expect(inferFileType('recording.mov')).toBe('video');
    });

    it('returns "note" for markdown and unknown extensions', () => {
        expect(inferFileType('readme.md')).toBe('note');
        expect(inferFileType('data.json')).toBe('note');
        expect(inferFileType('My Note')).toBe('note');
    });

    it('returns "note" for null/undefined/empty title', () => {
        expect(inferFileType(null)).toBe('note');
        expect(inferFileType(undefined)).toBe('note');
        expect(inferFileType('')).toBe('note');
    });

    it('handles titles with multiple dots', () => {
        expect(inferFileType('my.lecture.notes.pdf')).toBe('pdf');
    });
});

describe('buildFileSpec', () => {
    it('builds a note file spec from content', () => {
        const spec = buildFileSpec({ id: '1', title: 'My Note', content: '# Hello' });
        expect(spec.fileId).toBe('1');
        expect(spec.fileType).toBe('note');
        expect(spec.sourcePath).toBe('# Hello');
    });

    it('builds a PDF file spec preferring s3Key', () => {
        const spec = buildFileSpec({ id: '2', title: 'doc.pdf', content: 'fallback', s3Key: 'uploads/doc.pdf' });
        expect(spec.fileType).toBe('pdf');
        expect(spec.sourcePath).toBe('uploads/doc.pdf');
    });

    it('falls back to content for media when s3Key is missing', () => {
        const spec = buildFileSpec({ id: '3', title: 'pic.png', content: '/path/to/pic.png' });
        expect(spec.fileType).toBe('image');
        expect(spec.sourcePath).toBe('/path/to/pic.png');
    });

    it('handles missing id and title', () => {
        const spec = buildFileSpec({});
        expect(spec.fileId).toBe('');
        expect(spec.title).toBeUndefined();
        expect(spec.fileType).toBe('note');
    });
});

describe('extractTags', () => {
    it('extracts hashtags from content', () => {
        const tags = extractTags('This is a #test note with #javascript');
        expect(tags).toContain('test');
        expect(tags).toContain('javascript');
    });

    it('extracts tags from YAML frontmatter', () => {
        const content = `---
tags: biology, chemistry
---
# Notes`;
        const tags = extractTags(content);
        expect(tags).toContain('biology');
        expect(tags).toContain('chemistry');
    });

    it('deduplicates tags', () => {
        const tags = extractTags('#react and more #react content');
        const reactCount = tags.filter(t => t === 'react').length;
        expect(reactCount).toBe(1);
    });

    it('returns empty array for null/empty content', () => {
        expect(extractTags(null)).toEqual([]);
        expect(extractTags('')).toEqual([]);
        expect(extractTags(undefined)).toEqual([]);
    });

    it('handles frontmatter with keyword: alias', () => {
        const content = `---
keywords: algo, data-structures
---
content here`;
        const tags = extractTags(content);
        expect(tags).toContain('algo');
        expect(tags).toContain('data-structures');
    });

    it('combines frontmatter and hashtag sources', () => {
        const content = `---
tags: math
---
Some #physics notes`;
        const tags = extractTags(content);
        expect(tags).toContain('math');
        expect(tags).toContain('physics');
    });
});
