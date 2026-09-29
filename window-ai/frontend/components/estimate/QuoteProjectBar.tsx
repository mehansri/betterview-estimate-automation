"use client";

import Link from "next/link";
import { CustomerEstimate } from "@/lib/api";
import { useViewMode, VIEW_MODE_SHORTCUT } from "@/lib/viewMode";

/** Slim header for the window and door builders: the project, the view toggle, and a way back. */
export default function QuoteProjectBar({ project, verb }: { project: CustomerEstimate; verb: string }) {
  const { mode, setMode, role } = useViewMode();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2 text-sm">
      <div className="min-w-0">
        <span className="text-brand-700">{verb} </span>
        <strong className="text-brand-900">{project.project_name || project.customer_name || "Selected project"}</strong>
        {project.estimate_number ? <span className="ml-2 text-xs text-brand-700">{project.estimate_number}</span> : null}
      </div>
      <div className="flex items-center gap-3">
        {role === "rep" ? <span className="text-xs text-brand-700">Customer view (locked)</span> : (
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-semibold" title={`Switch views here, in the header, or with ${VIEW_MODE_SHORTCUT}.`}>
            <button type="button" className={`rounded-md px-3 py-1.5 ${mode === "internal" ? "bg-brand-600 text-white" : "text-slate-700"}`} onClick={() => setMode("internal")}>Internal</button>
            <button type="button" className={`rounded-md px-3 py-1.5 ${mode === "customer" ? "bg-emerald-600 text-white" : "text-slate-700"}`} onClick={() => setMode("customer")}>Customer</button>
          </div>
        )}
        <Link href={`/projects/${project.id}`} className="font-semibold text-brand-700 hover:underline">Open project</Link>
      </div>
    </div>
  );
}
