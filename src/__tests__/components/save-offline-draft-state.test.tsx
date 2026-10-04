// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/lib/native-app", () => ({ useNativeAppBridge: () => true, supportsNativeOffline: () => true, saveNativeOfflineNote: vi.fn() }));
vi.mock("@/lib/notes/hooks/use-i18n", () => ({ default: () => ({ t: (key: string) => key }) }));
import SaveOfflineButton from "@/components/notes/save-offline-button";
import useSaveIndicatorStore, { saveIndicatorKey } from "@/lib/notes/state/save-indicator";
afterEach(cleanup);
it("blocks downloading a saved server copy while either pane has unsaved changes", () => {
  const save = vi.fn();
  useSaveIndicatorStore.setState({ files: { note: { state: "saved", save }, [saveIndicatorKey("note", "B")]: { state: "dirty", save } } });
  render(<SaveOfflineButton noteId="note" />);
  expect(screen.getByRole("button", { name: "Save your changes before downloading" })).toHaveProperty("disabled", true);
  act(() => useSaveIndicatorStore.getState().setIndicator(saveIndicatorKey("note", "B"), { state: "saved", save }));
  expect(screen.getByRole("button", { name: "Save offline" })).toHaveProperty("disabled", false);
});

it("keeps offline download unavailable until local draft recovery is ready", () => {
  const save = vi.fn();
  useSaveIndicatorStore.setState({ files: {} });
  render(<SaveOfflineButton noteId="note" />);
  expect(screen.getByRole("button")).toHaveProperty("disabled", true);
  act(() => useSaveIndicatorStore.getState().setIndicator("note", { state: "saved", save, ready: false }));
  expect(screen.getByRole("button")).toHaveProperty("disabled", true);
  act(() => useSaveIndicatorStore.getState().setIndicator("note", { state: "saved", save, ready: true }));
  expect(screen.getByRole("button")).toHaveProperty("disabled", false);
});
