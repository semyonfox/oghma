import { describe, expect, it } from "vitest";
import { buildGoogleCalendarSubscriptionUrl } from "@/lib/calendar/subscription-url";

describe("buildGoogleCalendarSubscriptionUrl", () => {
  it("converts the HTTPS feed to an encoded webcal subscription", () => {
    expect(buildGoogleCalendarSubscriptionUrl("https://oghma.example/api/calendar/ical/test-token"))
      .toBe("https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2Foghma.example%2Fapi%2Fcalendar%2Fical%2Ftest-token");
  });

  it("encodes reserved characters without changing the feed path or query", () => {
    const feed = "https://oghma.example/api/calendar/ical/test%2Ftoken?name=Study & revision#week";
    const result = buildGoogleCalendarSubscriptionUrl(feed);
    expect(result).toBe("https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2Foghma.example%2Fapi%2Fcalendar%2Fical%2Ftest%252Ftoken%3Fname%3DStudy%20%26%20revision%23week");
    expect(new URL(result).searchParams.get("cid")).toBe(feed.replace("https:", "webcal:"));
  });

  it("supports an HTTP development origin", () => {
    expect(buildGoogleCalendarSubscriptionUrl("http://localhost:3000/api/calendar/ical/test-token"))
      .toBe("https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2Flocalhost%3A3000%2Fapi%2Fcalendar%2Fical%2Ftest-token");
  });
});
