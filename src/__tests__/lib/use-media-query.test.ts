// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import useMediaQuery from "@/lib/hooks/use-media-query";

describe("useMediaQuery", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("tracks media query changes", () => {
    let listener: (() => void) | undefined;
    const mediaQuery = {
      matches: false,
      addEventListener: vi.fn((_event: string, nextListener: () => void) => {
        listener = nextListener;
      }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal("matchMedia", vi.fn(() => mediaQuery));

    const { result, unmount } = renderHook(() =>
      useMediaQuery("(min-width: 768px)"),
    );

    expect(result.current).toBe(false);

    act(() => {
      mediaQuery.matches = true;
      listener?.();
    });

    expect(result.current).toBe(true);
    unmount();
    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
  });
});
