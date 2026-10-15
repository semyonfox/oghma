// @vitest-environment jsdom

import React from "react";
import { render, waitFor, screen } from "@testing-library/react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  __esModule: true,
  default: () => ({ t: (key: string) => key }),
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));

// the real polling hook, so the status response shape is checked by its validator
import DataExportSection from "@/components/settings/data-export-section";

const originalFetch = globalThis.fetch;
const fetchMock = vi.fn();

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

// mirrors GET /api/vault/status: absent fields omitted, timestamps may be null
function importStatus(status: string, extra: Record<string, unknown> = {}) {
  return {
    job: {
      jobId: "job-1",
      type: "vault-import",
      status,
      createdAt: "2026-10-06T00:00:00Z",
      startedAt: null,
      completedAt: null,
      expectedTotal: null,
      cancelRequested: false,
      ...extra,
    },
    progress: { completed: 3, total: 0 },
  };
}

describe("DataExportSection status polling", () => {
  let importResponses: unknown[];

  beforeEach(() => {
    vi.clearAllMocks();
    importResponses = [];
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "/api/calendar/token") return jsonResponse({});
      if (url === "/api/vault/status?type=vault-import") {
        return jsonResponse(importResponses.length > 1 ? importResponses.shift() : importResponses[0]);
      }
      if (url === "/api/vault/status?type=vault-export") return jsonResponse({});
      throw new Error(`Unexpected fetch: ${url}`);
    });
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it("follows a running import through to completion", async () => {
    importResponses = [
      importStatus("processing"),
      importStatus("processing"),
      importStatus("complete", { expectedTotal: 3 }),
    ];

    render(React.createElement(DataExportSection));

    // streaming imports have no total yet, so no misleading 3/0 or 100%
    await screen.findByText("Processing 3 files...");
    await waitFor(
      () => expect(mocks.toast.success).toHaveBeenCalledWith("Vault import complete!"),
      { timeout: 10_000 },
    );
  }, 15_000);

  it("restores an outstanding cancel request after returning to settings", async () => {
    importResponses = [importStatus("processing", { cancelRequested: true })];

    render(React.createElement(DataExportSection));

    const button = await screen.findByRole("button", { name: "Cancelling..." });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});
