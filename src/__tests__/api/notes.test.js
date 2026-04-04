/**
 * Notes API route tests
 *
 * Strategy: mock the DB (pgsql) and auth (validateSession) at the module level,
 * then import the route handlers and call them directly with synthetic Requests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- mocks must be hoisted above imports ---

vi.mock('@/database/pgsql.js', () => {
    const sqlMock = vi.fn();
    sqlMock.mockResolvedValue([]);
    return { default: sqlMock };
});

vi.mock('@/lib/auth.js', () => ({
    validateSession: vi.fn(),
    createSuccessResponse: vi.fn(),
    createErrorResponse: vi.fn(),
    createValidationErrorResponse: vi.fn(),
    parseJsonBody: vi.fn(),
    generateJWTToken: vi.fn(),
    verifyJWTToken: vi.fn(),
    createSessionCookie: vi.fn(),
    clearSessionCookie: vi.fn(),
    createAuthSession: vi.fn(),
}));

vi.mock('@/lib/notes/storage/pg-tree.js', () => ({
    addNoteToTree: vi.fn().mockResolvedValue(undefined),
    removeNoteFromTree: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/notes/storage/pdf-annotations.js', () => ({
    deleteNoteAnnotations: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/uuid-validation.js', () => ({
    isValidUUID: vi.fn().mockReturnValue(true),
}));

vi.mock('@/lib/utils/uuid', () => ({
    generateUUID: vi.fn().mockReturnValue('00000000-0000-0000-0000-000000000001'),
}));

vi.mock('@/lib/notes/utils/filter-fields', () => ({
    filterNoteFields: vi.fn((note) => note),
}));

import { GET as notesGET, POST as notesPOST } from '@/app/api/notes/route.js';
import { GET as noteGET, PUT as notePUT, DELETE as noteDELETE } from '@/app/api/notes/[id]/route.js';
import { validateSession } from '@/lib/auth.js';
import sql from '@/database/pgsql.js';

const MOCK_USER = { user_id: 'user-uuid-1', email: 'test@example.com' };

const NOTE_ROW = {
    note_id: 'note-uuid-1',
    title: 'Test Note',
    content: '# Hello',
    is_folder: false,
    deleted: 0,
    shared: 0,
    pinned: 0,
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01'),
};

function makeRequest(method, url, body) {
    const init = { method };
    if (body) {
        init.body = JSON.stringify(body);
        init.headers = { 'Content-Type': 'application/json' };
    }
    return new Request(url, init);
}

beforeEach(() => {
    vi.clearAllMocks();
    validateSession.mockResolvedValue(MOCK_USER);
    sql.mockResolvedValue([]);
});

// ─── GET /api/notes ────────────────────────────────────────────────────────

describe('GET /api/notes', () => {
    it('returns 401 when not authenticated', async () => {
        validateSession.mockResolvedValue(null);
        const req = makeRequest('GET', 'http://localhost/api/notes');
        const res = await notesGET(req);
        expect(res.status).toBe(401);
    });

    it('returns empty array when user has no notes', async () => {
        sql.mockResolvedValue([]);
        const req = makeRequest('GET', 'http://localhost/api/notes');
        const res = await notesGET(req);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual([]);
    });

    it('returns mapped notes for authenticated user', async () => {
        sql.mockResolvedValue([NOTE_ROW]);
        const req = makeRequest('GET', 'http://localhost/api/notes');
        const res = await notesGET(req);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toHaveLength(1);
        expect(body[0].id).toBe('note-uuid-1');
        expect(body[0].title).toBe('Test Note');
        expect(body[0].isFolder).toBe(false);
    });
});

// ─── POST /api/notes ───────────────────────────────────────────────────────

describe('POST /api/notes', () => {
    it('returns 401 when not authenticated', async () => {
        validateSession.mockResolvedValue(null);
        const req = makeRequest('POST', 'http://localhost/api/notes', { title: 'New Note' });
        const res = await notesPOST(req);
        expect(res.status).toBe(401);
    });

    it('creates a note and returns 201', async () => {
        sql.mockResolvedValue([NOTE_ROW]);
        const req = makeRequest('POST', 'http://localhost/api/notes', { title: 'Test Note', content: '# Hello' });
        const res = await notesPOST(req);
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.id).toBe('note-uuid-1');
        expect(body.title).toBe('Test Note');
    });

    it('creates a folder when isFolder=true', async () => {
        const folderRow = { ...NOTE_ROW, is_folder: true, title: 'New Folder' };
        sql.mockResolvedValue([folderRow]);
        const req = makeRequest('POST', 'http://localhost/api/notes', { isFolder: true });
        const res = await notesPOST(req);
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.isFolder).toBe(true);
    });
});

// ─── GET /api/notes/[id] ──────────────────────────────────────────────────

describe('GET /api/notes/[id]', () => {
    it('returns 401 when not authenticated', async () => {
        validateSession.mockResolvedValue(null);
        const req = makeRequest('GET', 'http://localhost/api/notes/note-uuid-1');
        const res = await noteGET(req, { params: Promise.resolve({ id: 'note-uuid-1' }) });
        expect(res.status).toBe(401);
    });

    it('returns 404 when note does not exist', async () => {
        sql.mockResolvedValue([]);
        const req = makeRequest('GET', 'http://localhost/api/notes/note-uuid-1');
        const res = await noteGET(req, { params: Promise.resolve({ id: 'note-uuid-1' }) });
        expect(res.status).toBe(404);
    });

    it('returns the note when found', async () => {
        sql.mockResolvedValue([NOTE_ROW]);
        const req = makeRequest('GET', 'http://localhost/api/notes/note-uuid-1');
        const res = await noteGET(req, { params: Promise.resolve({ id: 'note-uuid-1' }) });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.id).toBe('note-uuid-1');
    });
});

// ─── PUT /api/notes/[id] ──────────────────────────────────────────────────

describe('PUT /api/notes/[id]', () => {
    it('returns 404 when note does not exist', async () => {
        sql.mockResolvedValue([]);
        const req = makeRequest('PUT', 'http://localhost/api/notes/note-uuid-1', { title: 'Updated' });
        const res = await notePUT(req, { params: Promise.resolve({ id: 'note-uuid-1' }) });
        expect(res.status).toBe(404);
    });

    it('updates and returns the note', async () => {
        const updatedRow = { ...NOTE_ROW, title: 'Updated Title' };
        // first call = SELECT existing, second call = UPDATE RETURNING
        sql.mockResolvedValueOnce([NOTE_ROW]).mockResolvedValueOnce([updatedRow]);
        const req = makeRequest('PUT', 'http://localhost/api/notes/note-uuid-1', { title: 'Updated Title' });
        const res = await notePUT(req, { params: Promise.resolve({ id: 'note-uuid-1' }) });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.title).toBe('Updated Title');
    });
});

// ─── DELETE /api/notes/[id] ───────────────────────────────────────────────

describe('DELETE /api/notes/[id]', () => {
    it('returns 404 when note does not exist', async () => {
        sql.mockResolvedValue([]);
        const req = makeRequest('DELETE', 'http://localhost/api/notes/note-uuid-1');
        const res = await noteDELETE(req, { params: Promise.resolve({ id: 'note-uuid-1' }) });
        expect(res.status).toBe(404);
    });

    it('soft-deletes the note and returns success', async () => {
        // first call = SELECT check, second = UPDATE soft-delete
        sql.mockResolvedValueOnce([NOTE_ROW]).mockResolvedValueOnce([]);
        const req = makeRequest('DELETE', 'http://localhost/api/notes/note-uuid-1');
        const res = await noteDELETE(req, { params: Promise.resolve({ id: 'note-uuid-1' }) });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
    });
});
