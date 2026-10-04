// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pdfData: Uint8Array.from([37, 80, 68, 70]),
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

describe("PDFViewer page rendering", () => {
  beforeEach(() => {
    observers.clear();
    resizeObservers.clear();
    vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: 3,
    });
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

});
