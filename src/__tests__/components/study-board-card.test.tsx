// @vitest-environment jsdom

import React, { type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudyFlowCard, readableExcerpt } from "@/components/study-map/study-board-card";
import { moduleItems, type FlowItem } from "@/lib/study-map/flow";
import { emptyBoard, type StudyAssignment, type StudyMapSnapshot, type StudyMaterial, type StudyTopic } from "@/lib/study-map/types";

const pdfBoundary = vi.hoisted(() => ({ workerOptions: { workerSrc: "" } }));

vi.mock("react-pdf", () => ({
  pdfjs: { GlobalWorkerOptions: pdfBoundary.workerOptions },
  Document: ({ children, file }: { children: ReactNode; file: string }) => (
    <div data-testid="pdf-document" data-file={file}>{children}</div>
  ),
  Page: ({
    pageNumber,
    renderTextLayer,
    renderAnnotationLayer,
  }: {
    pageNumber: number;
    renderTextLayer: boolean;
    renderAnnotationLayer: boolean;
  }) => (
    <div
      data-testid="pdf-page"
      data-page={pageNumber}
      data-text-layer={renderTextLayer}
      data-annotation-layer={renderAnnotationLayer}
    />
  ),
}));

const observers = new Map<Element, IntersectionObserverStub>();

class IntersectionObserverStub implements IntersectionObserver {
  readonly root: Element | Document | null;
  readonly rootMargin: string;
  readonly scrollMargin = "0px";
  readonly thresholds: number[];

  constructor(
    readonly callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ) {
    this.root = options?.root ?? null;
    this.rootMargin = options?.rootMargin ?? "0px";
    this.thresholds = Array.isArray(options?.threshold) ? options.threshold : [options?.threshold ?? 0];
  }

  observe(element: Element) {
    observers.set(element, this);
  }

  unobserve(element: Element) {
    observers.delete(element);
  }

  disconnect() {
    for (const [element, observer] of observers) {
      if (observer === this) observers.delete(element);
    }
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

function visibility(element: Element, visible: boolean) {
  const observer = observers.get(element);
  if (!observer) throw new Error("Expected the file card to observe its viewport visibility");
  const bounds = element.getBoundingClientRect();
  act(() => observer.callback([{
    boundingClientRect: bounds,
    intersectionRatio: visible ? 1 : 0,
    intersectionRect: bounds,
    isIntersecting: visible,
    rootBounds: null,
    target: element,
    time: 0,
  }], observer));
}

const noteId = "30000000-0000-4000-8000-000000000001";
const hiddenId = "30000000-0000-4000-8000-000000000003";
const mapId = "10000000-0000-4000-8000-000000000001";
const topicId = "20000000-0000-4000-8000-000000000001";
const otherTopicId = "20000000-0000-4000-8000-000000000002";
const hash = "a".repeat(64);
const signedUrl = "https://files.example.test/attachment";
const svgSource = '<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><rect width="50" height="50" /></svg>';

function material(changes: Partial<StudyMaterial> = {}): StudyMaterial {
  return {
    noteId,
    mapId,
    title: "Week 3: graph search",
    excerpt: "## Graph search\n\nBreadth-first search visits each **graph** layer. See [queues](/notes/x).",
    kind: "notes",
    labels: [],
    associations: [],
    overrides: { topics: {}, sourceHash: "", taxonomyVersion: 0 },
    status: "classified",
    sourceHash: hash,
    currentHash: hash,
    taxonomyVersion: 1,
    updatedAt: "2026-10-03T12:00:00Z",
    classifiedAt: "2026-10-03T12:00:00Z",
    isFile: false,
    mimeType: null,
    references: [],
    folder: null,
    createdAt: "2026-10-03T12:00:00Z",
    imported: true,
    ...changes,
  };
}

function topic(id = topicId, name = "Graphs"): StudyTopic {
  return { id, name, definition: "Graph algorithms", includes: "", excludes: "", aliases: [], parentId: null, sources: [], reviewed: true };
}

function snapshot(materials: StudyMaterial[], topics: StudyTopic[] = [topic()], assignments: StudyAssignment[] = []): StudyMapSnapshot {
  return {
    map: { id: mapId, name: "Algorithms", academicYear: "2025/26", topicCount: topics.length, materialCount: materials.length, updatedAt: "2026-10-03T12:00:00Z",
      rootNoteId: null, canvasCourseId: "7", syllabusNoteId: null, taxonomyVersion: 1, version: 1, boardVersion: 0, autoClassify: false, topics, board: emptyBoard() },
    materials, assignments, papers: [], jobs: [], provider: { classifier: "mock", ready: true, generationReady: true },
  };
}

function itemFor(current: StudyMaterial, topics: StudyTopic[] = [topic()]): FlowItem {
  return moduleItems(snapshot([current], topics), emptyBoard())[0];
}

const palette = (topics: StudyTopic[] = [topic()]) => new Map(topics.map((entry, index) => [entry.id, { ...entry, colour: ["#6366f1", "#0d9488"][index] }]));

function card(item: FlowItem, topics: StudyTopic[] = [topic()], options: { compact?: boolean; usedBy?: Array<{ id: string; short: string; title: string }> } = {}) {
  return (
    <article aria-label={item.title} key={item.ref}>
      <StudyFlowCard item={item} topics={palette(topics)} linkCount={0} usedBy={options.usedBy ?? []} compact={options.compact ?? false} pinned={false} />
    </article>
  );
}

const fetchBoundary = vi.fn<typeof fetch>();
const createObjectUrl = vi.fn<(blob: Blob | MediaSource) => string>();
const revokeObjectUrl = vi.fn<(url: string) => void>();

function downloadSignal(): AbortSignal {
  const signal = fetchBoundary.mock.calls.find(([input]) => input === signedUrl)?.[1]?.signal;
  if (!signal) throw new Error("Expected the SVG download to have an abort signal");
  return signal;
}

function preview(element: HTMLElement) {
  const box = element.querySelector("article > div");
  if (!box) throw new Error("Expected a card");
  return box;
}

beforeEach(() => {
  vi.clearAllMocks();
  observers.clear();
  pdfBoundary.workerOptions.workerSrc = "";
  vi.stubGlobal("React", React);
  vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);
  createObjectUrl.mockImplementation(() => `blob:svg-preview-${createObjectUrl.mock.calls.length}`);
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = createObjectUrl;
    static revokeObjectURL = revokeObjectUrl;
  });
  fetchBoundary.mockImplementation(async (input) => {
    const path = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (path.startsWith("/api/notes/")) return Response.json({ s3Key: "attachments/source" });
    if (path === "/api/upload?path=attachments%2Fsource") return Response.json({ url: signedUrl });
    if (path === signedUrl) return new Response(svgSource, { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": "attachment", "X-Content-Type-Options": "nosniff" } });
    throw new Error(`Unexpected preview request: ${path}`);
  });
  vi.stubGlobal("fetch", fetchBoundary);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("StudyFlowCard", () => {
  it("shows the live title, readable prose and inferred week, and follows source edits", () => {
    const view = render(card(itemFor(material())));
    expect(screen.getByRole("heading", { name: "Week 3: graph search" })).toBeTruthy();
    expect(screen.getByText("Graph search Breadth-first search visits each graph layer. See queues.")).toBeTruthy();
    expect(screen.getByText("Week 3")).toBeTruthy();
    expect(screen.getByText("Notes")).toBeTruthy();

    view.rerender(card(itemFor(material({ title: "Graph search revised", excerpt: "The edited source excerpt." }))));
    expect(screen.getByRole("heading", { name: "Graph search revised" })).toBeTruthy();
    expect(screen.getByText("No week")).toBeTruthy();
    expect(screen.getByText("The edited source excerpt.")).toBeTruthy();
    expect(fetchBoundary).not.toHaveBeenCalled();
  });

  it("distinguishes your own notes and marks suggestions for review without hiding them", () => {
    const suggested = material({
      imported: false,
      associations: [
        { topicId, relevance: "core", probability: 0.9, evidence: [], status: "suggested", origin: "automatic" },
        { topicId: otherTopicId, relevance: "supporting", probability: 0.7, evidence: [], status: "accepted", origin: "automatic" },
      ],
    });
    const topics = [topic(), topic(otherTopicId, "Queues")];
    render(card(itemFor(suggested, topics), topics));
    expect(screen.getByText("Your note")).toBeTruthy();
    expect(screen.getByText("Review")).toBeTruthy();
    const chip = screen.getByRole("button", { name: "Graphs" });
    expect(chip.getAttribute("data-topic")).toBe(topicId);
    expect(chip.getAttribute("title")).toBe("Graphs: core, suggested, needs review");
    expect(screen.getByRole("button", { name: "Queues" }).getAttribute("title")).toBe("Queues: supporting");
  });

  it("shows assignments with their due date, a plain-text brief and backlinks on the notes they use", () => {
    const assignment: StudyAssignment = {
      id: "40000000-0000-4000-8000-000000000001", canvas_course_id: "7", canvas_assignment_id: "8", title: "Assignment 2: shortest paths",
      description: "<p>Use <b>Graphs</b> to find shortest paths.</p>", course_name: "Algorithms", course_color: null, due_at: "2026-11-20T12:00:00Z",
      status: "upcoming", estimated_hours: null, logged_hours: 0, source: "canvas", assignment_type: "assignment", submitted_at: null, score: null,
      points_possible: 20, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", noteIds: [],
    };
    const items = moduleItems(snapshot([material()], [topic()], [assignment]), emptyBoard());
    const brief = items.find((entry) => entry.kind === "assignment")!;
    render(<>{card(brief)}{card(items[0], [topic()], { usedBy: [{ id: assignment.id, short: "A2", title: assignment.title }] })}</>);
    const assignmentCard = screen.getByRole("article", { name: assignment.title });
    expect(within(assignmentCard).getByText("Assignment")).toBeTruthy();
    expect(within(assignmentCard).getByText(/^Due /)).toBeTruthy();
    expect(within(assignmentCard).getByText("Use Graphs to find shortest paths.")).toBeTruthy();
    expect(within(assignmentCard).getByRole("button", { name: "Graphs" }).getAttribute("title")).toBe("Graphs: core, named in the brief");
    const backlink = within(screen.getByRole("article", { name: "Week 3: graph search" })).getByRole("button", { name: "↩ A2" });
    expect(backlink.getAttribute("data-go")).toBe(`assignment:${assignment.id}`);
  });

  it("keeps only the title when zoomed out", () => {
    render(card(itemFor(material({ associations: [{ topicId, relevance: "core", probability: 0.9, evidence: [], status: "accepted", origin: "automatic" }] })), [topic()], { compact: true }));
    expect(screen.getByRole("heading", { name: "Week 3: graph search" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Graphs" })).toBeNull();
    expect(screen.queryByText(/Breadth-first/)).toBeNull();
  });

  it("strips Markdown, wiki links and page markers from excerpts", () => {
    expect(readableExcerpt("[Page 1]\n# Title\n- **Bold** `code` [[Target|label]] ![img](x.png)\n```js\nconst x = 1;\n```")).toBe("Title Bold code label");
  });

  it.each([
    { name: "SVG image", mimeType: "image/svg+xml", pdf: false, svg: true },
    { name: "PNG image", mimeType: "image/png", pdf: false, svg: false },
    { name: "PDF", mimeType: "application/pdf", pdf: true, svg: false },
  ])("loads only the visible $name card and unmounts its preview when hidden", async ({ mimeType, pdf, svg }) => {
    const visibleItem = itemFor(material({ title: "Visible file", isFile: true, mimeType }));
    const hiddenItem = itemFor(material({ noteId: hiddenId, title: "Hidden file", isFile: true, mimeType }));
    render(<>{card(visibleItem)}{card(hiddenItem)}</>);
    const visibleCard = screen.getByRole("article", { name: "Visible file" });
    const hiddenCard = screen.getByRole("article", { name: "Hidden file" });
    expect(fetchBoundary).not.toHaveBeenCalled();

    visibility(preview(visibleCard), true);
    if (pdf) {
      const page = await within(visibleCard).findByTestId("pdf-page");
      expect(screen.getAllByTestId("pdf-page")).toHaveLength(1);
      expect(page.getAttribute("data-page")).toBe("1");
      expect(page.getAttribute("data-text-layer")).toBe("false");
      expect(page.getAttribute("data-annotation-layer")).toBe("false");
      expect(within(visibleCard).getByTestId("pdf-document").getAttribute("data-file")).toBe(signedUrl);
      expect(pdfBoundary.workerOptions.workerSrc).toBe("/pdf.worker.js");
    } else {
      const image = await within(visibleCard).findByRole("img", { name: "Preview of Visible file" });
      expect(image.getAttribute("src")).toBe(svg ? "blob:svg-preview-1" : signedUrl);
      expect(visibleCard.querySelector("iframe, object, embed")).toBeNull();
    }
    const expectedRequests = svg ? 3 : 2;
    expect(fetchBoundary).toHaveBeenCalledTimes(expectedRequests);
    expect(fetchBoundary).toHaveBeenNthCalledWith(1, `/api/notes/${noteId}?fields=s3Key,content`);
    expect(fetchBoundary).toHaveBeenNthCalledWith(2, "/api/upload?path=attachments%2Fsource");
    expect(within(hiddenCard).queryByRole("img")).toBeNull();
    expect(within(hiddenCard).queryByTestId("pdf-document")).toBeNull();
    if (svg) {
      const blob = createObjectUrl.mock.calls[0]?.[0];
      if (!(blob instanceof Blob)) throw new Error("Expected a Blob for the SVG image URL");
      expect(blob.type).toBe("image/svg+xml");
      expect(blob.size).toBe(new TextEncoder().encode(svgSource).byteLength);
      expect(downloadSignal().aborted).toBe(false);
    } else expect(createObjectUrl).not.toHaveBeenCalled();

    visibility(preview(visibleCard), false);
    expect(within(visibleCard).queryByRole("img")).toBeNull();
    expect(within(visibleCard).queryByTestId("pdf-document")).toBeNull();
    expect(fetchBoundary).toHaveBeenCalledTimes(expectedRequests);
    if (svg) {
      expect(downloadSignal().aborted).toBe(true);
      expect(revokeObjectUrl).toHaveBeenCalledExactlyOnceWith("blob:svg-preview-1");
    }
  });

  it("replaces the SVG preview after a source edit and releases both image URLs", async () => {
    const current = material({ isFile: true, mimeType: "image/svg+xml" });
    const view = render(card(itemFor(current)));
    visibility(preview(screen.getByRole("article")), true);
    expect((await screen.findByRole("img")).getAttribute("src")).toBe("blob:svg-preview-1");
    const firstDownload = downloadSignal();

    view.rerender(card(itemFor({ ...current, currentHash: "b".repeat(64) })));
    expect((await screen.findByRole("img")).getAttribute("src")).toBe("blob:svg-preview-2");
    expect(firstDownload.aborted).toBe(true);
    expect(revokeObjectUrl).toHaveBeenCalledExactlyOnceWith("blob:svg-preview-1");

    view.unmount();
    expect(revokeObjectUrl.mock.calls.map(([url]) => url)).toEqual(["blob:svg-preview-1", "blob:svg-preview-2"]);
  });

  it("aborts an unfinished SVG download on unmount and ignores a late response", async () => {
    let finishDownload: ((response: Response) => void) | undefined;
    const defaultFetch = fetchBoundary.getMockImplementation();
    if (!defaultFetch) throw new Error("Expected the preview network boundary");
    fetchBoundary.mockImplementation((input, options) => input === signedUrl
      ? new Promise<Response>((resolve) => { finishDownload = resolve; })
      : defaultFetch(input, options));
    const view = render(card(itemFor(material({ isFile: true, mimeType: "image/svg+xml" }))));
    visibility(preview(screen.getByRole("article")), true);
    await waitFor(() => expect(fetchBoundary).toHaveBeenCalledWith(signedUrl, expect.objectContaining({ signal: expect.any(AbortSignal) })));
    const signal = downloadSignal();
    view.unmount();
    expect(signal.aborted).toBe(true);
    const finish = finishDownload;
    if (!finish) throw new Error("Expected an unfinished SVG download");
    await act(async () => finish(new Response(svgSource)));
    expect(createObjectUrl).not.toHaveBeenCalled();
    expect(revokeObjectUrl).not.toHaveBeenCalled();
  });

  it.each(["announced size", "streamed size"])("rejects oversized SVG previews using their %s", async (sizeSource) => {
    const defaultFetch = fetchBoundary.getMockImplementation();
    if (!defaultFetch) throw new Error("Expected the preview network boundary");
    const cancelStream = vi.fn();
    fetchBoundary.mockImplementation((input, options) => {
      if (input !== signedUrl) return defaultFetch(input, options);
      if (sizeSource === "announced size") {
        return Promise.resolve(new Response(svgSource, { headers: { "Content-Length": String(6 * 1024 * 1024) } }));
      }
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(new Uint8Array(3 * 1024 * 1024));
        },
        cancel: cancelStream,
      });
      return Promise.resolve(new Response(body));
    });
    render(card(itemFor(material({ isFile: true, mimeType: "image/svg+xml" }))));
    visibility(preview(screen.getByRole("article")), true);
    expect(await screen.findByText("Preview unavailable. Open the original to read it.")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(createObjectUrl).not.toHaveBeenCalled();
    expect(downloadSignal().aborted).toBe(true);
    if (sizeSource === "streamed size") expect(cancelStream).toHaveBeenCalledOnce();
  });

  it("shows a readable fallback when signing or the image fails", async () => {
    fetchBoundary.mockResolvedValueOnce(new Response(null, { status: 404 }));
    const view = render(card(itemFor(material({ isFile: true, mimeType: "application/pdf" }))));
    visibility(preview(screen.getByRole("article")), true);
    expect(await screen.findByText("Preview unavailable. Open the original to read it.")).toBeTruthy();
    expect(screen.queryByTestId("pdf-document")).toBeNull();
    view.unmount();

    render(card(itemFor(material({ isFile: true, mimeType: "image/png" }))));
    visibility(preview(screen.getByRole("article")), true);
    fireEvent.error(await screen.findByRole("img"));
    expect(screen.getByText("Preview unavailable. Open the original to read it.")).toBeTruthy();
  });

  it("does not request previews for unsupported attachment types", () => {
    render(card(itemFor(material({ isFile: true, mimeType: "application/zip", excerpt: "Archive of lab files" }))));
    expect(screen.getByText("File")).toBeTruthy();
    expect(screen.getByText("Archive of lab files")).toBeTruthy();
    expect(fetchBoundary).not.toHaveBeenCalled();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
