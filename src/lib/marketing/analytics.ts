import sql from "@/database/pgsql.js";

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
  ctas: RankedMetric[];
  destinations: RankedMetric[];
  funnel: FunnelMetric[];
}

type Row = Record<string, unknown>;

function count(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown, fallback = "Unknown"): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function ranked(rows: Row[]): RankedMetric[] {
  return rows.map((row) => ({
    label: text(row.label),
    count: count(row.count),
    detail:
      typeof row.detail === "string" && row.detail.trim() ? row.detail : null,
  }));
}

export function parseAnalyticsWindow(value: unknown): AnalyticsWindow {
  const parsed = Number(value);
  return ANALYTICS_WINDOWS.includes(parsed as AnalyticsWindow)
    ? (parsed as AnalyticsWindow)
    : 30;
}

export async function getMarketingAnalytics(
  days: AnalyticsWindow,
): Promise<MarketingAnalyticsReport> {
  const since = sql`NOW() - (${days} * INTERVAL '1 day')`;

  const [
    summaryRows,
    dailyRows,
    originRows,
    campaignRows,
    landingRows,
    pageRows,
    transitionRows,
    ctaRows,
    destinationRows,
    funnelRows,
  ] = await Promise.all([
    sql`
      SELECT
        COUNT(*) FILTER (WHERE event_name = 'page_view') AS page_views,
        COUNT(*) FILTER (WHERE event_name = 'navigation_transition') AS navigation_events,
        COUNT(*) FILTER (
          WHERE event_name = 'navigation_transition' AND action IS NOT NULL
        ) AS cta_actions,
        COUNT(*) FILTER (
          WHERE event_name = 'navigation_transition' AND action = 'request_beta_access'
        ) AS beta_interest,
        COUNT(*) FILTER (WHERE event_name = 'registration_success') AS registrations,
        COUNT(*) FILTER (WHERE event_name = 'contact_form_success') AS contact_leads
      FROM app.marketing_events
      WHERE occurred_at >= ${since}
    `,
    sql`
      WITH days AS (
        SELECT generate_series(
          date_trunc('day', NOW() - ((${days} - 1) * INTERVAL '1 day')),
          date_trunc('day', NOW()),
          INTERVAL '1 day'
        ) AS day
      ), totals AS (
        SELECT
          date_trunc('day', occurred_at) AS day,
          COUNT(*) FILTER (WHERE event_name = 'page_view') AS page_views,
          COUNT(*) FILTER (WHERE event_name = 'navigation_transition') AS navigation_events
        FROM app.marketing_events
        WHERE occurred_at >= ${since}
        GROUP BY 1
      )
      SELECT
        to_char(days.day, 'YYYY-MM-DD') AS day,
        COALESCE(totals.page_views, 0) AS page_views,
        COALESCE(totals.navigation_events, 0) AS navigation_events
      FROM days
      LEFT JOIN totals USING (day)
      ORDER BY days.day
    `,
    sql`
      SELECT origin_class AS label, COUNT(*) AS count
      FROM app.marketing_events
      WHERE occurred_at >= ${since}
        AND event_name = 'navigation_transition'
        AND from_path IS NULL
        AND origin_class IS NOT NULL
      GROUP BY origin_class
      HAVING COUNT(*) >= ${MINIMUM_DIMENSION_COUNT}
      ORDER BY count DESC, label
    `,
    sql`
      SELECT
        COALESCE(utm_campaign, '(no campaign)') AS label,
        COUNT(*) AS count,
        concat_ws(' / ', utm_source, utm_medium) AS detail
      FROM app.marketing_events
      WHERE occurred_at >= ${since}
        AND utm_source IS NOT NULL
      GROUP BY utm_campaign, utm_source, utm_medium
      HAVING COUNT(*) >= ${MINIMUM_DIMENSION_COUNT}
      ORDER BY count DESC, label
      LIMIT 20
    `,
    sql`
      SELECT
        to_path AS label,
        COUNT(*) AS count,
        origin_class AS detail
      FROM app.marketing_events
      WHERE occurred_at >= ${since}
        AND event_name = 'navigation_transition'
        AND from_path IS NULL
        AND to_path IS NOT NULL
      GROUP BY to_path, origin_class
      HAVING COUNT(*) >= ${MINIMUM_DIMENSION_COUNT}
      ORDER BY count DESC, label
      LIMIT 15
    `,
    sql`
      SELECT path AS label, COUNT(*) AS count
      FROM app.marketing_events
      WHERE occurred_at >= ${since}
        AND event_name = 'page_view'
        AND path IS NOT NULL
      GROUP BY path
      HAVING COUNT(*) >= ${MINIMUM_DIMENSION_COUNT}
      ORDER BY count DESC, label
      LIMIT 15
    `,
    sql`
      SELECT
        COALESCE(from_path, '(entry)') || ' -> ' || to_path AS label,
        COUNT(*) AS count,
        concat_ws(' / ', origin_class, placement, action) AS detail
      FROM app.marketing_events
      WHERE occurred_at >= ${since}
        AND event_name = 'navigation_transition'
        AND to_path IS NOT NULL
      GROUP BY from_path, to_path, origin_class, placement, action
      HAVING COUNT(*) >= ${MINIMUM_DIMENSION_COUNT}
      ORDER BY count DESC, label
      LIMIT 20
    `,
    sql`
      SELECT
        action AS label,
        COUNT(*) AS count,
        COALESCE(placement, '(unmarked)') AS detail
      FROM app.marketing_events
      WHERE occurred_at >= ${since}
        AND event_name = 'navigation_transition'
        AND action IS NOT NULL
      GROUP BY action, placement
      HAVING COUNT(*) >= ${MINIMUM_DIMENSION_COUNT}
      ORDER BY count DESC, label
      LIMIT 15
    `,
    sql`
      SELECT
        to_path AS label,
        COUNT(*) AS count,
        COALESCE(action, 'navigation') AS detail
      FROM app.marketing_events
      WHERE occurred_at >= ${since}
        AND event_name = 'navigation_transition'
        AND to_path IS NOT NULL
      GROUP BY to_path, action
      HAVING COUNT(*) >= ${MINIMUM_DIMENSION_COUNT}
      ORDER BY count DESC, label
      LIMIT 15
    `,
    sql`
      SELECT event_name AS event, COUNT(*) AS count
      FROM app.marketing_events
      WHERE occurred_at >= ${since}
        AND event_name IN (
          'contact_form_start',
          'contact_form_submit',
          'contact_form_success',
          'registration_form_start',
          'registration_submit',
          'registration_success',
          'email_verified',
          'canvas_connect_success',
          'canvas_import_started',
          'canvas_import_completed',
          'first_cited_answer',
          'first_flashcard_generated'
        )
      GROUP BY event_name
      ORDER BY event_name
    `,
  ]);

  const summary = (summaryRows[0] ?? {}) as Row;

  return {
    summary: {
      pageViews: count(summary.page_views),
      navigationEvents: count(summary.navigation_events),
      ctaActions: count(summary.cta_actions),
      betaInterest: count(summary.beta_interest),
      registrations: count(summary.registrations),
      contactLeads: count(summary.contact_leads),
    },
    daily: (dailyRows as Row[]).map((row) => ({
      day: text(row.day, ""),
      pageViews: count(row.page_views),
      navigationEvents: count(row.navigation_events),
    })),
    origins: ranked(originRows as Row[]),
    campaigns: ranked(campaignRows as Row[]),
    landingPages: ranked(landingRows as Row[]),
    pages: ranked(pageRows as Row[]),
    transitions: ranked(transitionRows as Row[]),
    ctas: ranked(ctaRows as Row[]),
    destinations: ranked(destinationRows as Row[]),
    funnel: (funnelRows as Row[]).map((row) => ({
      event: text(row.event),
      count: count(row.count),
    })),
  };
}
