"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CustomerEstimateSummary, fetchCustomerEstimates } from "@/lib/api";

function money(value?: number | null) {
  return value == null ? "—" : new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(value);
}

export default function ProjectsPage() {
  const [rows, setRows] = useState<CustomerEstimateSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCustomerEstimates().then(setRows).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load estimates."));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="eyebrow">Customer documents</p><h2 className="text-2xl font-semibold text-slate-900">Project estimates</h2><p className="mt-1 text-sm text-slate-600">Saved drafts and finalized Better View Solutions estimates.</p></div>
        <Link href="/projects/new" className="button primary">New project estimate</Link>
      </div>
      {error ? <p className="project-error">{error}</p> : null}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Estimate</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Project</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">
          {rows.map((row) => <tr key={row.id}><td className="px-4 py-4 font-semibold text-slate-900">{row.estimate_number || "Draft"}</td><td className="px-4 py-4">{row.customer_name || "Unnamed customer"}{row.company_name ? <span className="block text-xs text-slate-500">{row.company_name}</span> : null}</td><td className="px-4 py-4 text-slate-600">{row.project_name || "—"}</td><td className="px-4 py-4"><span className={`status-pill status-${row.status}`}>{row.status}</span></td><td className="px-4 py-4 text-right font-semibold">{money(row.total)}</td><td className="px-4 py-4 text-right"><Link href={`/projects/${row.id}`} className="text-sm font-semibold text-brand-700 hover:underline">Open</Link></td></tr>)}
          {!rows.length ? <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">No project estimates yet.</td></tr> : null}
        </tbody></table>
      </div>
    </div>
  );
}

