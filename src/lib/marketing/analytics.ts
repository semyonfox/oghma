const ANALYTICS_WINDOWS = [7, 30, 90] as const;
export type AnalyticsWindow = (typeof ANALYTICS_WINDOWS)[number];

export function parseAnalyticsWindow(value: unknown): AnalyticsWindow {
  const parsed = Number(value);
  return ANALYTICS_WINDOWS.find((window) => window === parsed) ?? 30;
}
