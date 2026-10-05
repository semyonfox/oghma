// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import ActionConfirmation from "@/components/chat/action-confirmation";

const id = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const proposal = {
  id,
  tool_name: "renameNote",
  input: { noteId: other, newTitle: "<script>injected</script>" },
  status: "pending",
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("reviewing canonical tool proposals", () => {
  it("shows the stored arguments as text and submits only the decision", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(proposal))
      .mockResolvedValueOnce(Response.json({ status: "completed" }));
    vi.stubGlobal("fetch", fetch);
    render(<ActionConfirmation actionId={id} />);
    const approve = await screen.findByRole("button", {
      name: "Approve action",
    });
    expect(document.querySelector("pre")?.textContent).toBe(
      JSON.stringify(proposal.input, null, 2),
    );
    expect(document.querySelector("script")).toBeNull();
    fireEvent.click(approve);
    await screen.findByText("Action completed");
    expect(fetch).toHaveBeenLastCalledWith(
      `/api/chat/actions/${id}`,
      expect.objectContaining({
        method: "POST",
        body: '{"decision":"approve"}',
      }),
    );
  });
  it("cannot approve a new id while still displaying the old proposal", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(proposal))
      .mockImplementationOnce(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetch);
    const view = render(<ActionConfirmation actionId={id} />);
    await screen.findByRole("button", { name: "Approve action" });
    view.rerender(<ActionConfirmation actionId={other} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: "Approve action" })).toBeNull();
    expect(screen.queryByText("renameNote")).toBeNull();
  });
});
