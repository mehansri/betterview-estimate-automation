"use client";

import { useRef, useState } from "react";
import { CustomerWindowLine, OrderChecklistImport as ImportedOrder, importOrderChecklist } from "@/lib/api";
import { describeWindowSpec } from "@/lib/productDescriptions";

type Props = {
  editable: boolean;
  busy: boolean;
  existingCount: number;
  /** Puts the reviewed lines on the estimate (the page then saves and prices them). */
  onApply: (windows: CustomerWindowLine[], mode: "replace" | "append") => void;
};

/**
 * "Import order PDF": reads a Window City order checklist into window and
 * patio door lines, shows them for review, and only then adds them.
 */
export default function OrderChecklistImport({ editable, busy, existingCount, onApply }: Props) {
  const [preview, setPreview] = useState<ImportedOrder | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function read(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setReading(true); setError(null); setPreview(null);
    try {
      const imported = await importOrderChecklist(file);
      if (!imported.windows.length) {
        setError(`No windows or patio doors were found in that order.${imported.warnings.length ? ` ${imported.warnings.join(" ")}` : ""}`);
        return;
      }
      setPreview({
        ...imported,
        windows: imported.windows.map((line) => ({ ...line, description: line.description || describeWindowSpec(line.spec, null, line.details) })),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The order PDF could not be read.");
    } finally {
      setReading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function apply(mode: "replace" | "append") {
    if (!preview) return;
    onApply(preview.windows, mode);
    setPreview(null);
  }

  const disabled = busy || reading || !editable;

  return (
    <>
      <label className={`button secondary ${disabled ? "pointer-events-none opacity-60" : "cursor-pointer"}`} title="Read a Window City order checklist PDF into window and patio door lines">
        {reading ? "Reading order…" : "Import order PDF"}
        <input ref={fileInput} type="file" accept="application/pdf" className="sr-only" onChange={(event) => read(event.target.files)} disabled={disabled} />
      </label>
      {error ? <p className="project-error mt-3 w-full">{error}</p> : null}
      {preview ? (
        <div className="mt-3 w-full rounded-lg border border-slate-200 p-3 text-sm">
          <p className="font-semibold text-slate-800">
            Order {preview.order.order_number || ""}{preview.order.client ? ` · ${preview.order.client}` : ""}: {preview.order.lines} line(s), {preview.order.units} unit(s)
          </p>
          <p className="text-muted text-xs">Check the lines against the order, then add them. Sizes, hinges (viewed from outside), glazing, jamb and brickmould come from the PDF.</p>
          {preview.warnings.length ? (
            <div className="review-box mt-2"><strong>Check before adding</strong>{preview.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>
          ) : null}
          <ul className="mt-2 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {preview.windows.map((line) => (
              <li key={line.id} className="flex gap-2 px-2 py-1.5">
                <span className="w-8 shrink-0 font-semibold">{line.details?.tag}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{line.location}</span>
                  {Number(line.spec.qty || 1) > 1 ? <span className="status-pill ml-2">×{String(line.spec.qty)}</span> : null}
                  <span className="block text-xs text-slate-600">{line.description}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            {existingCount ? (
              <>
                <button type="button" className="button primary" onClick={() => { if (window.confirm(`Replace the ${existingCount} window line(s) on this estimate with the ${preview.windows.length} imported line(s)?`)) apply("replace"); }} disabled={disabled}>Replace {existingCount} existing line(s)</button>
                <button type="button" className="button secondary" onClick={() => apply("append")} disabled={disabled}>Add to existing</button>
              </>
            ) : (
              <button type="button" className="button primary" onClick={() => apply("replace")} disabled={disabled}>Add {preview.windows.length} line(s)</button>
            )}
            <button type="button" className="button secondary" onClick={() => setPreview(null)}>Discard</button>
          </div>
        </div>
      ) : null}
    </>
  );
}
