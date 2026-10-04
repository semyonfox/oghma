import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { validateSession } from "@/lib/auth";
import { isAnalyticsAdmin } from "@/lib/marketing/admin";

export default async function AnalyticsPage() {
  const session = await validateSession();
  if (!session) redirect("/login?next=/analytics");
  if (!isAnalyticsAdmin(session.email)) notFound();
  return (
    <main className="min-h-screen bg-background px-6 py-12 text-text">
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold">Site analytics</h1>
        <p className="text-text-secondary">The previous acquisition and account-activation reports are retired. They no longer collect or read account-linked events or navigation journeys.</p>
        <p className="text-text-secondary">Optional anonymous screen and action counts use the self-hosted collector. Collection stays off until it is configured. Aggregate counts are available to the operator locally.</p>
        <Link href="/notes" className="inline-flex min-h-11 items-center text-primary-300 underline underline-offset-4">Open app</Link>
      </div>
    </main>
  );
}
