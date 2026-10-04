
export const ANALYTICS_WINDOWS = [7, 30, 90] as const;
export const MINIMUM_DIMENSION_COUNT = 5;
export type AnalyticsWindow = (typeof ANALYTICS_WINDOWS)[number];

export interface RankedMetric {
  label: string;
  count: number;
  detail?: string | null;
}

export interface DailyTraffic {
  day: string;
  pageViews: number;
  navigationEvents: number;
}

export interface FunnelMetric {
  event: string;
  count: number;
}

export interface MarketingAnalyticsReport {
  summary: {
    pageViews: number;
    navigationEvents: number;
    ctaActions: number;
    betaInterest: number;
    registrations: number;
    contactLeads: number;
  };
  daily: DailyTraffic[];
  origins: RankedMetric[];
  campaigns: RankedMetric[];
  landingPages: RankedMetric[];
  pages: RankedMetric[];
  transitions: RankedMetric[];
  journeys: RankedMetric[];
  ctaJourneys: RankedMetric[];
  ctas: RankedMetric[];
  destinations: RankedMetric[];
  funnel: FunnelMetric[];
}

export function parseAnalyticsWindow(value: unknown): AnalyticsWindow {
  const parsed = Number(value);
  return ANALYTICS_WINDOWS.find((window) => window === parsed) ?? 30;
}
