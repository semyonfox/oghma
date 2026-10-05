import { describe, expect, it } from "vitest";
import { telemetryRoute } from "@/components/marketing-tracker";
describe("static telemetry route categories", () => {
  it("maps dynamic notes and unknown private URLs to a finite category", () => {
    expect(telemetryRoute("/notes/private-note-id")).toBe("editor");
    expect(telemetryRoute("/settings")).toBe("settings");
    expect(telemetryRoute("/private-fixture?email=person@example.test")).toBe(
      "app",
    );
    expect(telemetryRoute(null)).toBe("app");
  });
});
