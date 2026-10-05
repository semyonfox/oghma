// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({
  usePathname: () => "/notes/private-note-id",
}));
vi.mock("@/lib/notes/hooks/use-i18n", () => ({
  default: () => ({ t: (key: string) => key }),
}));
beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("real UI telemetry call sites", () => {
  it("serializes only a static screen category from a mounted tracker", async () => {
    vi.stubEnv("NEXT_PUBLIC_TELEMETRY_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_TELEMETRY_ENDPOINT", "/api/marketing/events");
    const request = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", request);
    const { default: Tracker } = await import("@/components/marketing-tracker");
    render(<Tracker />);
    const options: RequestInit = request.mock.calls[0][1];
    expect(JSON.parse(String(options.body))).toEqual({
      version: 1,
      app: "oghmanotes",
      kind: "count",
      name: "screen_view",
      surface: "web",
      route: "editor",
    });
    expect(String(options.body)).not.toContain("private-note-id");
  });
  it.each(["unconfigured", "disabled", "enabled"])(
    "keeps contact recovery independent of %s reporting and private input",
    async (mode) => {
      vi.stubEnv(
        "NEXT_PUBLIC_TELEMETRY_ENABLED",
        mode === "unconfigured" ? "false" : "true",
      );
      vi.stubEnv("NEXT_PUBLIC_TELEMETRY_ENDPOINT", "/api/marketing/events");
      if (mode === "disabled")
        localStorage.setItem("oghma-telemetry-disabled", "true");
      const request = vi.fn((url: string) =>
        url === "/api/contact"
          ? Promise.resolve(
              new Response(JSON.stringify({ success: false }), { status: 503 }),
            )
          : Promise.reject(new Error("synthetic telemetry outage")),
      );
      vi.stubGlobal("fetch", request);
      const { default: ContactForm } =
        await import("@/components/contact-form");
      render(<ContactForm />);
      fireEvent.change(screen.getByLabelText("Full name"), {
        target: { value: "Private fixture" },
      });
      fireEvent.change(screen.getByLabelText("Email"), {
        target: { value: "private@example.test" },
      });
      fireEvent.change(screen.getByLabelText("Message"), {
        target: { value: "Private notes /notes/private-id" },
      });
      fireEvent.submit(
        screen.getByRole("button", { name: "Send message" }).closest("form")!,
      );
      await screen.findByText("Error sending message. Please try again.");
      expect(
        screen
          .getByRole("button", { name: "Send message" })
          .hasAttribute("disabled"),
      ).toBe(false);
      const telemetry = request.mock.calls.filter(
        ([url]) => url === "/api/marketing/events",
      );
      expect(telemetry).toHaveLength(mode === "enabled" ? 1 : 0);
      if (mode === "enabled") {
        const options = vi
          .mocked(fetch)
          .mock.calls.find(([url]) => url === "/api/marketing/events")?.[1];
        const body = String(options?.body);
        expect(JSON.parse(body)).toEqual({
          version: 1,
          app: "oghmanotes",
          kind: "error",
          name: "request_failed",
          surface: "web",
          route: "help",
        });
        expect(body).not.toMatch(
          /Private|private|example\.test|\/notes\/|message|referrer|userId/,
        );
      }
    },
  );
});
