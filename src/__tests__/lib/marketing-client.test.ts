// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { trackMarketingEvent } from "@/lib/marketing/client";

const LEGACY_STORAGE_KEYS = [
  "oghma_marketing_session",
  "oghma_marketing_first_touch",
  "oghma_marketing_last_touch",
];

function seedLegacyStorage() {
  for (const key of LEGACY_STORAGE_KEYS) {
    sessionStorage.setItem(key, "legacy-identifier");
  }
}

function expectLegacyStorageCleared() {
  for (const key of LEGACY_STORAGE_KEYS) {
    expect(sessionStorage.getItem(key)).toBeNull();
  }
}

describe("marketing client privacy signals", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>());
    sessionStorage.clear();
    seedLegacyStorage();
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, "doNotTrack");
    Reflect.deleteProperty(navigator, "globalPrivacyControl");
    Reflect.deleteProperty(window, "doNotTrack");
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("honors Global Privacy Control without sending or retaining analytics data", () => {
    Object.defineProperty(navigator, "globalPrivacyControl", {
      configurable: true,
      value: true,
    });

    trackMarketingEvent("page_view");

    expect(fetch).not.toHaveBeenCalled();
    expectLegacyStorageCleared();
  });

  it.each(["1", "YES"])(
    "honors Do Not Track value %s without sending or retaining analytics data",
    (value) => {
      Object.defineProperty(navigator, "doNotTrack", {
        configurable: true,
        value,
      });

      trackMarketingEvent("page_view");

      expect(fetch).not.toHaveBeenCalled();
      expectLegacyStorageCleared();
    },
  );

  it("honors the legacy window Do Not Track signal", () => {
    Object.defineProperty(window, "doNotTrack", {
      configurable: true,
      value: "1",
    });

    trackMarketingEvent("page_view");

    expect(fetch).not.toHaveBeenCalled();
    expectLegacyStorageCleared();
  });
});
