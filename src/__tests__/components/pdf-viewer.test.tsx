// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pdfData: Uint8Array.from([37, 80, 68, 70]),
  desktop: true,
  push: vi.fn(),
  refreshTree: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/lib/hooks/use-media-query", () => ({
  default: () => mocks.desktop,
}));

vi.mock("@/lib/notes/state/tree", () => ({
  default: { getState: () => ({ refreshTree: mocks.refreshTree }) },
}));

vi.mock("@/lib/notes/pdf-cache/use-pdf-cache", () => ({
  usePdfCache: () => ({ data: mocks.pdfData, loading: false, error: null }),
}));

vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  default: () => ({ t: (key: string) => key }),
}));

vi.mock("@heroicons/react/24/outline", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  const Icon = () => React.createElement("svg");
  return {
    MagnifyingGlassMinusIcon: Icon,
    MagnifyingGlassPlusIcon: Icon,
    ArrowsPointingOutIcon: Icon,
    ArrowPathIcon: Icon,
    ExclamationTriangleIcon: Icon,
  };
});

vi.mock("react-pdf", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    pdfjs: { GlobalWorkerOptions: {} },
    Document: ({
      children,
      onLoadSuccess,
    }: {
      children: React.ReactNode;
      onLoadSuccess: (value: { numPages: number }) => void;
    }) => {
      React.useEffect(() => onLoadSuccess({ numPages: 12 }), [onLoadSuccess]);
      return React.createElement("div", null, children);
    },
    Page: ({
      pageNumber,
      devicePixelRatio,
      width,
      onLoadSuccess,
    }: {
      pageNumber: number;
      devicePixelRatio: number;
      width: number;
      onLoadSuccess?: (page: {
        originalWidth: number;
        originalHeight: number;
      }) => void;
    }) => {
      const loadCallback = React.useRef(onLoadSuccess);
      loadCallback.current = onLoadSuccess;
      React.useEffect(() => {
        loadCallback.current?.({ originalWidth: 612, originalHeight: 792 });
      }, [pageNumber]);
      return React.createElement("div", {
        "data-testid": `rendered-pdf-page-${pageNumber}`,
        "data-device-pixel-ratio": devicePixelRatio,
        "data-width": width,
      });
    },
  };
});

type ObserverRecord = {
  callback: IntersectionObserverCallback;
  options?: IntersectionObserverInit;
};

const observers = new Map<Element, ObserverRecord>();

class IntersectionObserverStub {
  private readonly callback: IntersectionObserverCallback;
  readonly options?: IntersectionObserverInit;

  constructor(
    callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ) {
    this.callback = callback;
    this.options = options;
  }

  observe(element: Element) {
    observers.set(element, { callback: this.callback, options: this.options });
  }

  disconnect() {
    for (const [element, observer] of observers) {
      if (observer.callback === this.callback) observers.delete(element);
    }
  }
}

const resizeObservers = new Map<Element, ResizeObserverCallback>();

class ResizeObserverStub {
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    resizeObservers.set(target, this.callback);
    this.callback(
      [{ target, contentRect: { width: 320 } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }

  disconnect() {}
}

import PDFViewer from "@/components/editor/pdf-viewer";
import useLayoutStore from "@/lib/notes/state/layout.zustand";

describe("PDFViewer page rendering", () => {
  beforeEach(() => {
    mocks.desktop = true;
    mocks.push.mockReset();
    mocks.refreshTree.mockClear();
    useLayoutStore.getState().setPaneB(undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "none" }),
    }));
    observers.clear();
    resizeObservers.clear();
    vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: 3,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps canvases near the viewport and caps their pixel density", async () => {
    const { container } = render(
      <PDFViewer
        pane="A"
        file={{
          fileId: "note-1",
          fileType: "pdf",
          sourcePath: "notes/lecture.pdf",
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("rendered-pdf-page-1")).toBeTruthy();
      expect(screen.getByTestId("rendered-pdf-page-2")).toBeTruthy();
    });
    expect(screen.queryByTestId("rendered-pdf-page-3")).toBeNull();
    expect(
      screen.getByTestId("rendered-pdf-page-1").dataset.devicePixelRatio,
    ).toBe("2");

    const thirdSlot = container.querySelector(
      '[data-pdf-page-number="3"]',
    );
    expect(thirdSlot).not.toBeNull();
    expect((thirdSlot as HTMLElement).style.width).toBe("320px");
    expect(observers.get(thirdSlot!)?.options?.rootMargin).toBe("100% 0px");
    const firstSlot = container.querySelector(
      '[data-pdf-page-number="1"]',
    );
    expect(parseFloat((firstSlot as HTMLElement).style.minHeight)).toBeCloseTo(
      320 * (792 / 612),
    );

    act(() => {
      const observer = observers.get(thirdSlot!);
      observer?.callback(
        [
          {
            isIntersecting: true,
            target: thirdSlot,
          } as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
    });
    expect(screen.getByTestId("rendered-pdf-page-3")).toBeTruthy();

    act(() => {
      const observer = observers.get(firstSlot!);
      observer?.callback(
        [
          {
            isIntersecting: false,
            target: firstSlot,
          } as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
    });
    expect(screen.queryByTestId("rendered-pdf-page-1")).toBeNull();
  });

  it("keeps zoomed lazy slots aligned as pages load and fits after resizing the pane", async () => {
    const { container } = render(
      <PDFViewer pane="A" file={{ fileId: "note-1", fileType: "pdf", sourcePath: "notes/lecture.pdf" }} />,
    );
    await waitFor(() => expect(screen.getByText("52%")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    const firstSlot = container.querySelector<HTMLElement>('[data-pdf-page-number="1"]')!;
    const thirdSlot = container.querySelector<HTMLElement>('[data-pdf-page-number="3"]')!;
    const zoomedWidth = 320 + 612 * 0.2;
    expect(parseFloat(firstSlot.style.width)).toBeCloseTo(zoomedWidth);
    expect(thirdSlot.style.width).toBe(firstSlot.style.width);
    expect(Number(screen.getByTestId("rendered-pdf-page-1").dataset.width)).toBeCloseTo(zoomedWidth);

    act(() => {
      observers.get(thirdSlot)?.callback(
        [{
          isIntersecting: true,
          target: thirdSlot,
          boundingClientRect: thirdSlot.getBoundingClientRect(),
          intersectionRatio: 1,
          intersectionRect: thirdSlot.getBoundingClientRect(),
          rootBounds: null,
          time: 0,
        }],
        {} as IntersectionObserver,
      );
    });
    expect(thirdSlot.style.width).toBe(firstSlot.style.width);
    expect(Number(screen.getByTestId("rendered-pdf-page-3").dataset.width)).toBeCloseTo(zoomedWidth);

    act(() => {
      for (const [target, callback] of resizeObservers) {
        callback(
          [{ target, contentRect: { width: 240 } } as ResizeObserverEntry],
          {} as ResizeObserver,
        );
      }
    });
    expect(parseFloat(firstSlot.style.width)).toBeCloseTo(zoomedWidth);
    fireEvent.click(screen.getByRole("button", { name: "Fit to pane" }));
    expect(firstSlot.style.width).toBe("240px");
    expect(thirdSlot.style.width).toBe("240px");
    expect(screen.getByText("39%")).toBeTruthy();
  });

  it("shows extraction in progress, then opens the editable note beside the PDF", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: "processing" }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "done",
          extractedNote: { id: "extracted-1", title: "lecture.md" },
        }),
      }));
    vi.useFakeTimers();

    render(<PDFViewer pane="A" file={{ fileId: "source-1", fileType: "pdf", sourcePath: "notes/lecture.pdf" }} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText(/Creating an editable note/)).toBeTruthy();

    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(screen.getByText(/Editable extracted text is ready/)).toBeTruthy();
    expect(mocks.refreshTree).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Open extracted note beside PDF" }));
    expect(useLayoutStore.getState().paneB?.fileId).toBe("extracted-1");
    expect(useLayoutStore.getState().paneA.fileId).not.toBe("extracted-1");
  });

  it("keeps the original PDF available when extraction fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "failed", extractedNote: null }),
    }));

    render(<PDFViewer pane="A" file={{ fileId: "source-1", fileType: "pdf", sourcePath: "notes/lecture.pdf" }} />);
    await waitFor(() => expect(screen.getByText(/Text extraction failed/)).toBeTruthy());
    expect(screen.getByTestId("rendered-pdf-page-1")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Open extracted note/ })).toBeNull();
  });

  it.each([400, 401, 404])(
    "stops polling and clears stale extraction progress after HTTP %i",
    async (status) => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ status: "processing" }) })
        .mockResolvedValue({ ok: false, status });
      vi.stubGlobal("fetch", fetchMock);
      vi.useFakeTimers();

      render(<PDFViewer pane="A" file={{ fileId: "source-1", fileType: "pdf", sourcePath: "notes/lecture.pdf" }} />);
      await act(async () => { await Promise.resolve(); });
      expect(screen.getByText(/Creating an editable note/)).toBeTruthy();

      await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(screen.queryByText(/Creating an editable note/)).toBeNull();
      expect(screen.getByTestId("rendered-pdf-page-1")).toBeTruthy();

      await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

});
