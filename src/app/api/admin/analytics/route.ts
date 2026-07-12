import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-error";
import { requireAnalyticsAdmin } from "@/lib/marketing/admin";
import {
  getMarketingAnalytics,
  MINIMUM_DIMENSION_COUNT,
  parseAnalyticsWindow,
} from "@/lib/marketing/analytics";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireAnalyticsAdmin();
  const days = parseAnalyticsWindow(request.nextUrl.searchParams.get("days"));
  const report = await getMarketingAnalytics(days);

  return NextResponse.json(
    {
      windowDays: days,
      minimumDimensionCount: MINIMUM_DIMENSION_COUNT,
      ...report,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
});
