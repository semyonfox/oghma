import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowTopRightOnSquareIcon,
  CursorArrowRaysIcon,
  EyeIcon,
  LinkIcon,
  UserPlusIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import { validateSession } from "@/lib/auth";
import { isAnalyticsAdmin } from "@/lib/marketing/admin";
import {
  ANALYTICS_WINDOWS,
  getMarketingAnalytics,
  parseAnalyticsWindow,
  type FunnelMetric,
  type RankedMetric,
} from "@/lib/marketing/analytics";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Analytics",
  robots: { index: false, follow: false },
};

const FUNNEL_LABELS: Record<string, string> = {
  contact_form_start: "Contact started",
  contact_form_submit: "Contact submitted",
  contact_form_success: "Contact completed",
  registration_form_start: "Registration started",
  registration_submit: "Registration submitted",
  registration_success: "Account created",
  email_verified: "Email verified",
  canvas_connect_success: "Canvas connected",
  canvas_import_started: "Canvas import started",
  canvas_import_completed: "Canvas import completed",
  first_cited_answer: "First cited answer",
  first_flashcard_generated: "First flashcard generated",
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-IE").format(value);
}

function RankedList({
  rows,
  empty = "No data in this period",
}: {
  rows: RankedMetric[];
  empty?: string;
}) {
  const max = Math.max(...rows.map((row) => row.count), 1);

  if (rows.length === 0) {
    return <p className="py-8 text-sm text-text-tertiary">{empty}</p>;
  }

  return (
    <div className="divide-y divide-border-subtle">
      {rows.map((row) => (
        <div key={`${row.label}-${row.detail ?? ""}`} className="py-3">
          <div className="flex min-w-0 items-start justify-between gap-4 text-sm">
            <div className="min-w-0">
              <p className="break-words font-medium text-text">{row.label}</p>
              {row.detail ? (
                <p className="mt-0.5 break-words text-xs text-text-tertiary">
                  {row.detail}
                </p>
              ) : null}
            </div>
            <span className="shrink-0 tabular-nums text-text-secondary">
              {formatNumber(row.count)}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-subtle">
            <div
              className="h-full rounded-full bg-primary-400"
              style={{ width: `${Math.max(3, (row.count / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 border-t border-border-subtle pt-6">
      <h2 className="text-base font-semibold text-text">{title}</h2>
      {description ? (
        <p className="mt-1 text-sm text-text-tertiary">{description}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Funnel({ rows }: { rows: FunnelMetric[] }) {
  const values = new Map(rows.map((row) => [row.event, row.count]));
  const orderedEvents = Object.keys(FUNNEL_LABELS);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="text-xs uppercase text-text-tertiary">
          <tr className="border-b border-border-subtle">
            <th className="pb-3 font-medium">Milestone</th>
            <th className="pb-3 text-right font-medium">Events</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {orderedEvents.map((event) => {
            const value = values.get(event) ?? 0;
            return (
              <tr key={event}>
                <td className="py-3 text-text">{FUNNEL_LABELS[event]}</td>
                <td className="py-3 text-right tabular-nums text-text-secondary">
                  {formatNumber(value)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const session = await validateSession();
  if (!session) redirect("/login?next=/analytics");
  if (!isAnalyticsAdmin(session.email)) notFound();

  const days = parseAnalyticsWindow((await searchParams).days);
  const report = await getMarketingAnalytics(days);
  const maxDaily = Math.max(...report.daily.map((day) => day.pageViews), 1);
  const stats = [
    { label: "Page views", value: report.summary.pageViews, icon: EyeIcon },
    { label: "Navigation", value: report.summary.navigationEvents, icon: UsersIcon },
    { label: "CTA actions", value: report.summary.ctaActions, icon: CursorArrowRaysIcon },
    { label: "Beta interest", value: report.summary.betaInterest, icon: LinkIcon },
    { label: "Registrations", value: report.summary.registrations, icon: UserPlusIcon },
    { label: "Contact leads", value: report.summary.contactLeads, icon: LinkIcon },
  ];

  return (
    <div className="min-h-screen bg-background text-text">
      <header className="border-b border-border-subtle bg-surface/60">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <div>
            <p className="text-xs font-semibold uppercase text-primary-300">
              OghmaNotes operations
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-text">Site analytics</h1>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link className="text-text-secondary hover:text-text" href="/notes">
              Open app
            </Link>
            <Link className="inline-flex items-center gap-1.5 text-text-secondary hover:text-text" href="/">
              View site
              <ArrowTopRightOnSquareIcon className="size-4" aria-hidden="true" />
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-text-secondary">
              First-party aggregate activity. No analytics cookies, browser identifiers, IP addresses, or cross-site profiles.
            </p>
            <p className="mt-1 text-xs text-text-tertiary">
              Times use the database timezone. Dimension cells below five observations are suppressed.
            </p>
          </div>
          <div className="inline-flex rounded-md border border-border bg-surface p-1" aria-label="Reporting period">
            {ANALYTICS_WINDOWS.map((window) => (
              <Link
                key={window}
                href={`/analytics?days=${window}`}
                className={`rounded px-3 py-1.5 text-sm font-medium ${
                  days === window
                    ? "bg-primary-500 text-white"
                    : "text-text-secondary hover:bg-subtle hover:text-text"
                }`}
              >
                {window} days
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border-subtle bg-border-subtle md:grid-cols-3 xl:grid-cols-6">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="min-w-0 bg-surface p-4">
                <div className="flex items-center gap-2 text-text-tertiary">
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <p className="truncate text-xs font-medium uppercase">{stat.label}</p>
                </div>
                <p className="mt-3 text-2xl font-semibold tabular-nums text-text">
                  {formatNumber(stat.value)}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-2">
          <Section title="Traffic trend" description="Daily page views">
            <div className="flex h-48 items-end gap-1 border-b border-border-subtle pb-2" aria-label="Daily page views chart">
              {report.daily.map((day) => (
                <div key={day.day} className="group relative flex h-full min-w-0 flex-1 items-end">
                  <div
                    className="w-full min-h-0.5 bg-secondary-400 transition-colors group-hover:bg-secondary-300"
                    style={{ height: `${Math.max(1, (day.pageViews / maxDaily) * 100)}%` }}
                  />
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-neutral-900 px-2 py-1 text-xs text-white shadow-lg group-hover:block">
                    {day.day}: {day.pageViews} views, {day.navigationEvents} navigation events
                  </div>
                </div>
              ))}
            </div>
          </Section>
          <Section title="Entry origins" description="Coarse direct, external, or internal entry classification">
            <RankedList rows={report.origins} />
          </Section>
          <Section title="Landing pages" description="Aggregate entry transitions; small cells are suppressed">
            <RankedList rows={report.landingPages} />
          </Section>
          <Section title="Approved campaigns" description="Allowlisted source and medium are shown below each campaign">
            <RankedList rows={report.campaigns} />
          </Section>
          <Section title="Most viewed pages" description="Public marketing routes by page views">
            <RankedList rows={report.pages} />
          </Section>
          <Section title="Navigation transitions" description="Aggregate from/to paths without a visitor trail">
            <RankedList rows={report.transitions} />
          </Section>
          <Section
            title="Common route chains"
            description="Bounded three- or four-page sequences kept only in memory; small cells are suppressed"
          >
            <RankedList rows={report.journeys} />
          </Section>
          <Section
            title="CTA-assisted journeys"
            description="Bounded route chains attributed to the latest allowlisted CTA action, placement, and source page"
          >
            <RankedList rows={report.ctaJourneys} />
          </Section>
          <Section title="CTA performance" description="Explicit CTA and pricing clicks by semantic action and placement">
            <RankedList rows={report.ctas} />
          </Section>
          <Section title="Link destinations" description="Allowlisted public destination paths">
            <RankedList rows={report.destinations} />
          </Section>
          <Section title="Funnel milestones" description="Event totals are not deduplicated by user">
            <Funnel rows={report.funnel} />
          </Section>
        </div>
      </main>
    </div>
  );
}
