import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Query = { text: string; values: unknown[] };
type Responder = (query: Query) => unknown;

const mocks = vi.hoisted(() => {
  const queries: { text: string; values: unknown[] }[] = [];
  let respond: (query: { text: string; values: unknown[] }) => unknown = () => [];
  const run = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = { text: strings.join("?").replace(/\s+/g, " ").trim(), values };
    queries.push(query);
    return respond(query);
  };
  const sql = Object.assign(vi.fn(run), {
    begin: vi.fn(async (work: (tx: typeof run) => Promise<unknown>) => work(run)),
  });
  return {
    validateSession: vi.fn(),
    sql,
    queries,
    setResponder: (next: typeof respond) => { respond = next; },
  };
});

vi.mock("@/lib/auth/session", () => ({ validateSession: mocks.validateSession }));
vi.mock("@/database/pgsql", () => ({ default: mocks.sql }));

import { DELETE, GET, POST } from "@/app/api/pdf/annotations/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const NOTE_ID = "22222222-2222-4222-8222-222222222222";
const ATTACHMENT_ID = "33333333-3333-4333-8333-333333333333";
const ANNOTATION_ID = "44444444-4444-4444-8444-444444444444";

const row = (attachmentId: string | null) => ({
  id: ANNOTATION_ID,
  note_id: NOTE_ID,
  user_id: USER_ID,
  attachment_id: attachmentId,
  annotation_data: { strokes: [] },
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-02T00:00:00Z",
});

function respondWith(responder: Responder) {
  mocks.setResponder(responder);
}

function post(body: unknown) {
  return POST(new NextRequest("http://localhost/api/pdf/annotations", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  }));
}

const writes = () => mocks.queries.filter(({ text }) => /^(UPDATE|INSERT)/.test(text));

describe("PDF annotations API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queries.length = 0;
    mocks.validateSession.mockResolvedValue({ user_id: USER_ID });
    respondWith(() => []);
  });

  it("replaces an existing note-level annotation instead of adding a duplicate row", async () => {
    respondWith(({ text }) => {
      if (text.startsWith("SELECT note_id")) return [{ note_id: NOTE_ID }];
      if (text.startsWith("UPDATE")) return [row(null)];
      return [];
    });

    const response = await post({ noteId: NOTE_ID, annotationData: { strokes: [] } });

    expect(response.status).toBe(200);
    expect((await response.json()).annotation).toMatchObject({
      id: ANNOTATION_ID,
      noteId: NOTE_ID,
      attachmentId: null,
    });
    // NULL never equals NULL, so the lookup must not use attachment_id = NULL
    const update = mocks.queries.find(({ text }) => text.startsWith("UPDATE"));
    expect(update?.text).toContain("attachment_id IS NOT DISTINCT FROM");
    expect(mocks.queries.some(({ text }) => text.startsWith("INSERT"))).toBe(false);
    expect(mocks.queries[0].text).toContain("FOR NO KEY UPDATE");
  });

  it("refuses to attach annotations to another note's attachment", async () => {
    respondWith(({ text }) => {
      if (text.startsWith("SELECT note_id")) return [{ note_id: NOTE_ID }];
      return [];
    });

    const response = await post({
      noteId: NOTE_ID,
      attachmentId: ATTACHMENT_ID,
      annotationData: { strokes: [] },
    });

    expect(response.status).toBe(404);
    const attachmentCheck = mocks.queries.find(({ text }) => text.includes("FROM app.attachments"));
    expect(attachmentCheck?.values).toEqual([ATTACHMENT_ID, NOTE_ID, USER_ID]);
    expect(writes()).toEqual([]);
  });

  it("does not write annotations for a note the caller does not own", async () => {
    const response = await post({ noteId: NOTE_ID, annotationData: [] });

    expect(response.status).toBe(404);
    expect(mocks.queries[0].values).toEqual([NOTE_ID, USER_ID]);
    expect(writes()).toEqual([]);
  });

  it("rejects annotation payloads that are not structured JSON", async () => {
    const response = await post({ noteId: NOTE_ID, annotationData: "draw" });

    expect(response.status).toBe(400);
    expect(mocks.queries).toEqual([]);
  });

  it("returns every annotation on the note when no attachment is named", async () => {
    respondWith(({ text }) => {
      if (text.startsWith("SELECT note_id")) return [{ note_id: NOTE_ID }];
      if (text.includes("FROM app.pdf_annotations")) return [row(null), row(ATTACHMENT_ID)];
      return [];
    });

    const response = await GET(new NextRequest(
      `http://localhost/api/pdf/annotations?noteId=${NOTE_ID}`,
    ));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.annotations.map((annotation: { attachmentId: string | null }) =>
      annotation.attachmentId)).toEqual([null, ATTACHMENT_ID]);
    const lookup = mocks.queries.find(({ text }) => text.includes("FROM app.pdf_annotations"));
    expect(lookup?.values).toEqual([USER_ID, NOTE_ID, expect.anything()]);
    expect(mocks.queries.some(({ text }) => text.includes("AND attachment_id ="))).toBe(false);
  });

  it("reports a database failure instead of an empty annotation list", async () => {
    respondWith(({ text }) => {
      if (text.startsWith("SELECT note_id")) return [{ note_id: NOTE_ID }];
      throw new Error("database unavailable");
    });

    const response = await GET(new NextRequest(
      `http://localhost/api/pdf/annotations?noteId=${NOTE_ID}`,
    ));

    expect(response.status).toBe(500);
  });

  it("reports a missing annotation on delete", async () => {
    const response = await DELETE(new NextRequest(
      `http://localhost/api/pdf/annotations?id=${ANNOTATION_ID}`,
      { method: "DELETE" },
    ));

    expect(response.status).toBe(404);
    expect(mocks.queries[0].values).toEqual([ANNOTATION_ID, USER_ID]);
  });
});
