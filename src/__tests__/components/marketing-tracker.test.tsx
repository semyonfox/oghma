// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ pathname: "/", report: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("@/lib/marketing/client", () => ({ reportTelemetry: mocks.report }));
import MarketingTracker from "@/components/marketing-tracker";
beforeEach(() => { mocks.pathname = "/"; mocks.report.mockClear(); });
afterEach(cleanup);
it("maps navigation to closed categories without a private path", () => {
  const view = render(<MarketingTracker />);
  expect(mocks.report).toHaveBeenLastCalledWith({ kind: "count", name: "screen_view", route: "home" });
  mocks.pathname = "/notes/private-note-id";
  view.rerender(<MarketingTracker />);
  expect(mocks.report).toHaveBeenLastCalledWith({ kind: "count", name: "screen_view", route: "editor" });
  expect(JSON.stringify(mocks.report.mock.calls)).not.toContain("private-note-id");
});
it("does not capture link clicks, form actions or input content", () => {
  const view = render(<><MarketingTracker /><button formAction="/private">Private action</button></>);
  mocks.report.mockClear();
  fireEvent.click(view.getByRole("button"));
  expect(mocks.report).not.toHaveBeenCalled();
});
