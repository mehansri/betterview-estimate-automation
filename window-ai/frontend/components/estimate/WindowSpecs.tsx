import type { ReactNode } from "react";
import { sharedSpecRows, windowLineParts } from "@/lib/windowSpecs";

/** "Every window": the specs all the estimate's windows share, once above the list (window_specs_box() in the PDF). */
export function WindowSpecsBox({ shared }: { shared: string[] }) {
  const rows = sharedSpecRows(shared);
  if (!rows.length) return null;
  return (
    <div className="window-specs-box">
      <p className="window-specs-label">Every window</p>
      <dl>
        {rows.map(([name, value]) => (
          <div key={name}><dt>{name}</dt><dd>{value}</dd></div>
        ))}
      </dl>
    </div>
  );
}

/** One window line: its drawing beside its type (bold), size and sections, and energy rating. */
export function WindowLineText({ text, energy, sketch }: { text: string; energy?: string | null; sketch?: ReactNode }) {
  const { type, detail } = windowLineParts(text);
  return (
    <span className="window-line">
      {sketch ? <span className="window-line-sketch">{sketch}</span> : null}
      <span className="window-line-text">
        <span className="window-line-type">{type}</span>
        {detail ? <span className="window-line-detail">{detail}</span> : null}
        {energy ? <span className="window-line-energy">{energy}</span> : null}
      </span>
    </span>
  );
}
