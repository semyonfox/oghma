// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
  usePollingJob: vi.fn(),
}));

vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  __esModule: true,
  default: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/hooks/use-polling-job", () => ({
  usePollingJob: mocks.usePollingJob,
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

import DataExportSection from "@/components/settings/data-export-section";

const originalFetch = globalThis.fetch;
const originalXhr = globalThis.XMLHttpRequest;
const fetchMock = vi.fn();

class FakeXMLHttpRequest {
  static instances: FakeXMLHttpRequest[] = [];

  method = "";
  url = "";
  status = 200;
  body: Document | XMLHttpRequestBodyInit | null = null;
  headers = new Map<string, string>();
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = {
    onprogress: null,
  };

  constructor() {
    FakeXMLHttpRequest.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.headers.set(name, value);
  }

  send(body: Document | XMLHttpRequestBodyInit | null) {
    this.body = body;
    queueMicrotask(() => this.onload?.());
  }
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function requestUrl(input: RequestInfo | URL) {
  return typeof input === "string" ? input : input.toString();
}

function setSelectedFile(input: HTMLInputElement, file: File) {
  Object.defineProperty(input, "value", {
    configurable: true,
    writable: true,
    value: `C:\\fakepath\\${file.name}`,
  });
  fireEvent.change(input, { target: { files: [file] } });
}

describe("DataExportSection vault import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    FakeXMLHttpRequest.instances.length = 0;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    globalThis.XMLHttpRequest =
      FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;

    fetchMock.mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);
        if (url === "/api/calendar/token") return jsonResponse({ token: null });
        if (url.startsWith("/api/vault/status")) {
          return jsonResponse({ job: null, downloadUrl: null, progress: null });
        }
        if (url === "/api/vault/import" && init?.method === "POST") {
          return jsonResponse({
            uploadUrl: "https://storage.example/upload",
            s3Key: "vault-uploads/u1/upload.ZIP",
            contentLength: 3,
          });
        }
        if (url === "/api/vault/import/start" && init?.method === "POST") {
          return jsonResponse({ jobId: "job-1" });
        }
        throw new Error(`Unexpected fetch: ${init?.method || "GET"} ${url}`);
      },
    );
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
    globalThis.XMLHttpRequest = originalXhr;
  });

  it("accepts uppercase ZIP files and sends the signed upload constraints", async () => {
    render(React.createElement(DataExportSection));
    const input = document.querySelector(
      "#vault-import-file",
    ) as HTMLInputElement;
    const file = new File(["zip"], "Backup.ZIP", {
      type: "application/zip",
    });

    setSelectedFile(input, file);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/vault/import/start",
        expect.objectContaining({ method: "POST" }),
      );
    });

    const presignCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        requestUrl(url) === "/api/vault/import" && init?.method === "POST",
    );
    expect(JSON.parse(presignCall?.[1]?.body as string)).toEqual({
      filename: "Backup.ZIP",
      contentLength: 3,
    });

    expect(FakeXMLHttpRequest.instances).toHaveLength(1);
    const xhr = FakeXMLHttpRequest.instances[0];
    expect(xhr.method).toBe("PUT");
    expect(xhr.url).toBe("https://storage.example/upload");
    expect(xhr.headers.get("Content-Type")).toBe("application/zip");
    expect(xhr.headers.get("x-amz-meta-expected-size")).toBe("3");
    expect(xhr.body).toBe(file);
    expect(input.value).toBe("");
  });

  it("rejects non-ZIP files and resets the input for reselection", () => {
    render(React.createElement(DataExportSection));
    const input = document.querySelector(
      "#vault-import-file",
    ) as HTMLInputElement;
    const file = new File(["text"], "notes.txt", { type: "text/plain" });

    setSelectedFile(input, file);
    expect(mocks.toast.error).toHaveBeenCalledWith(
      "Please select a .zip file",
    );
    expect(input.value).toBe("");

    setSelectedFile(input, file);
    expect(mocks.toast.error).toHaveBeenCalledTimes(2);
    expect(input.value).toBe("");
    expect(
      fetchMock.mock.calls.some(
        ([url]) => requestUrl(url) === "/api/vault/import",
      ),
    ).toBe(false);
    expect(FakeXMLHttpRequest.instances).toHaveLength(0);
  });
});
