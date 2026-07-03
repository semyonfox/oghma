import { auth } from "@/auth";
import NotFoundContent from "./not-found-content";

export default async function NotFound() {
  const session = await auth();
  const homeUrl = session?.user?.id ? "/notes" : "/";

  return <NotFoundContent homeUrl={homeUrl} />;
}
