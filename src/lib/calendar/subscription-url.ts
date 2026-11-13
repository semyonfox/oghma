export function buildGoogleCalendarSubscriptionUrl(feedUrl: string): string {
  const webcalUrl = feedUrl.replace(/^https?:/, "webcal:");
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`;
}
