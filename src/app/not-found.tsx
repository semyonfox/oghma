import { validateSession } from "@/lib/auth/session";
import NotFoundContent from "./not-found-content";

export default async function NotFound() {
  const session = await validateSession();
  const homeUrl = session?.user_id ? "/notes" : "/";

  return <NotFoundContent homeUrl={homeUrl} />;
}
