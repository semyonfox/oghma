// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChatInterface from "@/components/chat/chat-interface";

vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  default: () => ({ t: (key: string) => key }),
}));
vi.mock("@/components/chat/chat-markdown", () => ({
  default: ({ children }: { children: string }) => <p>{children}</p>,
}));
vi.mock("@/components/chat/chat-splash", () => ({
  default: () => <p>New chat suggestions</p>,
}));

const oldMessages = [
  { id: "old-user", role: "user", content: "Old question" },
  { id: "old-answer", role: "assistant", content: "Old answer" },
];
const newMessages = [
  { id: "new-user", role: "user", content: "New question" },
  {
    id: "new-answer",
    role: "assistant",
    content: "New answer",
    parts: [
      {
        type: "tool",
        name: "readNote",
        label: "Reading note",
        callId: "read-1",
        detail: "Study notes",
      },
      { type: "text", text: "New answer" },
    ],
    metadata: { thinking: "Checking the notes", thinkingDuration: 1 },
  },
];

function snapshot(messages: unknown[], generating = false) {
  return Response.json({
    session: {
      generation_status: generating ? "generating" : "idle",
      active_generation_id: generating ? "generation-1" : null,
    },
    messages,
  });
}

function setupNetwork({
  existing = true,
  resuming = false,
  failTerminalRead = false,
} = {}) {
  let completed = false;
  let accepted = false;
  let unavailableStreams = 0;
  let eventId = 0;
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let stream = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
    },
  });
  const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    if (url === "/api/chat/sessions/session-1") {
      if (completed && failTerminalRead) {
        failTerminalRead = false;
        throw new TypeError("Snapshot temporarily unavailable");
      }
      const history = existing ? oldMessages : [];
      return snapshot(
        completed
          ? [...history, ...newMessages]
          : resuming || accepted
            ? [...history, newMessages[0]]
            : history,
        (resuming || accepted) && !completed,
      );
    }
    if (url === "/api/chat" && options?.method === "POST") {
      accepted = true;
      return Response.json(
        { sessionId: "session-1", generationId: "generation-1" },
        { status: 202 },
      );
    }
    if (url.startsWith("/api/chat/generations/generation-1/stream")) {
      if (unavailableStreams > 0) {
        unavailableStreams--;
        throw new TypeError("Connection unavailable");
      }
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream" },
      });
    }
    if (url === "/api/chat/generations/generation-1/cancel") {
      return Response.json({ ok: true });
    }
    if (url === "/api/chat/sessions/session-2") {
      return snapshot([
        { id: "other-user", role: "user", content: "Other conversation" },
      ]);
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    fetchMock,
    async emit(event: string, data: unknown) {
      await act(async () => {
        controller?.enqueue(
          new TextEncoder().encode(
            `id: ${++eventId}-0\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
          ),
        );
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    },
    async disconnect() {
      await act(async () => {
        unavailableStreams = 3;
        controller?.close();
        stream = new ReadableStream<Uint8Array>({
          start(value) {
            controller = value;
          },
        });
      });
    },
    async finish() {
      completed = true;
      await act(async () => {
        controller?.enqueue(
          new TextEncoder().encode("event: done\ndata: {}\n\n"),
        );
        controller?.close();
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    },
  };
}

async function sendQuestion() {
  const input = screen.getByPlaceholderText("chat.ask_placeholder");
  await waitFor(() => expect(input.hasAttribute("disabled")).toBe(false));
  fireEvent.change(input, { target: { value: "New question" } });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await screen.findByRole("button", { name: "Stop generating" });
}

async function emitWorkLog(network: ReturnType<typeof setupNetwork>) {
  await network.emit("thinking", { text: "Checking the notes" });
  await network.emit("tool-call", {
    toolName: "readNote",
    toolCallId: "read-1",
    detail: "Study notes",
  });
  await network.emit("token", { text: "New answer" });
}

describe("chat session lifecycle", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows retry when the initial history request fails and restores on retry", async () => {
    const network = setupNetwork();
    network.fetchMock.mockRejectedValueOnce(new TypeError("History unavailable"));
    render(<ChatInterface sessionId="session-1" />);

    const retry = await screen.findByRole("button", { name: "Try again" });
    expect(screen.queryByText("New chat suggestions")).toBeNull();
    expect(screen.queryByRole("status", { name: "Loading..." })).toBeNull();
    expect(
      screen.getByPlaceholderText("chat.ask_placeholder").hasAttribute("disabled"),
    ).toBe(true);

    fireEvent.click(retry);

    await screen.findByText("Old answer");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(
      screen.getByPlaceholderText("chat.ask_placeholder").hasAttribute("disabled"),
    ).toBe(false);
  });

  it("keeps a follow-up reply and the expanded work log after saving", async () => {
    const network = setupNetwork();
    const onComplete = vi.fn();
    render(
      <ChatInterface sessionId="session-1" onStreamComplete={onComplete} />,
    );
    await screen.findByText("Old answer");
    await sendQuestion();
    await emitWorkLog(network);
    const answer = screen.getByText("New answer");
    const workLog = screen.getByRole("button", { name: /Work log/ });
    fireEvent.click(workLog);
    expect(workLog.getAttribute("aria-expanded")).toBe("true");

    await network.finish();

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith("session-1"));
    expect(screen.getByText("New answer")).toBe(answer);
    expect(screen.getByText("New question")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Work log/ })).toBe(workLog);
    expect(workLog.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Checking the notes")).toBeTruthy();
    expect(screen.getByText(/Study notes/)).toBeTruthy();
    expect(
      screen
        .getByPlaceholderText("chat.ask_placeholder")
        .hasAttribute("disabled"),
    ).toBe(false);
  });

  it("recovers the saved answer and work log when replay only supplies done", async () => {
    const network = setupNetwork();
    render(<ChatInterface sessionId="session-1" />);
    await screen.findByText("Old answer");
    await sendQuestion();
    await network.finish();
    expect(screen.getAllByText("New answer")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Work log/ }));
    expect(screen.getByText("Checking the notes")).toBeTruthy();
  });

  it("adopts a newly created session URL without replacing its answer or work log", async () => {
    const network = setupNetwork({ existing: false });
    const view = render(<ChatInterface />);
    await sendQuestion();
    await emitWorkLog(network);
    await network.finish();
    const answer = screen.getByText("New answer");
    const workLog = screen.getByRole("button", { name: /Work log/ });
    fireEvent.click(workLog);
    view.rerender(<ChatInterface sessionId="session-1" />);
    await waitFor(() =>
      expect(
        screen
          .getByPlaceholderText("chat.ask_placeholder")
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    expect(screen.getByText("New answer")).toBe(answer);
    expect(screen.getByRole("button", { name: /Work log/ })).toBe(workLog);
    expect(workLog.getAttribute("aria-expanded")).toBe("true");
  });

  it("retries a failed final snapshot without restoring the stale initial history", async () => {
    const network = setupNetwork({ failTerminalRead: true });
    render(<ChatInterface sessionId="session-1" />);
    await screen.findByText("Old answer");
    await sendQuestion();
    await network.finish();
    await screen.findByText("New answer");
    expect(screen.getAllByText("New question")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Work log/ })).toBeTruthy();
  });

  it("shows loading instead of new-chat suggestions while restoring history", async () => {
    let resolve: (response: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          }),
      ),
    );
    render(<ChatInterface sessionId="session-1" />);
    expect(screen.getByRole("status", { name: "Loading..." })).toBeTruthy();
    expect(screen.queryByText("New chat suggestions")).toBeNull();
    expect(
      screen
        .getByPlaceholderText("chat.ask_placeholder")
        .hasAttribute("disabled"),
    ).toBe(true);
    await act(async () => resolve(snapshot(oldMessages)));
    expect(screen.getByText("Old answer")).toBeTruthy();
  });

  it("resumes a background reply and enables the composer immediately on completion", async () => {
    const network = setupNetwork({ resuming: true });
    render(<ChatInterface sessionId="session-1" />);
    await screen.findByRole("button", { name: "Stop generating" });
    await emitWorkLog(network);
    await network.finish();
    expect(screen.getByText("New answer")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Work log/ })).toBeTruthy();
    expect(
      screen
        .getByPlaceholderText("chat.ask_placeholder")
        .hasAttribute("disabled"),
    ).toBe(false);
  });

  it("detaches a previous chat stream when navigating to another session", async () => {
    const network = setupNetwork();
    const onComplete = vi.fn();
    const view = render(
      <ChatInterface sessionId="session-1" onStreamComplete={onComplete} />,
    );
    await screen.findByText("Old answer");
    await sendQuestion();
    await emitWorkLog(network);
    view.rerender(
      <ChatInterface sessionId="session-2" onStreamComplete={onComplete} />,
    );
    await screen.findByText("Other conversation");
    expect(screen.queryByText("New answer")).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("reattaches after exhausted retries without losing the partial reply or work log", async () => {
    const network = setupNetwork({ resuming: true });
    render(<ChatInterface sessionId="session-1" />);
    await screen.findByRole("button", { name: "Stop generating" });
    await emitWorkLog(network);
    const answer = screen.getByText("New answer");
    const workLog = screen.getByRole("button", { name: /Work log/ });
    fireEvent.click(workLog);
    await network.disconnect();
    await waitFor(
      () => {
        const requests = network.fetchMock.mock.calls.filter(([url]) =>
          url.includes("/stream"),
        );
        expect(requests).toHaveLength(5);
        expect(requests[4][0]).toContain("after=3-0");
      },
      { timeout: 5_000 },
    );
    expect(screen.getByText("New answer")).toBe(answer);
    expect(screen.getByRole("button", { name: /Work log/ })).toBe(workLog);
    await network.finish();
    expect(screen.getByText("New answer")).toBe(answer);
    expect(workLog.getAttribute("aria-expanded")).toBe("true");
  }, 10_000);

  it("recovers a first reply after publishing its URL during a connection failure", async () => {
    const network = setupNetwork({ existing: false });
    const onComplete = vi.fn(() => {
      view.rerender(
        <ChatInterface sessionId="session-1" onStreamComplete={onComplete} />,
      );
    });
    const view = render(<ChatInterface onStreamComplete={onComplete} />);
    await sendQuestion();
    await emitWorkLog(network);
    const workLog = screen.getByRole("button", { name: /Work log/ });
    await network.disconnect();
    await waitFor(
      () => {
        expect(
          network.fetchMock.mock.calls.filter(([url]) =>
            url.includes("/stream"),
          ),
        ).toHaveLength(5);
      },
      { timeout: 5_000 },
    );
    await network.finish();
    expect(screen.getAllByText("New answer")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Work log/ })).toBe(workLog);
    expect(
      screen
        .getByPlaceholderText("chat.ask_placeholder")
        .hasAttribute("disabled"),
    ).toBe(false);
  }, 10_000);

  it("keeps listening after Stop so the saved reply and new session can settle", async () => {
    const network = setupNetwork({ existing: false });
    const onComplete = vi.fn();
    render(<ChatInterface onStreamComplete={onComplete} />);
    await sendQuestion();
    await network.emit("thinking", { text: "Checking the notes" });
    await network.emit("token", { text: "New" });
    fireEvent.click(screen.getByRole("button", { name: "Stop generating" }));
    expect(
      network.fetchMock.mock.calls.some(([url]) => url.endsWith("/cancel")),
    ).toBe(true);
    await network.finish();
    expect(screen.getAllByText("New answer")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Work log/ })).toBeTruthy();
    expect(onComplete).toHaveBeenCalledWith("session-1");
  });
});
