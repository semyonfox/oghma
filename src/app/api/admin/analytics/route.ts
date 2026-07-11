import { NextResponse } from "next/server";
import sql from "@/database/pgsql.js";
import { withErrorHandler } from "@/lib/api-error";
import { requireAnalyticsAdmin } from "@/lib/marketing/admin";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async () => {
  await requireAnalyticsAdmin();

  const daily = await sql`
    SELECT occurred_at::date AS day, event_name, count(*)::int AS count
    FROM app.marketing_events
    WHERE occurred_at >= now() - interval '30 days'
    GROUP BY 1, 2
    ORDER BY 1 DESC, 2
  `;
  const campaigns = await sql`
    SELECT coalesce(utm_source, '(direct)') AS source,
           coalesce(utm_campaign, '(none)') AS campaign,
           count(*)::int AS events
    FROM app.marketing_events
    WHERE occurred_at >= now() - interval '30 days'
      AND event_name IN ('page_view', 'cta_click', 'registration_submit', 'registration_success')
    GROUP BY 1, 2
    HAVING count(*) >= 5
    ORDER BY events DESC
    LIMIT 50
  `;

  const transitions = await sql`
    SELECT coalesce(from_path, '(entry)') AS from_path,
           to_path,
           origin_class,
           coalesce(placement, '(unmarked)') AS placement,
           coalesce(action, '(unmarked)') AS action,
           count(*)::int AS events
    FROM app.marketing_events
    WHERE occurred_at >= now() - interval '30 days'
      AND event_name = 'navigation_transition'
      AND to_path IS NOT NULL
    GROUP BY 1, 2, 3, 4, 5
    HAVING count(*) >= 5
    ORDER BY events DESC, 1, 2
    LIMIT 100
  `;
  const ctas = await sql`
    SELECT coalesce(placement, properties->>'location', '(unmarked)') AS placement,
           coalesce(action, properties->>'cta', '(unmarked)') AS action,
           count(*)::int AS events
    FROM app.marketing_events
    WHERE occurred_at >= now() - interval '30 days'
      AND event_name IN ('navigation_transition', 'cta_click', 'pricing_click')
      AND coalesce(action, properties->>'cta') IS NOT NULL
    GROUP BY 1, 2
    HAVING count(*) >= 5
    ORDER BY events DESC, 1, 2
    LIMIT 50
  `;

  const activation = await sql`
    SELECT event_name, count(*)::int AS accounts
    FROM app.marketing_events
    WHERE occurred_at >= now() - interval '30 days'
      AND user_id IS NOT NULL
      AND event_name IN (
        'email_verified', 'canvas_import_started', 'canvas_import_completed',
        'first_cited_answer', 'first_flashcard_generated'
      )
    GROUP BY 1
    HAVING count(*) >= 5
    ORDER BY accounts DESC, event_name
  `;

  return NextResponse.json(
    { windowDays: 30, minimumCellSize: 5, daily, campaigns, transitions, ctas, activation },
    { headers: { "Cache-Control": "private, no-store" } },
  );
});
