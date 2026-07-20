"use client";

import { useState } from "react";
import { WindowSpec, findSimilar } from "@/lib/api";

const empty = (): WindowSpec => ({
  type: "Casement",
  width: 48,
  height: 60,
  frame: "Vinyl",
  glass: "Double",
  color: "White",
  tempered: false,
  grid: "None",
  shape: "Rectangular",
  installation: "Replacement",
  quantity: 1,
  brickmould: true,
  wood_jamb: true,
  screen: true,
  mulled: false,
  nailing_flange: false,
  gas_fill: "Argon",
  color_upcharge: false,
});

export default function SimilarPage() {
  const [form, setForm] = useState<WindowSpec>(empty());
  const [result, setResult] = useState<{
    neighbor_count: number;
    price_stats: Record<string, number | null>;
    similar_windows: Array<Record<string, unknown>>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function search() {
    setLoading(true);
    setError(null);
    try {
      setResult(await findSimilar(form));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Similar windows</h2>
        <p className="mt-1 text-sm text-slate-600">
          Weighted nearest-neighbor search over historical inventory (type,
          dimensions, glass, frame, color, options).
        </p>
      </div>

      <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-3">
        <label className="text-sm">
          <span className="font-medium text-slate-700">Type</span>
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            {[
              "Casement",
              "Awning",
              "Fixed",
              "Slider",
              "Patio Door",
              "Double Hung",
              "Picture",
            ].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="font-medium text-slate-700">Width (in)</span>
          <input
            type="number"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={form.width}
            onChange={(e) =>
              setForm({ ...form, width: Number(e.target.value) })
            }
          />
        </label>
        <label className="text-sm">
          <span className="font-medium text-slate-700">Height (in)</span>
          <input
            type="number"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={form.height}
            onChange={(e) =>
              setForm({ ...form, height: Number(e.target.value) })
            }
          />
        </label>
        <label className="text-sm">
          <span className="font-medium text-slate-700">Glass</span>
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={form.glass}
            onChange={(e) => setForm({ ...form, glass: e.target.value })}
          >
            {["Single", "Double", "Triple"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="font-medium text-slate-700">Frame</span>
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={form.frame}
            onChange={(e) => setForm({ ...form, frame: e.target.value })}
          >
            {["Vinyl", "Aluminum", "Fiberglass", "Wood"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="font-medium text-slate-700">Color</span>
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
          >
            {["White", "Black", "Dark Bronze", "Brown", "Beige", "Gray"].map(
              (t) => (
                <option key={t}>{t}</option>
              )
            )}
          </select>
        </label>
        <div className="sm:col-span-3">
          <button
            type="button"
            onClick={search}
            disabled={loading}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {loading ? "Searching…" : "Find similar"}
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {result && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-600">
              Found <strong>{result.neighbor_count}</strong> similar windows
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {result.price_stats.average != null
                ? `Avg $${result.price_stats.average}`
                : "No priced neighbors"}
            </p>
            <p className="text-sm text-slate-500">
              Median ${result.price_stats.median ?? "—"} · Range $
              {result.price_stats.min ?? "—"} – ${result.price_stats.max ?? "—"}
            </p>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Score</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Size</th>
                  <th className="px-3 py-2">Glass</th>
                  <th className="px-3 py-2">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.similar_windows.map((w) => (
                  <tr key={String(w.id)}>
                    <td className="px-3 py-2">
                      {w.similarity != null
                        ? Number(w.similarity).toFixed(3)
                        : "—"}
                    </td>
                    <td className="px-3 py-2">{String(w.type)}</td>
                    <td className="px-3 py-2">
                      {String(w.width)}″ × {String(w.height)}″
                    </td>
                    <td className="px-3 py-2">{String(w.glass)}</td>
                    <td className="px-3 py-2">
                      {w.unit_price != null
                        ? `$${Number(w.unit_price).toFixed(2)}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
