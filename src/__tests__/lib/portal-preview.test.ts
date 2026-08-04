import { afterEach, describe, expect, it, vi } from "vitest";
import usePortalStore from "@/lib/notes/state/portal";

describe("note preview close coordination", () => {
  afterEach(() => {
    usePortalStore.getState().preview.close();
    vi.useRealTimers();
  });

  it("keeps the preview open when the pointer reaches the preview card", () => {
    vi.useFakeTimers();
    const preview = usePortalStore.getState().preview;

    preview.open();
    preview.scheduleClose(500);
    vi.advanceTimersByTime(300);
    preview.cancelClose();
    vi.advanceTimersByTime(500);

    expect(usePortalStore.getState().preview.visible).toBe(true);
  });

  it("closes after the scheduled grace period", () => {
    vi.useFakeTimers();
    const preview = usePortalStore.getState().preview;

    preview.open();
    preview.scheduleClose(500);
    vi.advanceTimersByTime(500);

    expect(usePortalStore.getState().preview.visible).toBe(false);
  });
});
