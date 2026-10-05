import { NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-error";
import { requireAnalyticsAdmin } from "@/lib/marketing/admin";
export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async () => {
  await requireAnalyticsAdmin();
  return NextResponse.json(
    { error: "Legacy analytics reports are retired. Anonymous aggregates are available through the collector's local operator interface." },
    { status: 410, headers: { "Cache-Control": "private, no-store" } },
  );
});
