"use client";

import useSWR from "swr";

const fetcher = async (url) => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(response.status === 403 ? "Admin access required" : "Unable to load analytics");
  return response.json();
};

export default function AnalyticsAdminPage() {
  const { data, error, isLoading } = useSWR("/api/admin/analytics", fetcher);

  return (
    <main className="mx-auto min-h-screen max-w-6xl p-8 text-white">
      <h1 className="text-3xl font-semibold">Privacy-first funnel</h1>
      <p className="mt-2 text-slate-400">
        Aggregate first-party events only. No visitor/session identifiers, query strings, IP addresses, or user-agent drill-down.
      </p>
      {isLoading && <p className="mt-8">Loading…</p>}
      {error && <p className="mt-8 text-red-300">{error.message}</p>}
      {data && (
        <>
          <p className="mt-4 text-sm text-slate-400">
            Last {data.windowDays} days · campaign cells below {data.minimumCellSize} events are suppressed · opt-outs are not counted
          </p>
          <section className="mt-8 overflow-x-auto rounded-xl border border-white/10 p-5">
            <h2 className="mb-4 text-xl font-medium">Daily funnel events</h2>
            <table className="w-full text-left text-sm">
              <thead><tr className="text-slate-400"><th className="py-2">Day</th><th>Event</th><th>Count</th></tr></thead>
              <tbody>{data.daily.map((row, index) => <tr className="border-t border-white/5" key={`${row.day}-${row.event_name}-${index}`}><td className="py-2">{String(row.day).slice(0, 10)}</td><td>{row.event_name}</td><td>{row.count}</td></tr>)}</tbody>
            </table>
          </section>
          <section className="mt-8 overflow-x-auto rounded-xl border border-white/10 p-5">
            <h2 className="mb-4 text-xl font-medium">Acquisition campaigns</h2>
            <table className="w-full text-left text-sm">
              <thead><tr className="text-slate-400"><th className="py-2">Source</th><th>Campaign</th><th>Events</th></tr></thead>
              <tbody>{data.campaigns.map((row, index) => <tr className="border-t border-white/5" key={`${row.source}-${row.campaign}-${index}`}><td className="py-2">{row.source}</td><td>{row.campaign}</td><td>{row.events}</td></tr>)}</tbody>
            </table>
          </section>
          <section className="mt-8 overflow-x-auto rounded-xl border border-white/10 p-5">
            <h2 className="mb-2 text-xl font-medium">Navigation transitions</h2>
            <p className="mb-4 text-sm text-slate-400">Aggregate paths only; entry origin is direct, external, or internal. No individual trail is retained.</p>
            <table className="w-full text-left text-sm">
              <thead><tr className="text-slate-400"><th className="py-2">From</th><th>To</th><th>Origin</th><th>Placement</th><th>Action</th><th>Events</th></tr></thead>
              <tbody>{data.transitions.map((row, index) => <tr className="border-t border-white/5" key={`${row.from_path}-${row.to_path}-${row.origin_class}-${row.placement}-${row.action}-${index}`}><td className="py-2">{row.from_path}</td><td>{row.to_path}</td><td>{row.origin_class}</td><td>{row.placement}</td><td>{row.action}</td><td>{row.events}</td></tr>)}</tbody>
            </table>
          </section>
          <section className="mt-8 overflow-x-auto rounded-xl border border-white/10 p-5">
            <h2 className="mb-4 text-xl font-medium">CTA and placed-navigation counts</h2>
            <table className="w-full text-left text-sm">
              <thead><tr className="text-slate-400"><th className="py-2">Placement</th><th>Action</th><th>Events</th></tr></thead>
              <tbody>{data.ctas.map((row, index) => <tr className="border-t border-white/5" key={`${row.placement}-${row.action}-${index}`}><td className="py-2">{row.placement}</td><td>{row.action}</td><td>{row.events}</td></tr>)}</tbody>
            </table>
          </section>
          <section className="mt-8 overflow-x-auto rounded-xl border border-white/10 p-5">
            <h2 className="mb-2 text-xl font-medium">Authenticated activation milestones</h2>
            <p className="mb-4 text-sm text-slate-400">First-value account milestones only. Cells below {data.minimumCellSize} accounts are suppressed.</p>
            <table className="w-full text-left text-sm">
              <thead><tr className="text-slate-400"><th className="py-2">Milestone</th><th>Accounts</th></tr></thead>
              <tbody>{data.activation.map((row, index) => <tr className="border-t border-white/5" key={`${row.event_name}-${index}`}><td className="py-2">{row.event_name}</td><td>{row.accounts}</td></tr>)}</tbody>
            </table>
          </section>
        </>
      )}
    </main>
  );
}
