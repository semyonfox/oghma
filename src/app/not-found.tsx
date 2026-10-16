import { unstable_rethrow } from "next/navigation";
import { validateSession } from "@/lib/auth/session";
import NotFoundContent from "./not-found-content";

async function sessionHomeUrl(): Promise<string> {
  try {
    const session = await validateSession();
    return session?.user_id ? "/notes" : "/";
  } catch (error) {
    // keep Next's dynamic-rendering signals, but an auth or database outage
    // only picks the home link and must not turn a 404 into a 500
    unstable_rethrow(error);
    return "/";
  }
}

export default async function NotFound() {
  return <NotFoundContent homeUrl={await sessionHomeUrl()} />;
}
