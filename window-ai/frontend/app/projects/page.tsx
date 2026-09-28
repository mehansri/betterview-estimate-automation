"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useViewMode } from "@/lib/viewMode";
import {
  CustomerEstimateStatus,
  CustomerEstimateSummary,
  deleteCustomerEstimate,
  fetchCustomerEstimateList,
  fetchFollowUpsDue,
  restoreCustomerEstimate,
  setEstimateFollowUp,
} from "@/lib/api";

// ---------------------------------------------------------------- view definitions

type ViewKey = "open" | "drafts" | "awaiting" | "won" | "lost" | "trash";

type ViewDef = { key: ViewKey; label: string; status?: CustomerEstimateStatus[]; deleted?: boolean; empty: string };

const VIEWS: ViewDef[] = [
  { key: "open", label: "All open", status: ["draft", "priced", "finalized", "sent", "viewed"], empty: "No open estimates. Start a new project estimate to build your pipeline." },
  { key: "drafts", label: "Drafts", status: ["draft", "priced"], empty: "No drafts in progress." },
  { key: "awaiting", label: "Awaiting customer", status: ["finalized", "sent", "viewed"], empty: "Nothing is waiting on a customer right now. Finalize and send an estimate to see it here." },
  { key: "won", label: "Won", status: ["accepted"], empty: "No accepted estimates yet." },
  { key: "lost", label: "Lost", status: ["lost"], empty: "No estimates have been marked lost." },
  { key: "trash", label: "Trash", deleted: true, empty: "The trash is empty." },
];

const DEFAULT_VIEW: ViewKey = "open";

function viewFromParam(value: string | null): ViewDef {
  return VIEWS.find((view) => view.key === value) ?? VIEWS.find((view) => view.key === DEFAULT_VIEW)!;
}

// ---------------------------------------------------------------- formatting helpers

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600";

const STATUS_STYLES: Record<CustomerEstimateStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  priced: "bg-orange-50 text-orange-800",
  finalized: "bg-indigo-50 text-indigo-700",
  sent: "bg-sky-50 text-sky-800",
  viewed: "bg-violet-50 text-violet-700",
  accepted: "bg-emerald-100 text-emerald-800",
  lost: "bg-rose-50 text-rose-700",
};

function StatusPill({ status }: { status: CustomerEstimateStatus }) {
  return <span className={`status-pill whitespace-nowrap ${STATUS_STYLES[status] ?? STATUS_STYLES.draft}`}>{status}</span>;
}

function money(value?: number | null) {
  return value == null ? "—" : new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(value);
}

/** YYYY-MM-DD for a local calendar day (avoids UTC shifting the date in Ontario evenings). */
function localIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayIso(): string {
  return localIsoDate(new Date());
}

function addDaysIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localIsoDate(date);
}

/** Date-only strings are calendar days; anything longer is a timestamp. */
function parseDate(value: string): Date | null {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const parsed = dateOnly ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const parsed = parseDate(value);
  return parsed ? new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" }).format(parsed) : value;
}

function isOverdue(followUpOn?: string | null): boolean {
  return Boolean(followUpOn) && followUpOn!.slice(0, 10) < todayIso();
}

function marginClass(margin: number): string {
  if (margin < 20) return "text-rose-700";
  if (margin <= 30) return "text-amber-700";
  return "text-emerald-700";
}

function Margin({ value }: { value?: number | null }) {
  if (value == null) return <span className="text-slate-400">—</span>;
  return <span className={`font-semibold ${marginClass(value)}`}>{value.toFixed(1)}%</span>;
}

function FollowUp({ value }: { value?: string | null }) {
  if (!value) return <span className="text-slate-400">—</span>;
  if (isOverdue(value)) {
    return (
      <span className="whitespace-nowrap font-semibold text-rose-700">
        {formatDate(value)} <span className="ml-1 rounded bg-rose-100 px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wide">Overdue</span>
      </span>
    );
  }
  return <span className="whitespace-nowrap">{formatDate(value)}</span>;
}

function RevisionBadge({ revision }: { revision?: number }) {
  if (!revision || revision <= 1) return null;
  return <span className="ml-1.5 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[0.65rem] font-bold text-slate-600">Rev {revision}</span>;
}

function estimateLabel(row: { estimate_number?: string | null; project_name?: string | null; customer_name?: string | null }) {
  return row.estimate_number || row.project_name || row.customer_name || "this estimate";
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}

// ---------------------------------------------------------------- page

export default function ProjectsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading estimates…</p>}>
      <ProjectsList />
    </Suspense>
  );
}

function ProjectsList() {
  const { internal } = useViewMode();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = viewFromParam(searchParams.get("view"));
  const isTrash = Boolean(view.deleted);

  const [rows, setRows] = useState<CustomerEstimateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [followUps, setFollowUps] = useState<CustomerEstimateSummary[]>([]);
  const [followUpBusyId, setFollowUpBusyId] = useState<string | null>(null);
  const requestId = useRef(0);

  // Debounce the search box so we query once the salesperson pauses typing.
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(searchInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const loadRows = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchCustomerEstimateList({
        status: view.status?.join(","),
        deleted: view.deleted,
        q: query || undefined,
      });
      if (id === requestId.current) setRows(result);
    } catch (reason) {
      if (id === requestId.current) setError(errorMessage(reason, "Could not load estimates."));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [view.status, view.deleted, query]);

  const loadFollowUps = useCallback(async () => {
    try {
      setFollowUps(await fetchFollowUpsDue(0));
    } catch {
      // The strip is a convenience; the main list reports connectivity errors.
      setFollowUps([]);
    }
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(() => {
    void loadFollowUps();
  }, [loadFollowUps]);

  function selectView(key: ViewKey) {
    const params = new URLSearchParams(searchParams.toString());
    if (key === DEFAULT_VIEW) params.delete("view");
    else params.set("view", key);
    const suffix = params.toString();
    router.replace(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false });
  }

  async function moveToTrash(row: CustomerEstimateSummary) {
    const label = estimateLabel(row);
    if (!window.confirm(`Move ${label} to the trash? You can restore it from the Trash tab.`)) return;

    setBusyId(row.id);
    setError(null);
    try {
      await deleteCustomerEstimate(row.id);
      setRows((current) => current.filter((item) => item.id !== row.id));
      void loadFollowUps();
    } catch (reason) {
      setError(errorMessage(reason, "Could not move the estimate to the trash."));
    } finally {
      setBusyId(null);
    }
  }

  async function restore(row: CustomerEstimateSummary) {
    setBusyId(row.id);
    setError(null);
    try {
      await restoreCustomerEstimate(row.id);
      setRows((current) => current.filter((item) => item.id !== row.id));
      void loadFollowUps();
    } catch (reason) {
      setError(errorMessage(reason, "Could not restore the estimate."));
    } finally {
      setBusyId(null);
    }
  }

  async function updateFollowUp(row: CustomerEstimateSummary, followUpOn: string | null) {
    setFollowUpBusyId(row.id);
    setError(null);
    try {
      await setEstimateFollowUp(row.id, followUpOn);
      await Promise.all([loadFollowUps(), loadRows()]);
    } catch (reason) {
      setError(errorMessage(reason, "Could not update the follow-up."));
    } finally {
      setFollowUpBusyId(null);
    }
  }

  const emptyMessage = query ? `No estimates in “${view.label}” match “${query}”.` : view.empty;
  const showEmpty = !loading && !error && rows.length === 0;
  const busy = busyId !== null;

  function rowActions(row: CustomerEstimateSummary, mobile: boolean) {
    const label = estimateLabel(row);
    if (isTrash) {
      return (
        <button
          type="button"
          className={mobile ? `button secondary ${FOCUS}` : `text-button text-brand-700 hover:underline ${FOCUS}`}
          onClick={() => void restore(row)}
          disabled={busy}
          aria-label={`Restore ${label}`}
        >
          {busyId === row.id ? "Restoring…" : "Restore"}
        </button>
      );
    }
    return (
      <button
        type="button"
        className={mobile ? `button secondary project-remove-button ${FOCUS}` : `text-button danger hover:underline ${FOCUS}`}
        onClick={() => void moveToTrash(row)}
        disabled={busy}
        aria-label={`Move ${label} to trash`}
      >
        {busyId === row.id ? "Moving…" : "Move to trash"}
      </button>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Customer documents</p>
          <h2 className="text-2xl font-semibold text-slate-900">Project estimates</h2>
          <p className="mt-1 text-sm text-slate-600">Saved drafts, sent offers and closed Better View Solutions estimates.</p>
        </div>
        <Link href="/projects/new" className={`button primary ${FOCUS}`}>New project estimate</Link>
      </div>

      {followUps.length ? (
        <FollowUpStrip items={followUps} busyId={followUpBusyId} onSnooze={(row) => void updateFollowUp(row, addDaysIso(3))} onDone={(row) => void updateFollowUp(row, null)} />
      ) : null}

      <div className="space-y-3">
        <div role="group" aria-label="Filter estimates by stage" className="flex flex-wrap gap-2">
          {VIEWS.map((item) => {
            const active = item.key === view.key;
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={active}
                onClick={() => selectView(item.key)}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${FOCUS} ${
                  active ? "border-sky-700 bg-sky-700 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:text-slate-900"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        <label className="block max-w-md">
          <span className="sr-only">Search estimates</span>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search customer, project, number, address or salesperson"
            className="project-input"
          />
        </label>
        {isTrash ? (
          <p className="text-sm text-slate-600">Trashed estimates are hidden from lists and reports. Restore one to put it back where it was.</p>
        ) : null}
      </div>

      {error ? <p className="project-error" role="alert">{error}</p> : null}
      {loading && !rows.length ? <p className="text-sm text-slate-500" role="status">Loading estimates…</p> : null}

      <div aria-busy={loading} className={loading && rows.length ? "opacity-60 transition-opacity" : undefined}>
        {/* Desktop table */}
        <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm lg:block">
          <table className="min-w-full text-left text-sm">
            <caption className="sr-only">{view.label} estimates</caption>
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-3 py-3">Estimate</th>
                <th scope="col" className="px-3 py-3">Customer</th>
                <th scope="col" className="px-3 py-3">Project</th>
                <th scope="col" className="px-3 py-3">Salesperson</th>
                <th scope="col" className="px-3 py-3">Status</th>
                <th scope="col" className="px-3 py-3 text-right">Total</th>
                {internal ? <th scope="col" className="px-3 py-3 text-right">Margin</th> : null}
                <th scope="col" className="px-3 py-3">Sent</th>
                <th scope="col" className="px-3 py-3">{isTrash ? "Deleted" : "Follow-up"}</th>
                <th scope="col" className="px-3 py-3 text-right"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className="align-top">
                  <td className="px-3 py-4 font-semibold text-slate-900">
                    <span className="whitespace-nowrap">{row.estimate_number || "Draft"}</span>
                    <RevisionBadge revision={row.revision_number} />
                  </td>
                  <td className="px-3 py-4">
                    {row.customer_name || "Unnamed customer"}
                    {row.company_name ? <span className="block text-xs text-slate-500">{row.company_name}</span> : null}
                  </td>
                  <td className="px-3 py-4 text-slate-600">{row.project_name || "—"}</td>
                  <td className="px-3 py-4 text-slate-600">{row.salesperson || "—"}</td>
                  <td className="px-3 py-4"><StatusPill status={row.status} /></td>
                  <td className="whitespace-nowrap px-3 py-4 text-right font-semibold">{money(row.total)}</td>
                  {internal ? <td className="whitespace-nowrap px-3 py-4 text-right"><Margin value={row.margin_percent} /></td> : null}
                  <td className="whitespace-nowrap px-3 py-4 text-slate-600">{formatDate(row.sent_at)}</td>
                  <td className="px-3 py-4 text-slate-600">{isTrash ? <span className="whitespace-nowrap">{formatDate(row.deleted_at)}</span> : <FollowUp value={row.follow_up_on} />}</td>
                  <td className="px-3 py-4 text-right">
                    <div className="flex justify-end gap-3">
                      {!isTrash ? (
                        <Link href={`/projects/${row.id}`} className={`rounded text-sm font-semibold text-brand-700 hover:underline ${FOCUS}`} aria-label={`Open ${estimateLabel(row)}`}>Open</Link>
                      ) : null}
                      {rowActions(row, false)}
                    </div>
                  </td>
                </tr>
              ))}
              {showEmpty ? <tr><td colSpan={10} className="px-4 py-12 text-center text-slate-500">{emptyMessage}</td></tr> : null}
            </tbody>
          </table>
        </div>

        {/* Mobile / tablet cards */}
        <div className="project-mobile-list grid gap-3 lg:hidden">
          {rows.map((row) => (
            <article className="project-mobile-card" key={row.id}>
              <div className="project-mobile-heading">
                <div>
                  <p className="eyebrow">{row.estimate_number || "Draft estimate"}<RevisionBadge revision={row.revision_number} /></p>
                  <h3>{row.customer_name || "Unnamed customer"}</h3>
                  {row.company_name ? <p>{row.company_name}</p> : null}
                </div>
                <StatusPill status={row.status} />
              </div>
              <div className="project-mobile-details">
                <div><span>Project</span><strong>{row.project_name || "—"}</strong></div>
                <div><span>Total</span><strong>{money(row.total)}</strong></div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div className="min-w-0"><dt className="text-[0.68rem] font-bold uppercase text-slate-500">Salesperson</dt><dd className="break-words text-slate-800">{row.salesperson || "—"}</dd></div>
                {internal ? <div className="min-w-0 text-right"><dt className="text-[0.68rem] font-bold uppercase text-slate-500">Margin</dt><dd><Margin value={row.margin_percent} /></dd></div> : null}
                <div className="min-w-0"><dt className="text-[0.68rem] font-bold uppercase text-slate-500">Sent</dt><dd className="text-slate-800">{formatDate(row.sent_at)}</dd></div>
                <div className="min-w-0 text-right">
                  <dt className="text-[0.68rem] font-bold uppercase text-slate-500">{isTrash ? "Deleted" : "Follow-up"}</dt>
                  <dd className="text-slate-800">{isTrash ? formatDate(row.deleted_at) : <FollowUp value={row.follow_up_on} />}</dd>
                </div>
              </dl>
              <div className={isTrash ? "mt-3 grid" : "project-mobile-actions"}>
                {!isTrash ? <Link href={`/projects/${row.id}`} className={`button primary ${FOCUS}`}>Open project</Link> : null}
                {rowActions(row, true)}
              </div>
            </article>
          ))}
          {showEmpty ? <div className="project-mobile-empty">{emptyMessage}</div> : null}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- follow-ups strip

function FollowUpStrip({
  items,
  busyId,
  onSnooze,
  onDone,
}: {
  items: CustomerEstimateSummary[];
  busyId: string | null;
  onSnooze: (row: CustomerEstimateSummary) => void;
  onDone: (row: CustomerEstimateSummary) => void;
}) {
  return (
    <section aria-labelledby="follow-ups-heading" className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="follow-ups-heading" className="text-sm font-bold text-amber-900">Follow-ups due ({items.length})</h3>
        <p className="text-xs text-amber-800">Customers to call back today or earlier.</p>
      </div>
      <ul className="mt-3 grid gap-2">
        {items.map((row) => {
          const label = estimateLabel(row);
          const busy = busyId === row.id;
          return (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-100 bg-white px-3 py-2">
              <Link href={`/projects/${row.id}`} className={`min-w-0 flex-1 rounded ${FOCUS}`}>
                <span className="block truncate text-sm font-semibold text-slate-900 hover:underline">
                  {row.estimate_number || "Draft"} · {row.customer_name || "Unnamed customer"}
                </span>
                <span className="block text-xs text-slate-600">
                  {row.project_name ? `${row.project_name} · ` : ""}
                  {isOverdue(row.follow_up_on) ? <span className="font-semibold text-rose-700">Overdue since {formatDate(row.follow_up_on)}</span> : row.follow_up_on?.slice(0, 10) === todayIso() ? "Due today" : <>Due {formatDate(row.follow_up_on)}</>}
                  {row.total != null ? ` · ${money(row.total)}` : ""}
                </span>
              </Link>
              <div className="flex shrink-0 gap-2">
                <button type="button" className={`button secondary ${FOCUS}`} disabled={busyId !== null} onClick={() => onSnooze(row)} aria-label={`Snooze follow-up for ${label} by 3 days`}>
                  {busy ? "Saving…" : "Snooze 3 days"}
                </button>
                <button type="button" className={`button secondary ${FOCUS}`} disabled={busyId !== null} onClick={() => onDone(row)} aria-label={`Mark follow-up for ${label} done`}>
                  Done
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
