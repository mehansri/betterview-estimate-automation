"use client";

import { useCallback, useEffect, useState } from "react";
import { exportWindows, fetchWindows } from "@/lib/api";

type Row = {
  id: string;
  estimate_number?: string;
  type?: string;
  width?: number;
  height?: number;
  frame?: string;
  glass?: string;
  color?: string;
  unit_price?: number;
  quantity: number;
  tempered: boolean;
};

export default function WindowsAdminPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const params: Record<string, string> = { limit: "200" };
      if (type) params.type = type;
      if (q) params.q = q;
      setRows(await fetchWindows(params));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, [type, q]);

  useEffect(() => {
    load();
  }, [load]);

  async function onExport() {
    try {
      const res = await exportWindows();
      setExportMsg(`Exported ${res.count} rows → ${res.filename}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Windows</h2>
          <p className="mt-1 text-sm text-slate-600">
            Search and filter historical line items (one row per window).
          </p>
        </div>
        <button
          type="button"
          onClick={onExport}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
        >
          Export CSV
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="Search customer / estimate / type"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">All types</option>
          {[
            "Casement",
            "Awning",
            "Fixed",
            "Slider",
            "Patio Door",
            "Double Hung",
            "Picture",
          ].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {exportMsg && (
        <p className="text-sm text-emerald-700">{exportMsg}</p>
      )}
      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3">Estimate</th>
              <th className="px-3 py-3">Type</th>
              <th className="px-3 py-3">Size</th>
              <th className="px-3 py-3">Glass</th>
              <th className="px-3 py-3">Color</th>
              <th className="px-3 py-3">Qty</th>
              <th className="px-3 py-3">Unit $</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 font-medium">{r.estimate_number}</td>
                <td className="px-3 py-2">
                  {r.type}
                  {r.tempered ? " · T" : ""}
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {r.width}″ × {r.height}″
                </td>
                <td className="px-3 py-2">{r.glass}</td>
                <td className="px-3 py-2">{r.color}</td>
                <td className="px-3 py-2">{r.quantity}</td>
                <td className="px-3 py-2">
                  {r.unit_price != null
                    ? `$${Number(r.unit_price).toFixed(2)}`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
