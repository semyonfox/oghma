import { NextResponse } from "next/server";
import { requireAuth, withErrorHandler } from "@/lib/api-error";
import { setupStudyMaps } from "@/lib/study-map/setup";

export const POST = withErrorHandler(async () => {
  const user = await requireAuth();
  return NextResponse.json({ created: await setupStudyMaps(user.user_id) });
});
