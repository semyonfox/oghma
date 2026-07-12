import sql from "@/database/pgsql.js";

const DEFAULT_EVENT_RETENTION_DAYS = 30;
const DEFAULT_LEAD_RETENTION_DAYS = 365;
const MIN_RETENTION_DAYS = 30;
const MAX_RETENTION_DAYS = 3650;

export interface MarketingCleanupResult {
  eventsDeleted: number;
  leadsDeleted: number;
  eventRetentionDays: number;
  leadRetentionDays: number;
}

export function parseRetentionDays(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(MAX_RETENTION_DAYS, Math.max(MIN_RETENTION_DAYS, parsed));
}

export async function cleanupMarketingData(): Promise<MarketingCleanupResult> {
  const eventRetentionDays = parseRetentionDays(
    process.env.MARKETING_EVENTS_RETENTION_DAYS,
    DEFAULT_EVENT_RETENTION_DAYS,
  );
  const leadRetentionDays = parseRetentionDays(
    process.env.MARKETING_LEADS_RETENTION_DAYS,
    DEFAULT_LEAD_RETENTION_DAYS,
  );

  const [events, leads] = await sql.begin(async (tx: typeof sql) => {
    const deletedEvents = await tx`
      DELETE FROM app.marketing_events
      WHERE occurred_at < NOW() - (${eventRetentionDays} * INTERVAL '1 day')
      RETURNING id
    `;
    const deletedLeads = await tx`
      DELETE FROM app.marketing_leads
      WHERE created_at < NOW() - (${leadRetentionDays} * INTERVAL '1 day')
      RETURNING id
    `;
    return [deletedEvents.length, deletedLeads.length];
  });

  return {
    eventsDeleted: events,
    leadsDeleted: leads,
    eventRetentionDays,
    leadRetentionDays,
  };
}
