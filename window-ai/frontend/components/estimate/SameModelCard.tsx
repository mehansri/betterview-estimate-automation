"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  CustomerDoorOpening,
  CustomerEstimate,
  CustomerWindowLine,
  DrawingRow,
  HomeModelSummary,
  ModelMatch,
  extractDrawingOpenings,
  fetchDrawingReaderStatus,
  fetchHomeModelOpenings,
  fetchModelMatch,
  saveHomeModelFromEstimate,
} from "@/lib/api";
import { queueMeasureRows } from "@/components/MeasureSheet";

type Props = {
  estimate: CustomerEstimate;
  editable: boolean;
  busy: boolean;
  /** Save the project first (new projects have no id yet) and return it. */
  ensureSaved: () => Promise<CustomerEstimate>;
  onApply: (openings: { windows: CustomerWindowLine[]; doors: CustomerDoorOpening[] }, model: HomeModelSummary, mirrored: boolean) => void;
  onPreliminaryChange: (value: boolean) => void;
};

const RELATION_LABEL = { this_home: "This address", same: "Same model", similar: "Similar model" } as const;
const SOURCE_LABEL = { measured: "measured job", permit_pdf: "permit drawings", manual: "entered manually" } as const;

const FLAG_LABEL: Record<string, string> = {
  reversed: "reversed", corner: "corner lot", end: "end unit", walk_out: "walk-out", walk_up: "walk-up",
  lookout: "lookout", loft: "loft", vaulted: "vaulted", side_door: "side door", raised_ceiling: "raised ceiling",
};

function streetOnly(address: string) {
  return address.split(",")[0];
}

function titleCase(value: string) {
  // Builder codes stay upper-case: C38E, 44-01, DRLD, KTHC.
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    .replace(/\b([a-z]*\d[a-z\d]*|[b-df-hj-np-tv-xz]{3,})\b/gi, (code) => code.toUpperCase());
}

function areaRange(low: number, high: number | null) {
  return high && Math.abs(high - low) >= 0.5 ? `${Math.round(low)}–${Math.round(high)} m²` : `${Math.round(low)} m²`;
}

function mirrorSuggested(model: HomeModelSummary) {
  return model.differences.some((note) => note.startsWith("mirror image"));
}

/** Flag drawing rows that need a closer look in the measure sheet's location text. */
function reviewLocation(row: DrawingRow) {
  const problems = [
    !row.width || !row.height ? "size missing" : "",
    !row.style ? "choose the style" : "",
    row.confidence === "low" ? "low confidence" : "",
    row.note,
  ].filter(Boolean);
  return problems.length ? `${row.location} — check: ${problems.join("; ")}` : row.location;
}

export default function SameModelCard({ estimate, editable, busy, ensureSaved, onApply, onPreliminaryChange }: Props) {
  const [match, setMatch] = useState<ModelMatch | null>(null);
  const [lookedUp, setLookedUp] = useState("");
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showNeighbours, setShowNeighbours] = useState(false);
  const [readerAvailable, setReaderAvailable] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const address = estimate.project_address.trim();
  const stale = Boolean(match) && lookedUp !== address;

  useEffect(() => {
    fetchDrawingReaderStatus().then((status) => setReaderAvailable(status.available)).catch(() => setReaderAvailable(false));
  }, []);

  async function lookUp() {
    if (!address) return;
    setWorking("lookup"); setError(null); setNotice(null);
    try {
      setMatch(await fetchModelMatch(address, estimate.id || undefined));
      setLookedUp(address);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The permit lookup failed.");
    } finally { setWorking(null); }
  }

  async function applyModel(model: HomeModelSummary, mirrored: boolean) {
    const count = estimate.windows.length + estimate.doors.length;
    if (count && !window.confirm(`Replace the ${count} window and door item(s) on this estimate with the ${model.label} openings?`)) return;
    setWorking(`use-${model.id}`); setError(null);
    try {
      const openings = await fetchHomeModelOpenings(model.id, mirrored);
      onApply(openings, model, mirrored);
      setNotice(`Added ${openings.windows.length} window line(s) and ${openings.doors.length} door(s) from ${streetOnly(model.source_address) || model.label}${mirrored ? ", mirrored" : ""}. Marked preliminary until you measure.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load the model's openings.");
    } finally { setWorking(null); }
  }

  /** A measured neighbour becomes the model template, then its openings are used. */
  async function applyMeasuredJob(estimateId: string) {
    setWorking(`job-${estimateId}`); setError(null);
    try {
      const model = await saveHomeModelFromEstimate(estimateId);
      setMatch((current) => current ? { ...current, home_models: [{ ...model, relation: "same" }, ...current.home_models] } : current);
      setWorking(null);
      await applyModel(model, false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save that job as the model.");
      setWorking(null);
    }
  }

  async function saveAsModel(replace?: HomeModelSummary) {
    if (replace && !window.confirm(`Replace the saved ${replace.label} template (from ${streetOnly(replace.source_address)}) with this home's openings?`)) return;
    setWorking("save-model"); setError(null);
    try {
      const saved = await ensureSaved();
      const model = await saveHomeModelFromEstimate(saved.id, replace?.id);
      setNotice(`Saved as the ${model.label} template. Other homes of this model can now start from it.`);
      await lookUp();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the model template.");
    } finally { setWorking(null); }
  }

  async function readDrawings(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setWorking("drawings"); setError(null); setNotice("Reading the drawings — this can take a few minutes for a full set…");
    try {
      const saved = await ensureSaved();
      const extraction = await extractDrawingOpenings(file, address);
      if (!extraction.rows.length) {
        setNotice(null);
        setError(`No windows were found on those drawings.${extraction.warnings.length ? ` ${extraction.warnings.join(" ")}` : ""}`);
        return;
      }
      queueMeasureRows(saved.id, extraction.rows.map((row) => ({ ...row, location: reviewLocation(row) })));
      window.location.href = `/projects/${saved.id}/measure`;
    } catch (reason) {
      setNotice(null);
      setError(reason instanceof Error ? reason.message : "The drawings could not be read.");
    } finally {
      setWorking(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const subject = match?.subject;
  const sameTemplate = match?.home_models.find((model) => model.relation === "same");
  const templateSources = new Set(match?.home_models.map((model) => model.source_estimate_id).filter(Boolean));
  const jobs = (match?.measured_jobs || []).filter((job) => !templateSources.has(job.estimate_id));
  const canSaveAsModel = Boolean(subject) && !estimate.is_preliminary && (estimate.windows.length > 0 || estimate.doors.length > 0);
  const disabled = busy || Boolean(working);

  return (
    <div className="editor-card">
      <div className="card-heading">
        <div><p className="eyebrow">Same-model homes</p><h3>Quote from the builder&apos;s model</h3></div>
        {estimate.is_preliminary ? <span className="status-pill status-sent">Preliminary</span> : null}
      </div>
      <p className="project-help">Looks up the original building permit for this address (builder, model, elevation, plan and floor area, as the city records them) to find neighbouring homes of the same model, and reuses openings already measured on one of them. Brampton, Toronto, Mississauga and Oakville.</p>

      {estimate.is_preliminary ? (
        <label className="review-box mb-3 flex items-start gap-2">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked onChange={(event) => onPreliminaryChange(event.target.checked)} disabled={!editable} />
          <span><strong>Preliminary — subject to site measure.</strong> Sizes were copied from a same-model home; the PDF says so. Untick once you have measured this home.</span>
        </label>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="button secondary" onClick={lookUp} disabled={disabled || !address}>
          {working === "lookup" ? "Looking up the permit…" : match && !stale ? "Look up again" : "Find same-model homes"}
        </button>
        {!address ? <span className="text-muted text-sm">Enter the project address first.</span> : null}
        {stale ? <span className="text-muted text-sm">The address changed — look it up again.</span> : null}
      </div>

      {notice ? <p className="project-message mt-3">{notice}</p> : null}
      {error ? <p className="project-error mt-3">{error}</p> : null}

      {match && !stale ? (
        <div className="mt-3 space-y-3 text-sm">
          {subject ? (
            <div>
              <p className="font-semibold text-slate-800">{subject.label}</p>
              <p className="text-muted">
                Permit {subject.permit_number}{subject.issue_date ? ` · issued ${subject.issue_date}` : ""}
                {subject.plan ? ` · plan ${subject.plan}${subject.lot ? ` lot ${subject.lot}` : ""}` : ""} · {match.source?.label}
              </p>
              {subject.flags.length || subject.options ? (
                <p className="text-muted text-xs">{[...subject.flags.map((flag) => FLAG_LABEL[flag] || flag), subject.options ? `options: ${subject.options}` : ""].filter(Boolean).join(" · ")}</p>
              ) : null}
              {match.source?.match_basis ? <p className="text-muted text-xs">Matched on {match.source.match_basis}.</p> : null}
              <p className="mt-1">
                {match.same_model.length ? `${match.same_model.length} other home(s) nearby share this model` : "No other home nearby is exactly this model"}
                {match.similar.length ? `, ${match.similar.length} more are a variant (another elevation or a close floor area)` : ""}.
                {match.same_model.length || match.similar.length ? <button type="button" className="ml-1 font-semibold text-sky-700 hover:underline" onClick={() => setShowNeighbours((value) => !value)}>{showNeighbours ? "Hide" : "Show"} addresses</button> : null}
              </p>
              {showNeighbours ? (
                <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                  {[...match.same_model, ...match.similar].map((record) => (
                    <li key={record.permit_number || record.address_key}>
                      {streetOnly(record.address)}
                      {record.differences?.length ? <span className="text-amber-700"> — {record.differences.join("; ")}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          {match.message ? <p className="text-muted">{match.message}</p> : null}

          {match.lineup.length > 1 || (match.lineup[0] && match.lineup[0].count > 1) ? (
            <div>
              <p className="eyebrow">Builder&apos;s lineup {subject?.plan ? `on plan ${subject.plan}` : "nearby"}</p>
              <ul className="mt-1 divide-y divide-slate-100 rounded-lg border border-slate-200">
                {match.lineup.slice(0, 12).map((item) => (
                  <li key={item.key} className={`flex flex-wrap items-baseline justify-between gap-2 px-2 py-1.5 ${item.includes_subject ? "bg-sky-50" : ""}`}>
                    <span>
                      <span className="font-semibold">{item.model ? titleCase(item.model) : `Unnamed model ≈ ${Math.round(item.gfa_min || 0)} m²`}</span>
                      {item.includes_subject ? <span className="status-pill ml-2">This home</span> : null}
                      <span className="text-muted text-xs"> · {item.dwelling_type.toLowerCase()}{item.gfa_min ? ` · ${areaRange(item.gfa_min, item.gfa_max)}` : ""}</span>
                    </span>
                    <span className="text-xs text-slate-600">
                      {item.count} home(s)
                      {Object.keys(item.elevations).length ? ` · elev ${Object.entries(item.elevations).map(([code, count]) => `${code}×${count}`).join(" ")}` : ""}
                      {Object.keys(item.flags).length ? ` · ${Object.entries(item.flags).map(([flag, count]) => `${FLAG_LABEL[flag] || flag} ×${count}`).join(", ")}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-muted mt-1 text-xs">Elevations of one model share the floor plan; front windows (and corner-lot side windows) differ. Measure or order drawings for one home per model to cover the whole plan.</p>
            </div>
          ) : null}

          {match.home_models.length ? (
            <div>
              <p className="eyebrow">Saved model templates</p>
              <ul className="mt-1 space-y-2">
                {match.home_models.map((model) => (
                  <li key={model.id} className="rounded-lg border border-slate-200 p-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold">{model.label}{model.relation === "similar" ? <span className="status-pill ml-2">Similar</span> : null}</p>
                        <p className="text-muted text-xs">{model.window_count} window(s), {model.door_count} door(s) · from {SOURCE_LABEL[model.source]}{model.source_address ? ` at ${streetOnly(model.source_address)}` : ""}</p>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" className={`button ${mirrorSuggested(model) ? "secondary" : "primary"}`} onClick={() => applyModel(model, false)} disabled={disabled || !editable}>{working === `use-${model.id}` ? "Adding…" : "Use"}</button>
                        <button type="button" className={`button ${mirrorSuggested(model) ? "primary" : "secondary"}`} title="For a mirror-image lot: swaps left/right elevations and hinge sides" onClick={() => applyModel(model, true)} disabled={disabled || !editable}>Use mirrored</button>
                      </div>
                    </div>
                    {model.differences.length ? <p className="mt-1 text-xs text-amber-700">Check on site: {model.differences.join("; ")}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {jobs.length ? (
            <div>
              <p className="eyebrow">Measured jobs on these homes</p>
              <ul className="mt-1 space-y-2">
                {jobs.map((job) => (
                  <li key={job.estimate_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-2">
                    <div>
                      <p className="font-semibold">{streetOnly(job.project_address)} <span className="status-pill ml-1">{RELATION_LABEL[job.relation]}</span></p>
                      <p className="text-muted text-xs">{job.estimate_number || "Draft"} · {job.customer_name || "No name"} · {job.window_count} window(s), {job.door_count} door(s)</p>
                    </div>
                    <div className="flex gap-2">
                      <Link className="button secondary" href={`/projects/${job.estimate_id}`} target="_blank">Open</Link>
                      <button type="button" className="button primary" title="Saves this job as the model template, then adds its openings here" onClick={() => applyMeasuredJob(job.estimate_id)} disabled={disabled || !editable}>{working === `job-${job.estimate_id}` ? "Adding…" : "Use as template"}</button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {subject && editable ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              {canSaveAsModel ? (
                <button type="button" className="button secondary" onClick={() => saveAsModel(sameTemplate)} disabled={disabled}>
                  {working === "save-model" ? "Saving…" : sameTemplate ? "Replace model template with this home" : "Save this home as the model template"}
                </button>
              ) : null}
              {estimate.id ? <Link className="button secondary" href={`/projects/${estimate.id}/measure`}>Measure this home</Link> : null}
              {readerAvailable ? (
                <label className={`button secondary ${disabled ? "pointer-events-none opacity-60" : "cursor-pointer"}`}>
                  {working === "drawings" ? "Reading drawings…" : "Read permit drawings (PDF)"}
                  <input ref={fileInput} type="file" accept="application/pdf" className="sr-only" onChange={(event) => readDrawings(event.target.files)} disabled={disabled} />
                </label>
              ) : null}
              {match.source ? (
                <span className="text-xs">
                  <a className="font-semibold text-sky-700 hover:underline" href={match.source.records_request_url} target="_blank" rel="noreferrer">Order this home&apos;s permit drawings from {match.source.label}</a>
                  {match.source.records_request_note ? <span className="text-muted"> ({match.source.records_request_note})</span> : null}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
