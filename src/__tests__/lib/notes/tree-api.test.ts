import { afterEach, describe, expect, it, vi } from "vitest";
import { treeAPI, TreeRequestError } from "@/lib/notes/api/tree";

afterEach(() => vi.unstubAllGlobals());

describe("tree HTTP boundary", () => {
  it("rejects HTTP failures instead of returning an apparent mutation success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Conflict", { status: 409 })));
    await expect(treeAPI.mutate({ action: "move", data: {
      noteId: "note", expectedParentId: null, parentId: "folder",
    } })).rejects.toEqual(new TreeRequestError(409));
  });

  it("requires canonical move identity and parents in a successful response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ success: true })));
    await expect(treeAPI.mutate({ action: "move", data: {
      noteId: "note", expectedParentId: null, parentId: "folder",
    } })).rejects.toThrow();
  });

  it("rejects malformed child snapshots at the boundary", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ parentId: "root", items: [{ id: 3 }] })));
    await expect(treeAPI.fetch()).rejects.toThrow();
  });

  it("keeps refresh requests independent and passes the owner's abort signal", async () => {
    const fetch = vi.fn().mockImplementation(async () => Response.json({ parentId: "root", items: [] }));
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    await Promise.all([treeAPI.fetch(controller.signal), treeAPI.fetch(controller.signal)]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith("/api/tree/children", { signal: controller.signal, cache: "no-store" });
  });
});
