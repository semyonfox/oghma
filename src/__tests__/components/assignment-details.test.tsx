// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AssignmentDetails from "@/components/assignments/assignment-details";
import type { Assignment } from "@/lib/notes/state/assignments.zustand";
vi.mock("@/lib/notes/hooks/use-i18n", () => ({ default: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/assignments/assignment-materials", () => ({ default: () => <div>Materials</div> }));
const assignment: Assignment = {
  id: "task-1", title: "Essay", description: "Read chapter 2", source: "canvas", assignment_type: "assignment",
  canvas_course_id: "1", canvas_assignment_id: "2", course_name: "History", course_color: null,
  due_at: null, status: "upcoming", estimated_hours: null, logged_hours: 0, submitted_at: null,
  score: null, points_possible: 10, created_at: "2026-09-21", updated_at: "2026-09-21",
};
const details = { url: "https://school.instructure.com/courses/1/assignments/2", description: "<p>Write an essay</p>", types: ["online_text_entry"], locked: false, submittedAt: null };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("assignment details", () => {
  it("requires review before sending coursework", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(details))).mockResolvedValueOnce(new Response('{"submitted":true}'));
    vi.stubGlobal("fetch", fetch);
    render(<AssignmentDetails assignment={assignment} onClose={vi.fn()} />);
    await screen.findByText("Write an essay");
    fireEvent.change(screen.getByLabelText("Your submission"), { target: { value: "My essay" } });
    fireEvent.click(screen.getByRole("button", { name: "Review submission" }));
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Confirm submission" }));
    await screen.findByText("Submitted to Canvas. Open Canvas to view your submission.");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][1]).toMatchObject({ method: "POST", body: JSON.stringify({ type: "online_text_entry", content: "My essay" }) });
  });
  it("ignores swipe-to-dismiss while a submission is saving", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(details))).mockReturnValueOnce(new Promise(() => {})));
    const close = vi.fn();
    render(<AssignmentDetails assignment={assignment} onClose={close} />);
    await screen.findByText("Write an essay");
    const title = screen.getByRole("heading", { name: "Essay" });
    const drag = () => {
      const at = (y: number) => ({ touches: [{ identifier: 0, clientX: 100, clientY: y }], cancelable: true });
      fireEvent.touchStart(title, at(100));
      fireEvent.touchMove(title, at(190));
      fireEvent.touchEnd(title, { touches: [], changedTouches: at(190).touches, cancelable: true });
    };
    drag();
    expect(close).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByLabelText("Your submission"), { target: { value: "My essay" } });
    fireEvent.click(screen.getByRole("button", { name: "Review submission" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm submission" }));
    await screen.findByRole("button", { name: "Submitting..." });
    drag();
    expect(close).toHaveBeenCalledOnce();
  });
  it("sanitizes imported HTML and links unsupported submission types to Canvas", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...details, types: ["online_upload"], description: '<p>Instructions</p><a href="/courses/1/files/3">Reading</a><script>alert(1)</script><a href="javascript:alert(1)">Bad link</a>' }))));
    const { container } = render(<AssignmentDetails assignment={assignment} onClose={vi.fn()} />);
    await screen.findByText("Instructions");
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText("Bad link").getAttribute("href")).toBeNull();
    expect(screen.getByRole("link", { name: "Reading" }).getAttribute("href")).toBe("https://school.instructure.com/courses/1/files/3");
    expect(screen.getByRole("link", { name: /Open in Canvas/ }).getAttribute("href")).toBe(details.url);
    expect(screen.queryByRole("button", { name: "Review submission" })).toBeNull();
  });
  it("shows manual task notes without calling Canvas", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<AssignmentDetails assignment={{ ...assignment, source: "manual" }} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Read chapter 2")).toBeTruthy());
    expect(fetch).not.toHaveBeenCalled();
  });
});
