// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import NoteSections from "@/components/notes/note-sections";
import { encodeSectionKey } from "@/lib/notes/sections";

vi.mock("@/lib/notes/hooks/use-i18n", () => ({ default: () => ({ t: (key: string) => key }) }));
const noteId = "00000000-0000-4000-8000-000000000001";
const summaryId = "00000000-0000-4000-8000-000000000002";
const cardId = "00000000-0000-4000-8000-000000000003";
const key = JSON.stringify([["Lecture", "Stacks"], 2]);

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("/summary")) return Response.json({ noteId: summaryId });
    if (url.endsWith("/cards")) return Response.json({ cards: [{ id: cardId, front: "What order?", back: "LIFO" }] });
    return Response.json({ sections: [{ key, title: "Lecture / Stacks" }] });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("encodes the section key and shows linked summaries and generated cards beside the section", async () => {
  render(<NoteSections noteId={noteId} />);
  fireEvent.click(await screen.findByRole("button", { name: "sections.summarise" }));
  const link = await screen.findByRole("link", { name: "sections.open_summary" });
  expect(link.getAttribute("href")).toBe(`/notes/${summaryId}`);
  expect(fetch).toHaveBeenCalledWith(`/api/notes/${noteId}/sections/${encodeSectionKey(key)}/summary`, { method: "POST" });
  fireEvent.click(screen.getByRole("button", { name: "sections.cards" }));
  await screen.findByText("What order?");
  expect(screen.getByText("LIFO")).toBeTruthy();
  expect(screen.getByRole("link", { name: "sections.open_summary" })).toBeTruthy();
});

it("shows a translated error and enables retry after a generation failure", async () => {
  render(<NoteSections noteId={noteId} />);
  const button = await screen.findByRole("button", { name: "sections.summarise" });
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ error: "Note changed" }, { status: 409 }));
  fireEvent.click(button);
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "sections.error");
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
});
