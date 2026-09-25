// @vitest-environment jsdom

import React, { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CanvasInstitutionPicker from "@/components/settings/canvas/canvas-institution-picker";
import {
  canvasHostFromInput,
  parseCanvasInstitutions,
} from "@/lib/canvas/institution-search";

vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  default: () => ({ t: (key: string) => key }),
}));

function Picker({ initialDomain = "" }: { initialDomain?: string }) {
  const [domain, setDomain] = useState(initialDomain);
  return (
    <>
      <CanvasInstitutionPicker domain={domain} setDomain={setDomain} />
      <output data-testid="selected-domain">{domain}</output>
    </>
  );
}

describe("Canvas institution picker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("searches Canvas after typing and selects only a supported host", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { name: "University of Galway", domain: "universityofgalway.instructure.com" },
        { name: "Custom School", domain: "canvas.custom.edu" },
        { name: "Lookalike", domain: "school.instructure.com.attacker.test" },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Picker />);

    fireEvent.change(screen.getByLabelText("Find your school on Canvas"), {
      target: { value: "Galway" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(new URL(url).searchParams.get("name")).toBe("Galway");
    expect(options.credentials).toBe("omit");
    expect(screen.getByRole("button", { name: /Custom School/ }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: /Lookalike/ }).hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /University of Galway/ }));
    expect(screen.getByTestId("selected-domain").textContent).toBe(
      "universityofgalway.instructure.com",
    );
  });

  it("keeps manual URL entry available when directory search fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    render(<Picker />);

    fireEvent.change(screen.getByLabelText("Find your school on Canvas"), {
      target: { value: "Galway" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(screen.getByText("School search is unavailable. Use your Canvas URL instead.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Use your Canvas URL instead" }));
    const input = screen.getByLabelText("Canvas URL");
    fireEvent.change(input, {
      target: { value: "https://example.instructure.com/courses/123" },
    });
    expect(screen.getByTestId("selected-domain").textContent).toBe("example.instructure.com");

    fireEvent.change(input, {
      target: { value: "https://example.instructure.com.attacker.test" },
    });
    expect(screen.getByTestId("selected-domain").textContent).toBe("");
    expect(screen.getByRole("alert").textContent).toContain(".instructure.com");
  });

  it("ignores a late result from an earlier search", async () => {
    let resolveFirst: ((value: unknown) => void) | undefined;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise((resolve) => { resolveFirst = resolve; }),
      )
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { name: "Oxford", domain: "oxford.instructure.com" },
        ],
      });
    vi.stubGlobal("fetch", fetchMock);
    render(<Picker />);

    fireEvent.change(screen.getByLabelText("Find your school on Canvas"), {
      target: { value: "Galway" },
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    fireEvent.change(screen.getByLabelText("Find your school on Canvas"), {
      target: { value: "Oxford" },
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    expect(screen.getByRole("button", { name: /Oxford/ })).toBeTruthy();

    await act(async () => {
      resolveFirst?.({
        ok: true,
        json: async () => [
          { name: "Galway", domain: "galway.instructure.com" },
        ],
      });
    });
    expect(screen.queryByRole("button", { name: /Galway/ })).toBeNull();
  });

  it("shows the known Canvas host when reconnecting", () => {
    render(<Picker initialDomain="example.instructure.com" />);
    expect((screen.getByLabelText("Canvas URL") as HTMLInputElement).value).toBe(
      "example.instructure.com",
    );
  });
});

describe("Canvas institution domains", () => {
  it("normalizes Canvas URLs and rejects credential or host tricks", () => {
    expect(canvasHostFromInput("https://School.instructure.com/courses/1")).toBe(
      "school.instructure.com",
    );
    for (const value of [
      "https://school.instructure.com@attacker.test",
      "school.instructure.com.attacker.test",
      "https://school.instructure.com:8443",
      "https://localhost",
      "https://canvas.custom.edu",
      "https://sub.school.instructure.com",
    ]) {
      expect(canvasHostFromInput(value)).toBeNull();
    }
  });

  it("ignores malformed directory entries", () => {
    expect(parseCanvasInstitutions([null, {}, { name: "Bad", domain: 4 }])).toEqual([]);
    expect(parseCanvasInstitutions({ name: "Not a list" })).toEqual([]);
  });
});
