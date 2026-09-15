// @vitest-environment jsdom

import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pathname: "/",
  trackMarketingEvent: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock("@/lib/marketing/client", () => ({
  trackMarketingEvent: mocks.trackMarketingEvent,
}));

import MarketingTracker from "@/components/marketing-tracker";

describe("MarketingTracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = "/";
    window.history.replaceState({}, "", "/");
  });

  it("records the initial public page view and direct navigation", async () => {
    render(<MarketingTracker />);

    await waitFor(() => {
      expect(mocks.trackMarketingEvent).toHaveBeenCalledWith(
        "navigation_transition",
        expect.objectContaining({
          fromPath: null,
          toPath: "/",
          originClass: "direct",
          pathChain: ["/"],
        }),
      );
      expect(mocks.trackMarketingEvent).toHaveBeenCalledWith("page_view", {
        source: "public_site",
        properties: { page_group: "public", pathname: "/" },
      });
    });
  });

  it("does not observe private routes across persistent-layout navigation", async () => {
    const { rerender } = render(<MarketingTracker />);
    await waitFor(() =>
      expect(mocks.trackMarketingEvent).toHaveBeenCalledWith(
        "page_view",
        expect.any(Object),
      ),
    );
    mocks.trackMarketingEvent.mockClear();

    mocks.pathname = "/notes/private-note-id";
    window.history.replaceState({}, "", "/notes/private-note-id");
    rerender(<MarketingTracker />);
    expect(mocks.trackMarketingEvent).not.toHaveBeenCalled();

    mocks.pathname = "/pricing";
    window.history.replaceState({}, "", "/pricing");
    rerender(<MarketingTracker />);
    await waitFor(() =>
      expect(mocks.trackMarketingEvent).toHaveBeenCalledWith(
        "page_view",
        expect.any(Object),
      ),
    );

    expect(JSON.stringify(mocks.trackMarketingEvent.mock.calls)).not.toContain(
      "/notes/private-note-id",
    );
  });

  it("records an internal CTA transition with attribution context", async () => {
    render(<MarketingTracker />);
    await waitFor(() =>
      expect(mocks.trackMarketingEvent).toHaveBeenCalledWith(
        "page_view",
        expect.any(Object),
      ),
    );
    mocks.trackMarketingEvent.mockClear();

    const link = document.createElement("a");
    link.href = "/contact";
    link.dataset.marketingLocation = "hero";
    link.dataset.marketingCta = "request_beta_access";
    link.textContent = "Request beta access";
    link.addEventListener("click", (event) => event.preventDefault());
    document.body.appendChild(link);

    fireEvent.click(link);

    expect(mocks.trackMarketingEvent).toHaveBeenCalledWith(
      "navigation_transition",
      expect.objectContaining({
        fromPath: "/",
        toPath: "/contact",
        originClass: "internal",
        placement: "hero",
        action: "request_beta_access",
        pathChain: ["/", "/contact"],
        attributionPath: "/",
        attributionPlacement: "hero",
        attributionAction: "request_beta_access",
      }),
    );
  });

  it("keeps only the latest four public routes in navigation context", async () => {
    const { rerender } = render(<MarketingTracker />);
    await waitFor(() =>
      expect(mocks.trackMarketingEvent).toHaveBeenCalledWith(
        "page_view",
        expect.any(Object),
      ),
    );

    for (const pathname of ["/about", "/blog", "/pricing", "/register"]) {
      mocks.pathname = pathname;
      window.history.pushState({}, "", pathname);
      rerender(<MarketingTracker />);
      await waitFor(() =>
        expect(mocks.trackMarketingEvent).toHaveBeenCalledWith("page_view", {
          source: "public_site",
          properties: { page_group: "public", pathname },
        }),
      );
    }

    expect(mocks.trackMarketingEvent).toHaveBeenCalledWith(
      "navigation_transition",
      expect.objectContaining({
        fromPath: "/pricing",
        toPath: "/register",
        pathChain: ["/about", "/blog", "/pricing", "/register"],
      }),
    );
  });
});
