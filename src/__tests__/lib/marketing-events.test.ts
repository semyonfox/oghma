import { describe, expect, it } from "vitest";
import { cleanProperties } from "@/lib/marketing/events";

describe("marketing event property cleaning", () => {
  it("keeps safe funnel metadata", () => {
    expect(
      cleanProperties({
        page: "home",
        location: "hero",
        cta: "start_free",
        has_phone: true,
        message_length_bucket: "101-500",
      }),
    ).toEqual({
      page: "home",
      location: "hero",
      cta: "start_free",
      has_phone: true,
      message_length_bucket: "101-500",
    });
  });

  it("drops sensitive keys before storage", () => {
    expect(
      cleanProperties({
        email: "student@example.com",
        first_name: "Ada",
        phone: "+353 1 234 5678",
        message: "Please invite me",
        canvas_token: "secret",
        safe_key: "kept",
      }),
    ).toEqual({
      safe_key: "kept",
    });
  });
});
