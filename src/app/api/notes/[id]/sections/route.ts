import { NextResponse } from "next/server";
import { requireAuth, requireValidId, withErrorHandler, type RouteParamsContext } from "@/lib/api-error";
import { readSectionSource } from "@/lib/notes/section-actions";
import { splitSections } from "@/lib/notes/sections";

export const GET = withErrorHandler(async (_request, { params }: RouteParamsContext<{ id: string }>) => {
  const user = await requireAuth();
  const id = requireValidId((await params).id, "note ID");
  const note = await readSectionSource(user.user_id, id);
  return NextResponse.json({ sections: splitSections(note.text).map(({ key, title }) => ({ key, title })) });
});
