// @vitest-environment jsdom

import React, { type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudyBoardCard } from "@/components/study-map/study-board-card";
import type { StudyMaterial, StudyTopic } from "@/lib/study-map/types";

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
const pairedId = "30000000-0000-4000-8000-000000000002";
const hiddenId = "30000000-0000-4000-8000-000000000003";
const topicId = "20000000-0000-4000-8000-000000000001";
const hash = "a".repeat(64);
const signedUrl = "https://files.example.test/attachment";
const svgSource = '<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><rect width="50" height="50" /></svg>';

function material(changes: Partial<StudyMaterial> = {}): StudyMaterial {
  return {
    noteId,
    mapId: "10000000-0000-4000-8000-000000000001",
    title: "Graph search",
    excerpt: "Breadth-first search visits each graph layer.",
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
    ...changes,
  };
}

function topic(id = topicId, name = "Graphs"): StudyTopic {
  return { id, name, definition: "Graph algorithms", includes: "", excludes: "", aliases: [], parentId: null, sources: [], reviewed: true };
}

function suggestedMaterial(): StudyMaterial {
  return material({ associations: [{
    topicId,
    relevance: "core",
    probability: 0.9,
    status: "suggested",
    origin: "automatic",
    evidence: [{
      relevance: "core",
      probability: 0.9,
      confidence: 0.9,
      anchor: { noteId: pairedId, field: "extracted_text", hash, start: 0, end: 12, quote: "Graph search", line: 1, page: 2 },
    }],
  }] });
}

const onInspect = vi.fn();
const onTopic = vi.fn();
const fetchBoundary = vi.fn<typeof fetch>();
const createObjectUrl = vi.fn<(blob: Blob | MediaSource) => string>();
const revokeObjectUrl = vi.fn<(url: string) => void>();

function downloadSignal(): AbortSignal {
  const signal = fetchBoundary.mock.calls.find(([input]) => input === signedUrl)?.[1]?.signal;
  if (!signal) throw new Error("Expected the SVG download to have an abort signal");
  return signal;
}

function card(current = material(), topics: StudyTopic[] = []) {
  return <StudyBoardCard material={current} topics={topics} taxonomyVersion={1} onInspect={onInspect} onTopic={onTopic} />;
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

describe("StudyBoardCard", () => {
  it("refreshes the source title and excerpt while retaining the canonical note link", () => {
    const view = render(card());
    expect(screen.getByRole("heading", { name: "Graph search" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open original" }).getAttribute("href")).toBe(`/notes/${noteId}`);

    view.rerender(card(material({ title: "Updated graph search", excerpt: "The edited source excerpt." })));
    expect(screen.queryByRole("heading", { name: "Graph search" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Updated graph search" })).toBeTruthy();
    expect(screen.getByText("The edited source excerpt.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open original" }).getAttribute("href")).toBe(`/notes/${noteId}`);
    expect(fetchBoundary).not.toHaveBeenCalled();
  });

  it("preserves file-to-Markdown and Markdown-to-file source links", () => {
    render(<>
      {card(material({ title: "Lecture PDF", isFile: true, mimeType: "application/pdf", references: [{ id: pairedId, title: "Lecture Markdown", kind: "note" }] }))}
      {card(material({ noteId: pairedId, title: "Lecture Markdown", references: [{ id: noteId, title: "Lecture PDF", kind: "file" }] }))}
    </>);
    const file = screen.getByRole("article", { name: "Lecture PDF, PDF" });
    const note = screen.getByRole("article", { name: "Lecture Markdown, Note" });
    expect(within(file).getByRole("link", { name: "Open original" }).getAttribute("href")).toBe(`/notes/${noteId}`);
    expect(within(file).getByRole("link", { name: "Lecture Markdown, note" }).getAttribute("href")).toBe(`/notes/${pairedId}`);
    expect(within(note).getByRole("link", { name: "Open original" }).getAttribute("href")).toBe(`/notes/${pairedId}`);
    expect(within(note).getByRole("link", { name: "Lecture PDF, file" }).getAttribute("href")).toBe(`/notes/${noteId}`);
    expect(fetchBoundary).not.toHaveBeenCalled();
  });

  it("opens the inspector and selects a suggested topic while linking its actual evidence source", () => {
    render(card(suggestedMaterial(), [topic()]));
    fireEvent.click(screen.getByRole("button", { name: "Inspect Graph search" }));
    expect(onInspect).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Show Graphs, suggested core topic" }));
    expect(onTopic).toHaveBeenCalledExactlyOnceWith(topicId);
    const source = screen.getByRole("link", { name: "Open source for Graphs" });
    expect(source.getAttribute("href")).toBe(`/notes/${pairedId}`);
    expect(source.getAttribute("title")).toBe("Source evidence, page 2");
    expect(onInspect).toHaveBeenCalledOnce();
  });

  it("accepts current manual topic corrections and drops them when the source changes", () => {
    const current = suggestedMaterial();
    current.overrides = { topics: { [topicId]: "supporting" }, sourceHash: hash, taxonomyVersion: 1 };
    const view = render(card(current, [topic()]));
    expect(screen.getByRole("button", { name: "Show Graphs, accepted supporting topic" })).toBeTruthy();
    expect(screen.getByText("Reviewed by you")).toBeTruthy();

    view.rerender(card({ ...current, currentHash: "b".repeat(64) }, [topic()]));
    expect(screen.getByText("Needs review")).toBeTruthy();
    expect(screen.queryByText("Reviewed by you")).toBeNull();
    expect(screen.queryByRole("button", { name: "Show Graphs, accepted supporting topic" })).toBeNull();
    expect(screen.getByRole("button", { name: "Show Graphs, suggested core topic" })).toBeTruthy();
  });

  it("flags classification from an older taxonomy for review", () => {
    render(card(material({ taxonomyVersion: 0 })));
    expect(screen.getByText("Needs review")).toBeTruthy();
    expect(screen.queryByText("Classified")).toBeNull();
  });

  it.each([
    { name: "SVG image", mimeType: "image/svg+xml", format: "Image", pdf: false, svg: true },
    { name: "PNG image", mimeType: "image/png", format: "Image", pdf: false, svg: false },
    { name: "PDF", mimeType: "application/pdf", format: "PDF", pdf: true, svg: false },
  ])("loads only the visible $name card and unmounts its preview when hidden", async ({ mimeType, format, pdf, svg }) => {
    const visibleMaterial = material({ title: "Visible file", isFile: true, mimeType });
    const hiddenMaterial = material({ noteId: hiddenId, title: "Hidden file", isFile: true, mimeType });
    render(<>{card(visibleMaterial)}{card(hiddenMaterial)}</>);
    const visibleCard = screen.getByRole("article", { name: `Visible file, ${format}` });
    const hiddenCard = screen.getByRole("article", { name: `Hidden file, ${format}` });
    expect(fetchBoundary).not.toHaveBeenCalled();

    visibility(visibleCard, true);
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

    visibility(visibleCard, false);
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
    const view = render(card(current));
    visibility(screen.getByRole("article"), true);
    expect((await screen.findByRole("img")).getAttribute("src")).toBe("blob:svg-preview-1");
    const firstDownload = downloadSignal();

    view.rerender(card({ ...current, currentHash: "b".repeat(64) }));
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
    const view = render(card(material({ isFile: true, mimeType: "image/svg+xml" })));
    visibility(screen.getByRole("article"), true);
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

  it.each(["announced size", "streamed size"])("rejects oversized SVG previews using their %s and retains the original link", async (sizeSource) => {
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
    render(card(material({ isFile: true, mimeType: "image/svg+xml" })));
    visibility(screen.getByRole("article"), true);
    expect(await screen.findByText("Preview unavailable. Open the original to read it.")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(createObjectUrl).not.toHaveBeenCalled();
    expect(downloadSignal().aborted).toBe(true);
    expect(screen.getByRole("link", { name: "Open original" }).getAttribute("href")).toBe(`/notes/${noteId}`);
    if (sizeSource === "streamed size") expect(cancelStream).toHaveBeenCalledOnce();
  });

  it("keeps the original accessible when attachment signing fails", async () => {
    fetchBoundary.mockResolvedValueOnce(new Response(null, { status: 404 }));
    render(card(material({ isFile: true, mimeType: "application/pdf" })));
    visibility(screen.getByRole("article"), true);
    expect(await screen.findByText("Preview unavailable. Open the original to read it.")).toBeTruthy();
    expect(screen.queryByTestId("pdf-document")).toBeNull();
    expect(screen.getByRole("link", { name: "Open original" }).getAttribute("href")).toBe(`/notes/${noteId}`);
    fireEvent.click(screen.getByRole("button", { name: "Inspect Graph search" }));
    expect(onInspect).toHaveBeenCalledOnce();
  });

  it("shows a readable fallback when an image cannot load", async () => {
    render(card(material({ isFile: true, mimeType: "image/png" })));
    visibility(screen.getByRole("article"), true);
    fireEvent.error(await screen.findByRole("img"));
    expect(screen.getByText("Preview unavailable. Open the original to read it.")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByRole("link", { name: "Open original" })).toBeTruthy();
  });

  it("does not request previews for unsupported attachment types", () => {
    render(card(material({ isFile: true, mimeType: "application/zip" })));
    expect(screen.getByText("application/zip")).toBeTruthy();
    expect(fetchBoundary).not.toHaveBeenCalled();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByTestId("pdf-document")).toBeNull();
  });
});
