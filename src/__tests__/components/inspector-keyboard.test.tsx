// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  default: () => ({ t: (key: string) => key }),
}));
import NoteInspectorPanel from "@/components/notes/note-inspector-panel";
import useLayoutStore from "@/lib/notes/state/layout";
afterEach(cleanup);
describe("inspector keyboard recovery", () => {
  it("keeps Tasks in the tab order and supports arrows, Home and End", () => {
    useLayoutStore.setState({
      paneA: { fileId: "", fileType: "note" },
      paneB: null,
      activePane: "A",
      rightPanelOpen: true,
      rightPanelTab: "tasks",
    });
    render(<NoteInspectorPanel presentation="drawer" />);
    const tasks = screen.getByRole("tab", { name: "Global Tasks" });
    const meta = screen.getByRole("tab", { name: "Meta" });
    expect(tasks.tabIndex).toBe(0);
    expect(meta.tabIndex).toBe(-1);
    tasks.focus();
    fireEvent.keyDown(tasks, { key: "ArrowRight" });
    expect(document.activeElement).toBe(meta);
    expect(meta.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(meta, { key: "End" });
    expect(document.activeElement).toBe(tasks);
    fireEvent.keyDown(tasks, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "AI" }),
    );
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(document.activeElement).toBe(meta);
  });
});
