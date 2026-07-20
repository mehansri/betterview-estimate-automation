"use client";

import { useEffect, useState } from "react";
import { fetchAnalytics } from "@/lib/api";

export default function AnalyticsPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAnalytics()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  if (error) {
    return (
      <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
        {error}
      </p>
    );
  }
  if (!data) {
    return <p className="text-sm text-slate-500">Loading analytics…</p>;
  }

  const overall = (data.overall || {}) as Record<string, number | null>;
  const byType = (data.by_type || {}) as Record<
    string,
    Record<string, number | null>
  >;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Analytics</h2>
        <p className="mt-1 text-sm text-slate-600">
          Historical pricing from imported estimates (
          {String(data.windows_count)} windows · {String(data.estimates_count)}{" "}
          estimates).
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Average", overall.average],
          ["Median", overall.median],
          ["Min", overall.min],
          ["Max", overall.max],
        ].map(([label, val]) => (
          <div
            key={String(label)}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {label}
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {val != null ? `$${Number(val).toLocaleString()}` : "—"}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">By product type</h3>
        <table className="mt-4 min-w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr>
              <th className="py-2">Type</th>
              <th className="py-2">Count</th>
              <th className="py-2">Avg $</th>
              <th className="py-2">Median $</th>
              <th className="py-2">$/sqft</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {Object.entries(byType).map(([type, stats]) => (
              <tr key={type}>
                <td className="py-2 font-medium">{type}</td>
                <td className="py-2">{stats.count}</td>
                <td className="py-2">
                  {stats.average != null ? `$${stats.average}` : "—"}
                </td>
                <td className="py-2">
                  {stats.median != null ? `$${stats.median}` : "—"}
                </td>
                <td className="py-2">
                  {stats.avg_price_per_sqft != null
                    ? `$${stats.avg_price_per_sqft}`
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
