import { describe, expect, it } from "vitest";
import {
  ACTIVATION_MILESTONES,
  cleanNavigationAction,
  cleanNavigationOrigin,
  cleanNavigationPath,
  cleanNavigationPlacement,
  cleanPath,
  cleanPathChain,
  cleanProperties,
  cleanUrl,
  hasPrivacySignal,
} from "@/lib/marketing/events";
import { cleanAttribution } from "@/lib/marketing/attribution";

describe("marketing event property cleaning", () => {
  it("keeps only the closed aggregate schema", () => {
    expect(cleanProperties({ form: "contact", role: "student", interest: "campus_pilot", has_phone: true, message_length_bucket: "101-500" })).toEqual({
      form: "contact", role: "student", interest: "campus_pilot", has_phone: true, message_length_bucket: "101-500",
    });
  });

  it("drops sensitive and arbitrary values before storage", () => {
    expect(cleanProperties({ email: "student@example.com", first_name: "Ada", phone: "+353 1 234 5678", message: "Please invite me", canvas_token: "secret", safe_key: "kept", role: "ada@example.com" })).toEqual({});
  });
});

describe("campaign attribution", () => {
  it("retains only deployed campaign taxonomy values", () => {
    expect(cleanAttribution({ source: "homepage", medium: "hero_cta", campaign: "free_canvas_import", term: "student@example.com" })).toEqual({
      source: "homepage", medium: "hero_cta", campaign: "free_canvas_import",
    });
  });

  it("retains the deployed pricing-interest attribution", () => {
    expect(cleanAttribution({ source: "pricing", medium: "plan_cta", campaign: "semester_beta" })).toEqual({
      source: "pricing", medium: "plan_cta", campaign: "semester_beta",
    });
  });

  it("retains the deployed blog beta CTA attribution", () => {
    expect(cleanAttribution({ source: "blog", medium: "article_cta", campaign: "launch_beta" })).toEqual({
      source: "blog", medium: "article_cta", campaign: "launch_beta",
    });
  });

  it("drops arbitrary query-derived attribution", () => {
    expect(cleanAttribution({ source: "ada@example.com", campaign: "private-medical-condition", content: "secret" })).toEqual({});
  });
});

describe("authenticated activation milestones", () => {
  it("uses a fixed, content-free allowlist", () => {
    expect([...ACTIVATION_MILESTONES]).toEqual([
      "email_verified",
      "canvas_import_started",
      "canvas_import_completed",
      "first_cited_answer",
      "first_flashcard_generated",
    ]);
    expect(ACTIVATION_MILESTONES.has("weekly_active")).toBe(false);
    expect(ACTIVATION_MILESTONES.has("note_created")).toBe(false);
  });
});

describe("privacy-first marketing event boundaries", () => {
  it("removes query strings and fragments from stored paths", () => {
    expect(cleanPath("/register?email=ada@example.com#form")).toBe("/register");
    expect(cleanUrl("https://oghmanotes.ie/pricing?token=secret")).toBe("/pricing");
  });

  it("allows only coarse, stable navigation dimensions", () => {
    expect(cleanNavigationPath("/pricing?campaign=private#plans")).toBe("/pricing");
    expect(cleanNavigationPath("/blog/privacy-first-analytics")).toBe("/blog/privacy-first-analytics");
    expect(cleanNavigationPath("/settings?user=123")).toBeNull();
    expect(cleanNavigationPath("https://elsewhere.test/private-path?token=secret")).toBeNull();
    expect(cleanNavigationOrigin("external")).toBe("external");
    expect(cleanNavigationOrigin("referrer.example")).toBeNull();
    expect(cleanNavigationPlacement("header")).toBe("header");
    expect(cleanNavigationPlacement("plan_semester")).toBe("plan_semester");
    expect(cleanNavigationPlacement("sidebar_personal")).toBeNull();
    expect(cleanNavigationAction("connect_canvas_free")).toBe("connect_canvas_free");
    expect(cleanNavigationAction("request_beta_access")).toBe("request_beta_access");
    expect(cleanNavigationAction("clicked-ada-profile")).toBeNull();
  });

  it("accepts only bounded chains of allowlisted public paths", () => {
    expect(cleanPathChain(["/", "/pricing", "/register"])).toEqual([
      "/",
      "/pricing",
      "/register",
    ]);
    expect(cleanPathChain(["/", "/blog/canvas-first-study-system", "/register"])).toEqual([
      "/",
      "/blog/canvas-first-study-system",
      "/register",
    ]);
    expect(cleanPathChain(["/", "/pricing", "/register", "/login", "/contact"])).toBeNull();
    expect(cleanPathChain(["/", "/notes/private-id", "/register"])).toBeNull();
    expect(cleanPathChain(["/", "/pricing?campaign=free", "/register"])).toEqual([
      "/",
      "/pricing",
      "/register",
    ]);
    expect(cleanPathChain("home>pricing>register")).toBeNull();
  });

  it("honors Global Privacy Control and Do Not Track headers", () => {
    expect(hasPrivacySignal(new Request("https://example.test", { headers: { "Sec-GPC": "1" } }))).toBe(true);
    expect(hasPrivacySignal(new Request("https://example.test", { headers: { DNT: "1" } }))).toBe(true);
    expect(hasPrivacySignal(new Request("https://example.test"))).toBe(false);
  });
});
