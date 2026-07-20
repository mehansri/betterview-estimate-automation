"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchEstimates,
  importEstimateFile,
  reprocessEstimate,
} from "@/lib/api";

type Estimate = {
  id: string;
  estimate_number: string;
  customer?: string;
  total_price?: number;
  source_filename?: string;
  window_count: number;
  parsed_at?: string;
};

export default function EstimatesAdminPage() {
  const [rows, setRows] = useState<Estimate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setRows(await fetchEstimates());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onUpload(file: File | null) {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const res = await importEstimateFile(file);
      setMsg(
        `Import ${res.status}: ${res.estimate_number || file.name} · ${res.window_count ?? 0} windows`
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function onReprocess(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await reprocessEstimate(id);
      setMsg(`Reprocess ${res.status}: ${res.estimate_number}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reprocess failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Estimates</h2>
        <p className="mt-1 text-sm text-slate-600">
          Import manufacturer PDFs or JSON. Each window becomes a historical
          pricing row.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <label className="block text-sm font-medium text-slate-700">
          Upload estimate (PDF or JSON)
          <input
            type="file"
            accept=".pdf,.json,application/pdf,application/json"
            className="mt-2 block w-full text-sm"
            disabled={busy}
            onChange={(e) => onUpload(e.target.files?.[0] || null)}
          />
        </label>
        {msg && (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {msg}
          </p>
        )}
        {error && (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Estimate #</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Windows</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium text-slate-900">
                  {r.estimate_number}
                </td>
                <td className="px-4 py-3 text-slate-600">{r.customer || "—"}</td>
                <td className="px-4 py-3">{r.window_count}</td>
                <td className="px-4 py-3">
                  {r.total_price != null
                    ? `$${Number(r.total_price).toLocaleString()}`
                    : "—"}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {r.source_filename || "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onReprocess(r.id)}
                    className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50"
                  >
                    Reprocess
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No estimates yet. Upload a PDF or import processed JSON.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
