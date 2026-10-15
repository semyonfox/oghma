// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  default: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/chat/hooks/use-chat-stream", () => ({
  useChatStream: () => ({
    messages: [],
    loading: false,
    send: mocks.send,
    setMessages: vi.fn(),
    setSessionId: vi.fn(),
  }),
}));
vi.mock("@/lib/chat/hooks/use-chat-persistence", () => ({
  useChatPersistence: () => ({
    thinkingMode: "off",
    useRag: true,
    backgroundLoading: false,
    claimBackgroundGeneration: vi.fn(),
    updateRefs: vi.fn(),
  }),
}));
import useNoteStore from "@/lib/notes/state/note";
import ChatInterface from "@/components/chat/chat-interface";
afterEach(cleanup);
describe("note composer draft recovery", () => {
  it("restores an unsent question after closing and reopening the inspector", () => {
    const view = render(<ChatInterface compact noteId="draft-recovery-note" />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Explain the final equation" },
    });
    view.unmount();
    render(<ChatInterface compact noteId="draft-recovery-note" />);
    expect(screen.getByRole("textbox").getAttribute("value")).toBe(
      "Explain the final equation",
    );
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(mocks.send).toHaveBeenCalledWith("Explain the final equation", []);
    expect(screen.getByRole("textbox").getAttribute("value")).toBe("");
  });
  it("keeps separate questions when switching between notes", () => {
    const view = render(<ChatInterface compact noteId="draft-note-a" />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Question about A" },
    });
    view.rerender(<ChatInterface compact noteId="draft-note-b" />);
    expect(screen.getByRole("textbox").getAttribute("value")).toBe("");
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Question about B" },
    });
    view.rerender(<ChatInterface compact noteId="draft-note-a" />);
    expect(screen.getByRole("textbox").getAttribute("value")).toBe(
      "Question about A",
    );
  });
});

it("does not restore another workspace generation's unsent question", () => {
  const view = render(<ChatInterface compact noteId="session-question" />);
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Private question" },
  });
  view.unmount();
  useNoteStore.setState({ generation: useNoteStore.getState().generation + 1 });
  render(<ChatInterface compact noteId="session-question" />);
  expect(screen.getByRole("textbox").getAttribute("value")).toBe("");
});
