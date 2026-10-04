// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkLog, collectNoteActivity } from "@/components/chat/tool-call-pill";
import type { MessagePart } from "@/lib/chat/types";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  default: () => ({
    t: (key: string, params?: { count?: number }) =>
      key.replace("{count}", String(params?.count ?? "")),
  }),
}));

const one = "154b1133-54df-4e0e-a154-9b637750f106";
const two = "67e55044-10b1-426f-9247-bb680e5fe0c8";
const parts: MessagePart[] = [
  {
    type: "tool",
    name: "getChunks",
    label: "Searching notes",
    status: "completed",
    notes: [
      { id: one, title: "Database Design" },
      { id: two, title: "Normalization" },
    ],
  },
  {
    type: "tool",
    name: "readNote",
    label: "Reading note",
    status: "completed",
    notes: [{ id: one, title: "Database Design" }],
  },
];

describe("chat activity", () => {
  it("shows one quiet progress line while searching", () => {
    render(
      <WorkLog
        parts={[
          {
            type: "tool",
            name: "getChunks",
            label: "Searching notes",
            status: "running",
          },
        ]}
        active
      />,
    );
    expect(screen.getByRole("status").textContent).toBe("Searching notes...");
    expect(screen.queryByText("1 action")).toBeNull();
  });

  it("distinguishes read notes from search matches and links both", () => {
    expect(collectNoteActivity(parts)).toEqual([
      { id: one, title: "Database Design", action: "read" },
      { id: two, title: "Normalization", action: "found" },
    ]);
    render(<WorkLog parts={parts} />);
    const toggle = screen.getByRole("button", { name: "Found 2 notes · Read 1 note" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("link")).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(
      screen
        .getByRole("link", { name: "Database Design" })
        .getAttribute("href"),
    ).toBe(`/notes/${one}`);
    expect(
      screen.getByRole("link", { name: "Normalization" }).getAttribute("href"),
    ).toBe(`/notes/${two}`);
    expect(screen.getByText("Found")).toBeTruthy();
  });

  it("uses found wording when no note was read", () => {
    render(<WorkLog parts={[parts[0]]} />);
    expect(screen.getByRole("button", { name: "Found 2 notes" })).toBeTruthy();
  });

  it("summarizes a search with no matches", () => {
    render(<WorkLog parts={[{
      type: "tool", name: "getChunks", label: "Searching notes", status: "completed", notes: [],
    }]} />);
    expect(screen.getByRole("status").textContent).toBe("No matching notes");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("links completed reads saved before structured note references", () => {
    render(<WorkLog parts={[{
      type: "tool", name: "readNote", label: "Reading note", status: "completed",
      detail: one, resultDetail: "Database Design",
    }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Read 1 note" }));
    expect(screen.getByRole("link", { name: "Database Design" }).getAttribute("href")).toBe(`/notes/${one}`);
  });

  it("keeps technical activity hidden once an answer is complete", () => {
    const { container } = render(
      <WorkLog
        parts={[
          {
            type: "tool",
            name: "getTimeBlocks",
            label: "Checking calendar",
            status: "completed",
          },
        ]}
      />,
    );
    expect(container.textContent).toBe("");
  });
});
