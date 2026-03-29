import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { withErrorHandler, tracedError } from "@/lib/api-error";
import sql from "@/database/pgsql.js";

export const GET = withErrorHandler(async (request: NextRequest) => {
  const user = await validateSession();
  if (!user) return tracedError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!start || !end) {
    return tracedError("start and end query parameters are required", 400);
  }

  const rows = await sql`
    SELECT DISTINCT DATE(created_at) as review_date
    FROM app.quiz_reviews
    WHERE user_id = ${user.user_id}::uuid
      AND created_at >= ${start}::date
      AND created_at < ${end}::date + interval '1 day'
    ORDER BY review_date
  `;

  return NextResponse.json({
    dates: rows.map((r: any) => r.review_date),
  });
});
