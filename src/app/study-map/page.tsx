import { redirect } from "next/navigation";
import { z } from "zod";
import { validateSession } from "@/lib/auth/session";
import { listStudyMaps } from "@/lib/study-map/repository";
import StudyMapPageClient from "./study-map-page-client";

export default async function StudyMapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await validateSession();
  if (!user) redirect("/login?next=/study-map");
  const params = await searchParams;
  const map = z.uuid().safeParse(params.map);
  const note = z.uuid().safeParse(params.note);
  return (
    <StudyMapPageClient
      initialMaps={await listStudyMaps(user.user_id)}
      initialMapId={map.success ? map.data : null}
      initialNoteId={note.success ? note.data : null}
    />
  );
}
