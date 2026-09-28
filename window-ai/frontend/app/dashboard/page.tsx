"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import { CustomerEstimateStatus, ReportSummary, fetchReportSummary } from "@/lib/api";

// ---------------------------------------------------------------- constants & formatting

const PERIODS = [30, 90, 180, 365] as const;
type Period = (typeof PERIODS)[number];

const PIPELINE_ORDER: CustomerEstimateStatus[] = ["draft", "priced", "finalized", "sent", "viewed", "accepted", "lost"];

const STATUS_LABELS: Record<CustomerEstimateStatus, string> = {
  draft: "Draft",
  priced: "Priced",
  finalized: "Finalized",
  sent: "Sent",
  viewed: "Viewed",
  accepted: "Accepted",
  lost: "Lost",
};

const STATUS_STYLES: Record<CustomerEstimateStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  priced: "bg-orange-50 text-orange-800",
  finalized: "bg-indigo-50 text-indigo-700",
  sent: "bg-sky-50 text-sky-800",
  viewed: "bg-violet-50 text-violet-700",
  accepted: "bg-emerald-100 text-emerald-800",
  lost: "bg-rose-50 text-rose-700",
};

/** Average discount at or above this is flagged (the standard preset allows up to 10%). */
const HIGH_DISCOUNT_PERCENT = 8;
const LOW_MARGIN_PERCENT = 20;

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600";

const moneyWhole = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const moneyExact = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

function money0(value?: number | null) {
  return value == null ? "—" : moneyWhole.format(value);
}

function money2(value?: number | null) {
  return value == null ? "—" : moneyExact.format(value);
}

function percent(value?: number | null, digits = 1) {
  return value == null ? "—" : `${value.toFixed(digits)}%`;
}

function localIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const parsed = dateOnly ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" }).format(parsed);
}

function marginClass(value: number) {
  if (value < LOW_MARGIN_PERCENT) return "text-rose-700";
  if (value <= 30) return "text-amber-700";
  return "text-emerald-700";
}

function StatusPill({ status }: { status: CustomerEstimateStatus }) {
  return <span className={`status-pill whitespace-nowrap ${STATUS_STYLES[status] ?? STATUS_STYLES.draft}`}>{STATUS_LABELS[status] ?? status}</span>;
}

function Flag({ tone, children }: { tone: "low" | "high"; children: ReactNode }) {
  const style = tone === "low" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800";
  return <span className={`ml-1.5 inline-flex rounded px-1.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide ${style}`}>{children}</span>;
}

function Card({ title, description, children, id }: { title: string; description?: string; children: ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h3 id={id} className="text-sm font-semibold text-slate-900">{title}</h3>
      {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Tile({ label, value, detail, valueClass = "text-slate-900" }: { label: string; value: string; detail?: ReactNode; valueClass?: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 break-words text-2xl font-semibold ${valueClass}`}>{value}</p>
      {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------- page

export default function DashboardPage() {
  const [days, setDays] = useState<Period>(90);
  const [data, setData] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    document.title = "Sales dashboard · Better View Estimates";
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchReportSummary(days)
      .then((summary) => {
        if (!cancelled) setData(summary);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load the sales report.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days, reloadKey]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Manager reports</p>
          <h2 className="text-2xl font-semibold text-slate-900">Sales dashboard</h2>
          <p className="mt-1 text-sm text-slate-600">Wins, losses and salesperson results for the last {days} days. The pipeline shows every current estimate.</p>
        </div>
        <div role="group" aria-label="Reporting period" className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {PERIODS.map((period) => (
            <button
              key={period}
              type="button"
              aria-pressed={days === period}
              onClick={() => setDays(period)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${FOCUS} ${
                days === period ? "bg-sky-700 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {period}<span className="sr-only"> days</span><span aria-hidden="true">d</span>
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="project-error flex flex-wrap items-center justify-between gap-3" role="alert">
          <span>{error}</span>
          <button type="button" className={`button secondary ${FOCUS}`} onClick={() => setReloadKey((key) => key + 1)}>Try again</button>
        </div>
      ) : null}

      {loading && !data ? <p className="text-sm text-slate-500" role="status">Loading sales report…</p> : null}
      {loading && data ? <p className="sr-only" role="status">Updating report…</p> : null}

      {data ? (
        <div aria-busy={loading} className={loading ? "space-y-6 opacity-60 transition-opacity" : "space-y-6"}>
          <Report data={data} />
        </div>
      ) : null}
    </div>
  );
}

function hasActivity(data: ReportSummary) {
  return Object.values(data.pipeline).some((bucket) => bucket.count > 0) || data.by_salesperson.length > 0 || data.follow_ups_due.length > 0;
}

function Report({ data }: { data: ReportSummary }) {
  if (!hasActivity(data)) {
    return (
      <div className="project-mobile-empty">
        <p className="font-semibold text-slate-700">No sales data yet.</p>
        <p className="mt-1">Once salespeople create and send estimates, the pipeline, close rates and margins show up here.</p>
        <Link href="/projects/new" className={`button primary mt-4 inline-flex ${FOCUS}`}>Start a project estimate</Link>
      </div>
    );
  }

  const decided = data.won.count + data.lost.count;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Tile label="Open pipeline" value={money0(data.open_pipeline_value)} detail="Finalized, sent and viewed" />
        <Tile label="Won" value={String(data.won.count)} detail={`${money0(data.won.value)} accepted`} />
        <Tile label="Close rate" value={percent(data.close_rate)} detail={decided ? `${data.won.count} won of ${decided} decided` : "No decided estimates yet"} />
        <Tile
          label="Avg won margin"
          value={percent(data.average_won_margin_percent)}
          valueClass={data.average_won_margin_percent == null ? "text-slate-900" : marginClass(data.average_won_margin_percent)}
          detail={data.average_won_margin_percent != null && data.average_won_margin_percent < LOW_MARGIN_PERCENT ? "Below the 20% target" : "Gross margin on accepted work"}
        />
        <Tile
          label="Avg days to close"
          value={data.average_days_to_close == null ? "—" : data.average_days_to_close.toFixed(1)}
          detail="Sent to accepted"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <PipelineChart pipeline={data.pipeline} />
        </div>
        <div className="lg:col-span-2">
          <LostReasons reasons={data.lost.reasons} total={data.lost.count} />
        </div>
      </div>

      <SalespersonTable rows={data.by_salesperson} />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3">
          <OverridesList rows={data.overrides} />
        </div>
        <div className="min-w-0 lg:col-span-2">
          <FollowUpsDue rows={data.follow_ups_due} />
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- sections

function PipelineChart({ pipeline }: { pipeline: ReportSummary["pipeline"] }) {
  const buckets = PIPELINE_ORDER.map((status) => ({ status, ...(pipeline[status] ?? { count: 0, value: 0 }) }));
  const maxValue = Math.max(0, ...buckets.map((bucket) => bucket.value));
  const maxCount = Math.max(0, ...buckets.map((bucket) => bucket.count));
  // Bars are scaled by dollar value; if nothing is priced yet, fall back to counts.
  const byValue = maxValue > 0;

  return (
    <Card id="pipeline-heading" title="Pipeline by status" description={`All current estimates, latest revision only (not limited to the period). Bar length shows ${byValue ? "total value" : "estimate count"}.`}>
      <ul className="space-y-3">
        {buckets.map((bucket) => {
          const measure = byValue ? bucket.value : bucket.count;
          const max = byValue ? maxValue : maxCount;
          const width = max > 0 && measure > 0 ? Math.max(2, (measure / max) * 100) : 0;
          return (
            <li key={bucket.status}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span className="font-medium text-slate-800">{STATUS_LABELS[bucket.status]}</span>
                <span className="tabular-nums text-slate-600">
                  {bucket.count} {bucket.count === 1 ? "estimate" : "estimates"} · <strong className="font-semibold text-slate-900">{money2(bucket.value)}</strong>
                </span>
              </div>
              <div className="mt-1 h-3 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                <div className="h-full rounded-full bg-sky-600" style={{ width: `${width}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function LostReasons({ reasons, total }: { reasons: Array<[string, number]>; total: number }) {
  const max = Math.max(0, ...reasons.map(([, count]) => count));
  return (
    <Card id="lost-heading" title="Lost reasons" description={total ? `${total} ${total === 1 ? "estimate" : "estimates"} lost in this period.` : undefined}>
      {reasons.length ? (
        <ul className="space-y-3">
          {reasons.map(([reason, count]) => (
            <li key={reason}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 break-words text-slate-800">{reason}</span>
                <span className="shrink-0 tabular-nums font-semibold text-slate-900">{count}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                <div className="h-full rounded-full bg-sky-600" style={{ width: `${max ? (count / max) * 100 : 0}%` }} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">No lost estimates in this period.</p>
      )}
    </Card>
  );
}

const TH = "whitespace-nowrap px-3 py-2 font-semibold";
const TD = "whitespace-nowrap px-3 py-2.5";

function SalespersonTable({ rows }: { rows: ReportSummary["by_salesperson"] }) {
  return (
    <Card
      id="salesperson-heading"
      title="By salesperson"
      description={`Margins under ${LOW_MARGIN_PERCENT}% and average discounts of ${HIGH_DISCOUNT_PERCENT}% or more are flagged. Overrides are manager approvals below the price floor.`}
    >
      {rows.length ? (
        <div className="-mx-4 overflow-x-auto sm:-mx-5" tabIndex={0} role="region" aria-labelledby="salesperson-heading">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className={`${TH} pl-4 sm:pl-5`}>Salesperson</th>
                <th scope="col" className={`${TH} text-right`}>Estimates</th>
                <th scope="col" className={`${TH} text-right`}>Sent</th>
                <th scope="col" className={`${TH} text-right`}>Won</th>
                <th scope="col" className={`${TH} text-right`}>Lost</th>
                <th scope="col" className={`${TH} text-right`}>Close rate</th>
                <th scope="col" className={`${TH} text-right`}>Won value</th>
                <th scope="col" className={`${TH} text-right`}>Avg margin</th>
                <th scope="col" className={`${TH} text-right`}>Avg discount</th>
                <th scope="col" className={`${TH} pr-4 text-right sm:pr-5`}>Overrides</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {rows.map((row) => {
                const lowMargin = row.average_margin_percent != null && row.average_margin_percent < LOW_MARGIN_PERCENT;
                const highDiscount = row.average_discount_percent != null && row.average_discount_percent >= HIGH_DISCOUNT_PERCENT;
                return (
                  <tr key={row.salesperson || "unassigned"}>
                    <th scope="row" className={`${TD} pl-4 font-medium text-slate-900 sm:pl-5`}>{row.salesperson || "Unassigned"}</th>
                    <td className={`${TD} text-right`}>{row.estimates}</td>
                    <td className={`${TD} text-right`}>{row.sent}</td>
                    <td className={`${TD} text-right`}>{row.won}</td>
                    <td className={`${TD} text-right`}>{row.lost}</td>
                    <td className={`${TD} text-right`}>{percent(row.close_rate)}</td>
                    <td className={`${TD} text-right`}>{money2(row.won_value)}</td>
                    <td className={`${TD} text-right ${lowMargin ? "bg-rose-50 font-semibold text-rose-700" : ""}`}>
                      {percent(row.average_margin_percent)}
                      {lowMargin ? <Flag tone="low">Low</Flag> : null}
                    </td>
                    <td className={`${TD} text-right ${highDiscount ? "bg-amber-50 font-semibold text-amber-800" : ""}`}>
                      {percent(row.average_discount_percent)}
                      {highDiscount ? <Flag tone="high">High</Flag> : null}
                    </td>
                    <td className={`${TD} pr-4 text-right sm:pr-5 ${row.overrides ? "font-semibold text-amber-800" : ""}`}>{row.overrides}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-500">No salesperson activity in this period.</p>
      )}
    </Card>
  );
}

function OverridesList({ rows }: { rows: ReportSummary["overrides"] }) {
  return (
    <Card id="overrides-heading" title="Manager overrides" description="Estimates approved below the minimum price floor.">
      {rows.length ? (
        <ul className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <li key={`${row.estimate_id}-${row.created_at ?? index}`} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <Link href={`/projects/${row.estimate_id}`} className={`rounded font-semibold text-brand-700 hover:underline ${FOCUS}`}>
                  {row.estimate_number || "Draft estimate"}
                </Link>
                <span className="text-xs text-slate-500">{formatDate(row.created_at)}</span>
              </div>
              <p className="mt-0.5 text-sm text-slate-700">
                {row.customer_name || "Unnamed customer"}
                <span className="text-slate-500"> · {row.salesperson || "Unassigned"}</span>
              </p>
              <p className="mt-1 break-words text-sm text-slate-600">
                <span className="font-medium text-slate-700">Reason:</span> {row.reason || "No reason recorded"}
              </p>
              <p className="mt-1 text-sm tabular-nums">
                <span className="text-slate-600">Total </span>
                <strong className="font-semibold text-slate-900">{money2(row.total)}</strong>
                <span className="text-slate-600"> · Margin </span>
                {row.margin_percent == null ? (
                  <span className="text-slate-400">—</span>
                ) : (
                  <strong className={`font-semibold ${marginClass(row.margin_percent)}`}>{percent(row.margin_percent)}</strong>
                )}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">No floor overrides in this period.</p>
      )}
    </Card>
  );
}

function FollowUpsDue({ rows }: { rows: ReportSummary["follow_ups_due"] }) {
  const today = localIsoDate(new Date());
  return (
    <Card id="followups-heading" title="Follow-ups due" description="Customers to call back today or earlier.">
      {rows.length ? (
        <ul className="divide-y divide-slate-100">
          {rows.map((row) => {
            const due = row.follow_up_on.slice(0, 10);
            const overdue = due < today;
            return (
              <li key={row.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/projects/${row.id}`} className={`min-w-0 rounded font-semibold text-brand-700 hover:underline ${FOCUS}`}>
                    {row.estimate_number || "Draft estimate"} · {row.customer_name || "Unnamed customer"}
                  </Link>
                  <StatusPill status={row.status} />
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {overdue ? (
                    <span className="font-semibold text-rose-700">Overdue since {formatDate(row.follow_up_on)}</span>
                  ) : due === today ? (
                    "Due today"
                  ) : (
                    `Due ${formatDate(row.follow_up_on)}`
                  )}
                  <span> · {row.salesperson || "Unassigned"} · </span>
                  <span className="tabular-nums">{money2(row.total)}</span>
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">No follow-ups due. Nice work.</p>
      )}
    </Card>
  );
}
