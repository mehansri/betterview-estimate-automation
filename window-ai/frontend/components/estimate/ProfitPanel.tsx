import { CustomerEstimatePricing } from "@/lib/api";

function money(value: number | undefined | null) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(value || 0);
}

function marginTone(margin: number) {
  if (margin < 20) return "text-rose-700";
  if (margin < 30) return "text-amber-700";
  return "text-emerald-700";
}

/** Internal-only job profitability across windows, doors, and job items. */
export default function ProfitPanel({ pricing }: { pricing: CustomerEstimatePricing }) {
  const profit = pricing.profitability;
  if (!profit) return null;
  const rows: Array<[string, { cost: number; sell: number }]> = [
    ["Windows", profit.breakdown.windows],
    ["Doors", profit.breakdown.doors],
    ["Job items", profit.breakdown.adders],
  ];
  return (
    <div className="editor-card">
      <div className="card-heading">
        <div><p className="eyebrow">Internal · never shown to the customer</p><h3>Job profitability</h3></div>
        <span className={`status-pill ${profit.override_applied ? "status-lost" : ""}`}>{profit.override_applied ? "Manager override" : "Within floor"}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Cost</p><p className="font-semibold">{money(profit.cost)}</p></div>
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Sell (pre-tax)</p><p className="font-semibold">{money(profit.sell)}</p></div>
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Gross profit</p><p className="font-semibold">{money(profit.profit)}</p></div>
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Margin</p><p className={`font-bold ${marginTone(profit.margin_percent)}`}>{profit.margin_percent.toFixed(1)}%</p></div>
      </div>
      <table className="mt-3 w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-1">Section</th><th className="py-1 text-right">Cost</th><th className="py-1 text-right">Sell</th><th className="py-1 text-right">Margin</th></tr></thead>
        <tbody>
          {rows.filter(([, row]) => row.sell || row.cost).map(([label, row]) => {
            const margin = row.sell ? ((row.sell - row.cost) / row.sell) * 100 : 0;
            return (
              <tr key={label} className="border-t border-slate-100">
                <td className="py-1">{label}</td>
                <td className="py-1 text-right">{money(row.cost)}</td>
                <td className="py-1 text-right">{money(row.sell)}</td>
                <td className={`py-1 text-right font-semibold ${marginTone(margin)}`}>{margin.toFixed(1)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {profit.strategy ? (
        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {profit.preset_name || "Strategy"}: {profit.strategy === "sliding_margin" && profit.sliding
            ? `${profit.sliding.margin_percent.toFixed(1)}% margin on ${money(profit.cost_basis)} of window and door cost (${profit.sliding.band === "floor" ? "profit floor" : profit.sliding.band === "flat" ? "flat rate" : "sliding"})`
            : `${(profit.target_markup_percent ?? 0).toFixed(1)}% markup on ${money(profit.cost_basis)} of window and door cost`}
          {profit.profit_floor ? ` · profit floor ${money(profit.profit_floor)}${profit.floor_applied ? " (applied)" : ""}` : ""}
        </p>
      ) : null}
      {profit.discount > 0 ? <p className="mt-2 text-xs text-slate-600">Discount given: {money(profit.discount)} ({profit.effective_discount_percent.toFixed(2)}% off window merchandise).</p> : null}
    </div>
  );
}
