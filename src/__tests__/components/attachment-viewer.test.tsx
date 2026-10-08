// @vitest-environment jsdom

import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withI18n } from "../test-utils/i18n";
import { buildFileSpec } from "@/lib/notes/utils/file-spec";

vi.mock("next/dynamic", () => ({ default: () => () => <div>PDF viewer</div> }));
vi.mock("@/components/editor/markdown-editor", () => ({
  default: () => <textarea aria-label="Markdown editor" />,
}));
vi.mock("@/components/editor/image-viewer", () => ({ default: () => null }));
vi.mock("@/components/editor/video-viewer", () => ({ default: () => null }));

import FileRenderer from "@/components/editor/file-renderer";

const source = "public class BinaryNode<T> {\n    private T data;\n}\n";
const file = buildFileSpec({
  id: "java-note", title: "BinaryNode.java", content: "",
  s3Key: "canvas/course/BinaryNode.java", mimeType: "text/plain",
});
const fetchMock = vi.fn<typeof fetch>();

function renderFile(spec = file) {
  return render(withI18n(<FileRenderer pane="A" file={spec} />));
}

describe("imported attachment rendering", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(Response.json({ url: "/api/upload?stream=1" }));
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("opens the stored Java source without mounting an editable note", async () => {
    fetchMock.mockResolvedValueOnce(new Response(source));
    renderFile();
    await waitFor(() => expect(screen.getByLabelText("File contents").textContent).toBe(source));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/upload?path=canvas%2Fcourse%2FBinaryNode.java");
    expect(screen.getByRole("link", { name: "Download file" }).getAttribute("download")).toBe("BinaryNode.java");
  });

  it("renders markup as literal source text", async () => {
    const html = '<script>alert("bad")</script><h1>not a heading</h1>';
    fetchMock.mockResolvedValueOnce(new Response(html));
    const { container } = renderFile();
    await waitFor(() => expect(screen.getByLabelText("File contents").textContent).toBe(html));
    expect(container.querySelector("script, h1")).toBeNull();
  });

  it("keeps the extracted Markdown companion editable", () => {
    renderFile(buildFileSpec({ id: "md-note", title: "BinaryNode.md", content: source }));
    expect(screen.getByRole("textbox", { name: "Markdown editor" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("offers a download for unsupported files without fetching binary content", async () => {
    renderFile(buildFileSpec({ id: "zip", title: "code.zip", s3Key: "canvas/code.zip" }));
    await screen.findByText("Preview is not available for this file. Download it to open it.");
    expect(screen.getByRole("link", { name: "Download file" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it.each(["resolve", "stream"])("shows an error when the %s request fails", async (stage) => {
    if (stage === "resolve") fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    renderFile();
    await screen.findByText("Could not load this file. Try reopening it.");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByLabelText("File contents")).toBeNull();
  });

  it("distinguishes an empty original from a missing original", async () => {
    fetchMock.mockResolvedValueOnce(new Response(""));
    renderFile();
    await screen.findByText("This file is empty.");
    expect(screen.getByRole("link", { name: "Download file" })).toBeTruthy();
  });

  it("stops an oversized streamed preview even without a content-length header", async () => {
    fetchMock.mockResolvedValueOnce(new Response("a".repeat(2 * 1024 * 1024 + 1)));
    renderFile();
    await screen.findByText("This file is too large to preview. Download it to read it.");
    expect(screen.queryByLabelText("File contents")).toBeNull();
  });

  it("does not display binary bytes mislabeled as text", async () => {
    fetchMock.mockResolvedValueOnce(new Response("data\0binary"));
    renderFile();
    await screen.findByText("Preview is not available for this file. Download it to open it.");
  });

  it("does not show the previous file's contents or download while switching files", async () => {
    let finishOld!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }));
    const { rerender } = renderFile();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    fetchMock.mockResolvedValueOnce(Response.json({ url: "/api/upload?next=1&stream=1" }));
    fetchMock.mockResolvedValueOnce(new Response("class Next {}"));
    const next = buildFileSpec({ id: "next", title: "Next.java", s3Key: "canvas/Next.java" });
    rerender(withI18n(<FileRenderer pane="A" file={next} />));
    expect(screen.queryByLabelText("File contents")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    await screen.findByText("class Next {}");
    await act(async () => { finishOld(new Response(source)); });
    expect(screen.getByLabelText("File contents").textContent).toBe("class Next {}");
    expect(screen.getByRole("link", { name: "Download file" }).getAttribute("download")).toBe("Next.java");
  });
});
