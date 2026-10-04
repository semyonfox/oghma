// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AssignmentMaterials from "@/components/assignments/assignment-materials";
vi.mock("@/lib/notes/hooks/use-i18n", () => ({ default: () => ({ t: (key: string) => key }) }));
const material = { id: "10", name: "Brief.pdf", status: "available", noteId: null, url: "https://canvas.example.edu/courses/7/files/10" };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("assignment materials panel", () => {
  it("discovers on open but only imports after a click", async () => {
    const fetch = vi.fn().mockImplementation(async (_url, options) => new Response(JSON.stringify(options?.method === "POST" ? { queued: true, jobId: "123e4567-e89b-42d3-a456-426614174001" } : { materials: [material] })));
    vi.stubGlobal("fetch", fetch);
    render(<AssignmentMaterials assignmentId="task-1" />);
    await screen.findByText("Brief.pdf");
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Import materials" }));
    await screen.findByText(/Materials queued for import/);
    expect(fetch).toHaveBeenCalledWith("/api/assignments/task-1/materials", { method: "POST" });
  });
  it("opens the imported copy and offers no duplicate import", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ materials: [{ ...material, status: "imported", noteId: "123e4567-e89b-42d3-a456-426614174001" }] }))));
    render(<AssignmentMaterials assignmentId="task-1" />);
    const link = await screen.findByRole("link", { name: "Open in OghmaNotes" });
    expect(link.getAttribute("href")).toBe("/notes/123e4567-e89b-42d3-a456-426614174001");
    expect(screen.queryByRole("button", { name: "Import materials" })).toBeNull();
  });
  it("shows import conflicts without reporting success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_url, options) => options?.method === "POST" ? new Response(JSON.stringify({ error: "Another Canvas import is running." }), { status: 409 }) : new Response(JSON.stringify({ materials: [material] }))));
    render(<AssignmentMaterials assignmentId="task-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Import materials" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Another Canvas import"));
    expect(screen.queryByText(/Materials queued for import/)).toBeNull();
  });
});
