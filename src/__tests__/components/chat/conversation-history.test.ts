// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConversationHistory } from "@/app/chat/chat-page-client";

const conversations = [
  {
    id: "pinned-1",
    title: "Pinned conversation",
    messageCount: 2,
    createdAt: Date.now(),
    pinned: true,
  },
  {
    id: "recent-1",
    title: "Recent conversation",
    messageCount: 1,
    createdAt: Date.now(),
    pinned: false,
  },
];

describe("ConversationHistory", () => {
  it("collapses pinned conversations and preserves access to recents", () => {
    render(
      React.createElement(ConversationHistory, {
        conversations,
        activeId: null,
        loaded: true,
        t: (key) => key,
        onNewConversation: vi.fn(),
        onSelectConversation: vi.fn(),
        onDeleteConversation: vi.fn(),
        onRenameConversation: vi.fn().mockResolvedValue(true),
        onTogglePinned: vi.fn().mockResolvedValue(true),
        onDismiss: vi.fn(),
        showHeader: false,
      }),
    );

    const toggle = screen.getByRole("button", { name: /Pinned/ });
    const pinnedPanel = document.getElementById("pinned-conversations");

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(pinnedPanel?.hidden).toBe(false);
    expect(pinnedPanel?.closest("section")?.className).toContain("max-h-[35%]");
    expect(screen.getByText("Recent conversation")).toBeTruthy();

    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(pinnedPanel?.hidden).toBe(true);
    expect(screen.getByText("Recent conversation")).toBeTruthy();
  });
});
