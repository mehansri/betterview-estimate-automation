"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CustomerDoorOpening,
  CustomerEstimate,
  CustomerEstimateDraft,
  CustomerWindowLine,
  DoorCatalog,
  DoorOpeningSpec,
  QuoteCatalog,
  QuoteLineInput,
  QuoteLineType,
  createCustomerEstimate,
  duplicateCustomerEstimate,
  fetchCustomerEstimate,
  finalizeCustomerEstimate,
  fetchDoorCatalog,
  fetchQuoteCatalog,
  priceCustomerEstimate,
  updateCustomerEstimate,
} from "@/lib/api";
import EstimateDocument from "@/components/EstimateDocument";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import LocationInput from "@/components/LocationInput";
import { isBetween, isAtLeast, numericInputValue, NumericInputValue } from "@/lib/numericInput";
import { describeDoorLine, describeWindowSpec, descriptionWithProductDetails } from "@/lib/productDescriptions";
import { groupWindowStyles, windowStyleLabel } from "@/lib/styleOptions";
import { getCombinationSuggestion } from "@/lib/windowSuggestions";

type WindowEditor = {
  type: QuoteLineType;
  style: string;
  width: NumericInputValue;
  height: NumericInputValue;
  qty: NumericInputValue;
  colour_ext: string;
  loe180: boolean;
  i89: boolean;
  gas: string;
  triple: boolean;
  tri_pane_lami: boolean;
  frost_tint: boolean;
  brickmould: boolean;
  wood_jamb: boolean;
  sliding_ft: number;
  swing_kind: string;
  head_seat: string;
  lite_count: NumericInputValue;
  location: string;
  description: string;
};

type DoorEditor = {
  material: "fiberglass" | "steel";
  opening_type: DoorOpeningSpec["opening_type"];
  finish: string;
  location: string;
  description: string;
};

const COLORS = ["white", "black", "dark bronze", "charcoal", "sandstone"];
const GAS = ["argon", "50/50", "krypton"];
const OPENING_TYPES: Array<{ value: DoorOpeningSpec["opening_type"]; label: string }> = [
  { value: "single_door", label: "Single door" },
  { value: "single_1_sidelite", label: "Single + 1 sidelite" },
  { value: "single_2_sidelites", label: "Single + 2 sidelites" },
  { value: "double_door", label: "Double door" },
  { value: "double_2_sidelites", label: "Double + 2 sidelites" },
];

function id() {
  return globalThis.crypto?.randomUUID?.() || `line-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function plusDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function blankEstimate(): CustomerEstimate {
  return {
    id: "",
    estimate_number: null,
    status: "draft",
    customer_name: "",
    company_name: "",
    email: "",
    phone: "",
    project_name: "",
    project_address: "",
    salesperson: "",
    estimate_date: today(),
    valid_until: plusDays(30),
    description: "",
    notes: "",
    terms: "This estimate is based on the information available at the time of quoting. Final measurements, site conditions, product availability, and installation details will be confirmed before ordering.",
    windows: [],
    doors: [],
    commercial: { preset_id: "standard", negotiated_discount_percent: 0, presentation_mode: "internal" },
    pricing: null,
    pricing_hash: null,
    created_at: "",
    updated_at: "",
    finalized_at: null,
  };
}

function blankWindow(catalog?: QuoteCatalog | null): WindowEditor {
  return {
    type: "window",
    style: catalog?.styles[0]?.code || "WC-100",
    width: 30,
    height: 60,
    qty: 1,
    colour_ext: "white",
    loe180: true,
    i89: false,
    gas: "argon",
    triple: false,
    tri_pane_lami: false,
    frost_tint: false,
    brickmould: false,
    wood_jamb: false,
    sliding_ft: catalog?.patio_sliding_sizes[0] || 6,
    swing_kind: catalog?.patio_swing_kinds[0] || "single",
    head_seat: catalog?.baybow.head_seat_sizes[0] || "up to 8ft wide",
    lite_count: 3,
    location: "",
    description: "",
  };
}

function windowLite(editor: WindowEditor, style: string, width = editor.width, catalog?: QuoteCatalog | null): QuoteLineInput {
  const accessories: Array<{ kind: string; name: string }> = [];
  if (editor.brickmould) {
    const name = catalog?.accessories.brickmould?.[0]?.name;
    if (name) accessories.push({ kind: "brickmould", name });
  }
  if (editor.wood_jamb) {
    const name = catalog?.accessories.wood_jamb?.[0]?.name;
    if (name) accessories.push({ kind: "wood_jamb", name });
  }
  return {
    type: "window",
    style,
    width,
    height: editor.height,
    qty: 1,
    colour_ext: editor.colour_ext,
    glazing: {
      loe180: editor.loe180,
      i89: editor.i89,
      gas: editor.gas,
      triple: editor.triple,
      tri_pane_lami: editor.tri_pane_lami,
      frost_tint: editor.frost_tint,
    },
    accessories,
  };
}

function buildWindowSpec(editor: WindowEditor, catalog: QuoteCatalog | null): QuoteLineInput {
  if (editor.type === "window") return { ...windowLite(editor, editor.style, editor.width, catalog), qty: editor.qty };
  if (editor.type === "patio_sliding") {
    return {
      type: "patio_sliding",
      qty: editor.qty,
      nominal_ft: editor.sliding_ft,
      colour_ext: editor.colour_ext,
      glazing: { loe180: editor.loe180, i89: editor.i89, gas: editor.gas, triple: editor.triple, frost_tint: editor.frost_tint },
      assembled: true,
    };
  }
  if (editor.type === "patio_swing") {
    return {
      type: "patio_swing",
      qty: editor.qty,
      kind: editor.swing_kind,
      width: editor.width,
      height: editor.height,
      colour_ext: editor.colour_ext,
      glazing: { loe180: editor.loe180, i89: editor.i89, gas: editor.gas, triple: editor.triple },
    };
  }
  if (editor.type === "combination") {
    return {
      type: "combination",
      qty: editor.qty,
      layout: { cols: 2, rows: 1 },
      lites: [windowLite(editor, editor.style, editor.width, catalog), windowLite(editor, editor.style, editor.width, catalog)],
    };
  }
  const liteCount = editor.lite_count === "" ? 0 : editor.lite_count;
  const liteWidth = editor.width === "" || editor.lite_count === "" ? "" : editor.width / editor.lite_count;
  return {
    type: "bay_bow",
    qty: editor.qty,
    lites: Array.from({ length: liteCount }, (_, index) => windowLite(editor, catalog?.styles[index % Math.max(catalog?.styles.length || 1, 1)]?.code || editor.style, liteWidth, catalog)),
    head_seat: editor.head_seat,
  };
}

function windowLabel(line: CustomerWindowLine) {
  const spec = line.spec;
  if (line.description) return line.description;
  return describeWindowSpec(spec);
}

function partFromRow(row: DoorCatalog["materials"][number]["slabs"][number] | undefined) {
  return {
    series: row?.series || "group_a",
    glass_size: row?.glass_size || undefined,
    panel: row?.panel || undefined,
    height: row?.height || '6\'8"',
    qty: 1,
  };
}

function makeDoorSpec(catalog: DoorCatalog, material: "fiberglass" | "steel", openingType: DoorOpeningSpec["opening_type"], finish?: string): DoorOpeningSpec {
  const data = catalog.materials.find((entry) => entry.key === material) || catalog.materials[0];
  const doorRow = data.slabs.find((row) => row.kind === "slab" && row.component === "door" && row.series === "group_a") || data.slabs.find((row) => row.kind === "slab" && row.component === "door");
  const sideliteRow = data.slabs.find((row) => row.kind === "slab" && row.component === "sidelite" && row.series === "group_a") || data.slabs.find((row) => row.kind === "slab" && row.component === "sidelite");
  const double = openingType === "double_door" || openingType === "double_2_sidelites";
  const sideliteCount = openingType === "single_1_sidelite" ? 1 : openingType === "single_2_sidelites" || openingType === "double_2_sidelites" ? 2 : 0;
  return {
    material,
    finish: finish || data.finishes[0]?.key || undefined,
    opening_type: openingType,
    door: partFromRow(doorRow),
    door2: double ? partFromRow(doorRow) : undefined,
    sidelites: Array.from({ length: sideliteCount }, () => partFromRow(sideliteRow)),
    pull_bars: [],
    options: [],
  };
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`project-field ${className}`}><span>{label}</span>{children}</label>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="project-toggle"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

export default function ProjectEstimateBuilder({ estimateId }: { estimateId?: string }) {
  const [estimate, setEstimate] = useState<CustomerEstimate>(blankEstimate);
  const [quoteCatalog, setQuoteCatalog] = useState<QuoteCatalog | null>(null);
  const [doorCatalog, setDoorCatalog] = useState<DoorCatalog | null>(null);
  const [windowEditor, setWindowEditor] = useState<WindowEditor>(blankWindow());
  const [doorEditor, setDoorEditor] = useState<DoorEditor>({ material: "fiberglass", opening_type: "single_door", finish: "", location: "", description: "" });
  const [loading, setLoading] = useState(Boolean(estimateId));
  const [busy, setBusy] = useState(false);
  const [needsReprice, setNeedsReprice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchQuoteCatalog(), fetchDoorCatalog()])
      .then(([nextQuoteCatalog, nextDoorCatalog]) => {
        setQuoteCatalog(nextQuoteCatalog);
        setDoorCatalog(nextDoorCatalog);
        setWindowEditor((current) => ({ ...current, style: nextQuoteCatalog.styles[0]?.code || current.style }));
        setDoorEditor((current) => ({ ...current, finish: nextDoorCatalog.materials[0]?.finishes[0]?.key || current.finish }));
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load product catalogs."));
  }, []);

  useEffect(() => {
    if (!estimateId) return;
    fetchCustomerEstimate(estimateId)
      .then((loaded) => {
        setEstimate(loaded);
        setNeedsReprice(false);
        const firstDoor = loaded.doors[0]?.spec;
        if (firstDoor) setDoorEditor({ material: firstDoor.material, opening_type: firstDoor.opening_type, finish: firstDoor.finish || "", location: loaded.doors[0].location, description: loaded.doors[0].description });
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load this estimate."))
      .finally(() => setLoading(false));
  }, [estimateId]);

  const editable = estimate.status !== "finalized";
  const missingLocationLabels = editable
    ? [
        ...estimate.windows.map((line, index) => (line.location.trim() ? null : `window item ${index + 1}`)),
        ...estimate.doors.map((opening, index) => (opening.location.trim() ? null : `door item ${index + 1}`)),
      ].filter((label): label is string => label !== null)
    : [];
  const currentWindowSpec = useMemo(() => buildWindowSpec(windowEditor, quoteCatalog), [windowEditor, quoteCatalog]);
  const combinationSuggestion = useMemo(
    () => getCombinationSuggestion(quoteCatalog?.styles.find((style) => style.code === windowEditor.style), windowEditor.width, windowEditor.height),
    [quoteCatalog, windowEditor.style, windowEditor.width, windowEditor.height],
  );
  const windowEditorIsValid =
    isAtLeast(windowEditor.qty, 1) &&
    (windowEditor.type === "patio_sliding" ||
      (isAtLeast(windowEditor.width, 1) &&
        isAtLeast(windowEditor.height, 1) &&
        (windowEditor.type !== "bay_bow" || isBetween(windowEditor.lite_count, 3, 6))));

  function updateMetadata(patch: Partial<CustomerEstimate>) {
    if (!editable) return;
    setEstimate((current) => ({ ...current, ...patch }));
    setMessage(null);
  }

  function productChanged(update: (current: CustomerEstimate) => CustomerEstimate) {
    if (!editable) return;
    setEstimate(update);
    setNeedsReprice(true);
    setMessage(null);
  }

  function addWindowLine() {
    if (!windowEditorIsValid) return;
    const description = descriptionWithProductDetails(windowEditor.description, describeWindowSpec(currentWindowSpec, quoteCatalog));
    productChanged((current) => ({
      ...current,
      windows: [...current.windows, { id: id(), location: windowEditor.location, description, spec: currentWindowSpec }],
    }));
    setWindowEditor((current) => ({ ...current, location: "", description: "" }));
  }

  function removeWindowLine(lineId: string) {
    productChanged((current) => ({ ...current, windows: current.windows.filter((line) => line.id !== lineId) }));
  }

  function updateWindowLine(lineId: string, patch: Partial<CustomerWindowLine>) {
    setEstimate((current) => current ? { ...current, windows: current.windows.map((line) => line.id === lineId ? { ...line, ...patch } : line) } : current);
    setMessage(null);
  }

  function addDoorOpening() {
    if (!doorCatalog) return;
    const spec = makeDoorSpec(doorCatalog, doorEditor.material, doorEditor.opening_type, doorEditor.finish);
    const description = describeDoorLine(spec, doorCatalog, doorEditor.description);
    productChanged((current) => ({
      ...current,
      doors: [...current.doors, { id: id(), location: doorEditor.location, description, spec }],
    }));
    setDoorEditor((current) => ({ ...current, location: "", description: "" }));
  }

  function updateDoorOpening(openingId: string, patch: Partial<CustomerDoorOpening>) {
    setEstimate((current) => current ? { ...current, doors: current.doors.map((opening) => opening.id === openingId ? { ...opening, ...patch } : opening) } : current);
    setMessage(null);
  }

  function updateDoorSpec(openingId: string, patch: Partial<DoorOpeningSpec>) {
    productChanged((current) => ({
      ...current,
      doors: current.doors.map((opening) => opening.id === openingId ? { ...opening, spec: { ...opening.spec, ...patch } } : opening),
    }));
  }

  function rebuildDoorOpening(openingId: string, material: "fiberglass" | "steel", openingType: DoorOpeningSpec["opening_type"], finish?: string) {
    if (!doorCatalog) return;
    productChanged((current) => ({
      ...current,
      doors: current.doors.map((opening) => opening.id === openingId
        ? (() => {
          const spec = { ...makeDoorSpec(doorCatalog, material, openingType, finish), label: opening.spec.label };
          return { ...opening, description: describeDoorLine(spec, doorCatalog), spec };
        })()
        : opening),
    }));
  }

  function asDraft(value: CustomerEstimate): CustomerEstimateDraft {
    return {
      customer_name: value.customer_name,
      company_name: value.company_name,
      email: value.email,
      phone: value.phone,
      project_name: value.project_name,
      project_address: value.project_address,
      salesperson: value.salesperson,
      estimate_date: value.estimate_date,
      valid_until: value.valid_until,
      description: value.description,
      notes: value.notes,
      terms: value.terms,
      windows: value.windows,
      doors: value.doors,
      commercial: value.commercial,
    };
  }

  async function saveCurrent(): Promise<CustomerEstimate> {
    const saved = estimate.id ? await updateCustomerEstimate(estimate.id, asDraft(estimate)) : await createCustomerEstimate(asDraft(estimate));
    setEstimate(saved);
    setNeedsReprice(false);
    return saved;
  }

  async function saveDraft() {
    setBusy(true); setError(null); setMessage(null);
    try {
      await saveCurrent();
      setMessage("Draft saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the draft.");
    } finally { setBusy(false); }
  }

  async function openWindowWorkspace() {
    if (!estimate.id) return;
    if (!editable) {
      window.location.href = `/?projectId=${estimate.id}&editWindows=1`;
      return;
    }
    setBusy(true); setError(null); setMessage(null);
    try {
      const saved = await saveCurrent();
      window.location.href = `/?projectId=${saved.id}&editWindows=1`;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the project before opening the window quote.");
    } finally { setBusy(false); }
  }

  async function priceProject() {
    setBusy(true); setError(null); setMessage(null);
    try {
      const saved = await saveCurrent();
      const priced = await priceCustomerEstimate(saved.id);
      setEstimate(priced);
      setMessage(priced.pricing?.review_required ? "Priced with review items. Resolve them before finalization." : "Project priced successfully.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not price the project.");
    } finally { setBusy(false); }
  }

  async function startQuote(path: "/" | "/doors") {
    setBusy(true); setError(null); setMessage(null);
    try {
      const saved = await saveCurrent();
      window.location.href = `${path}?projectId=${saved.id}`;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create the project.");
      setBusy(false);
    }
  }

  async function finalizeProject() {
    if (!estimate.id) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const finalized = await finalizeCustomerEstimate(estimate.id);
      setEstimate(finalized);
      setMessage("Estimate finalized. It is now read-only.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not finalize the estimate.");
    } finally { setBusy(false); }
  }

  async function duplicateProject() {
    if (!estimate.id) return;
    setBusy(true); setError(null);
    try {
      const duplicate = await duplicateCustomerEstimate(estimate.id);
      window.location.href = `/projects/${duplicate.id}`;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not duplicate the estimate.");
      setBusy(false);
    }
  }

  if (loading) return <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading estimate…</p>;

  return (
    <div className="project-estimate-shell">
      <div className="project-toolbar no-print">
        <div><p className="eyebrow">Project estimate</p><h2>{estimate.estimate_number || "New Better View estimate"}</h2><p className="text-muted">{estimate.status === "finalized" ? "Finalized customer document" : "Add Windows and Doors, then price the complete project."}</p></div>
        <div className="project-actions">
          {estimate.status === "finalized" ? <><button className="button secondary" type="button" onClick={() => window.print()}>Print / Save PDF</button><button className="button primary" type="button" onClick={duplicateProject} disabled={busy}>Duplicate as draft</button></> : <><button className="button secondary" type="button" onClick={saveDraft} disabled={busy}>Save draft</button><button className="button secondary" type="button" onClick={priceProject} disabled={busy || (!estimate.windows.length && !estimate.doors.length)}>{busy ? "Working…" : "Price project"}</button><button className="button primary" type="button" title={missingLocationLabels.length ? `Add a location to ${missingLocationLabels.join(", ")}` : undefined} onClick={finalizeProject} disabled={busy || !estimate.id || estimate.status !== "priced" || needsReprice || Boolean(estimate.pricing?.review_required) || missingLocationLabels.length > 0}>{busy ? "Working…" : "Finalize estimate"}</button></>}
        </div>
        {estimate.status !== "finalized" ? <div className="project-actions no-print">
          {estimate.id ? <><Link className="button secondary" href={`/?projectId=${estimate.id}`}>Add windows</Link><Link className="button secondary" href={`/doors?projectId=${estimate.id}`}>Add doors</Link></> : <><button className="button secondary" type="button" onClick={() => startQuote("/")} disabled={busy}>Create project &amp; add windows</button><button className="button secondary" type="button" onClick={() => startQuote("/doors")} disabled={busy}>Create project &amp; add doors</button></>}
        </div> : null}
      </div>

      {message ? <p className="project-message no-print">{message}</p> : null}
      {error ? <p className="project-error no-print">{error}</p> : null}

      <div className="project-workspace">
        <section className="project-editor no-print">
          <div className="editor-card"><div className="card-heading"><div><p className="eyebrow">Customer details</p><h3>Who is this estimate for?</h3></div><span className={`status-pill status-${estimate.status}`}>{estimate.status}</span></div><div className="editor-grid">
            <Field label="Customer name *"><input className="project-input" value={estimate.customer_name} onChange={(event) => updateMetadata({ customer_name: event.target.value })} disabled={!editable} /></Field>
            <Field label="Company (optional)"><input className="project-input" value={estimate.company_name} onChange={(event) => updateMetadata({ company_name: event.target.value })} disabled={!editable} placeholder="Business or organization name" /></Field>
            <Field label="Email"><input className="project-input" type="email" value={estimate.email} onChange={(event) => updateMetadata({ email: event.target.value })} disabled={!editable} /></Field>
            <Field label="Phone"><input className="project-input" value={estimate.phone} onChange={(event) => updateMetadata({ phone: event.target.value })} disabled={!editable} /></Field>
            <Field label="Project name"><input className="project-input" value={estimate.project_name} onChange={(event) => updateMetadata({ project_name: event.target.value })} disabled={!editable} /></Field>
            <Field label="Salesperson"><input className="project-input" value={estimate.salesperson} onChange={(event) => updateMetadata({ salesperson: event.target.value })} disabled={!editable} /></Field>
            <Field label="Estimate date"><input className="project-input" type="date" value={estimate.estimate_date} onChange={(event) => updateMetadata({ estimate_date: event.target.value })} disabled={!editable} /></Field>
            <Field label="Valid until"><input className="project-input" type="date" value={estimate.valid_until} onChange={(event) => updateMetadata({ valid_until: event.target.value })} disabled={!editable} /></Field>
            <Field label="Project address" className="field-span-2"><AddressAutocomplete className="project-input" multiline rows={2} value={estimate.project_address} onChange={(value) => updateMetadata({ project_address: value })} disabled={!editable} placeholder="Start typing a Canadian address" /></Field>
            <Field label="Description" className="field-span-2"><textarea className="project-input" rows={3} value={estimate.description} onChange={(event) => updateMetadata({ description: event.target.value })} disabled={!editable} placeholder="Describe the work included in the estimate." /></Field>
            <Field label="Notes" className="field-span-2"><textarea className="project-input" rows={2} value={estimate.notes} onChange={(event) => updateMetadata({ notes: event.target.value })} disabled={!editable} /></Field>
            <Field label="Terms" className="field-span-2"><textarea className="project-input" rows={3} value={estimate.terms} onChange={(event) => updateMetadata({ terms: event.target.value })} disabled={!editable} /></Field>
          </div></div>

          <div className="editor-card"><div className="card-heading"><div><p className="eyebrow">Windows</p><h3>Add window or patio-door lines</h3></div><div className="project-actions"><span className="count-badge">{estimate.windows.length}</span>{estimate.windows.length ? <button type="button" className="button secondary" onClick={openWindowWorkspace} disabled={busy}>{editable ? "Edit windows / view costs" : "View window costs"}</button> : null}</div></div><div className="editor-grid">
            <Field label="Line type"><select className="project-input" value={windowEditor.type} onChange={(event) => setWindowEditor({ ...windowEditor, type: event.target.value as QuoteLineType })} disabled={!editable}><option value="window">Window</option><option value="combination">Combination window</option><option value="patio_sliding">Sliding patio door</option><option value="patio_swing">Swing patio door</option><option value="bay_bow">Bay / bow assembly</option></select></Field>
            {(windowEditor.type === "window" || windowEditor.type === "combination" || windowEditor.type === "bay_bow") ? <Field label="Style"><select className="project-input" value={windowEditor.style} onChange={(event) => setWindowEditor({ ...windowEditor, style: event.target.value })} disabled={!editable}>{quoteCatalog ? groupWindowStyles(quoteCatalog.styles).map((group) => <optgroup key={group.collection} label={group.label}>{group.styles.map((style) => <option key={style.code} value={style.code}>{windowStyleLabel(style)}</option>)}</optgroup>) : null}</select></Field> : null}
            {windowEditor.type === "patio_sliding" ? <Field label="Nominal size"><select className="project-input" value={windowEditor.sliding_ft} onChange={(event) => setWindowEditor({ ...windowEditor, sliding_ft: Number(event.target.value) })} disabled={!editable}>{quoteCatalog?.patio_sliding_sizes.map((size) => <option key={size} value={size}>{size} ft</option>)}</select></Field> : null}
            {windowEditor.type === "patio_swing" ? <Field label="Door family"><select className="project-input" value={windowEditor.swing_kind} onChange={(event) => setWindowEditor({ ...windowEditor, swing_kind: event.target.value })} disabled={!editable}>{quoteCatalog?.patio_swing_kinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}</select></Field> : null}
            {windowEditor.type !== "patio_sliding" ? <><Field label={windowEditor.type === "combination" ? "Lite width (in)" : "Width (in)"}><input className="project-input" type="number" min={1} step={0.125} value={windowEditor.width} onChange={(event) => setWindowEditor({ ...windowEditor, width: numericInputValue(event.target.value) })} disabled={!editable} /></Field><Field label="Height (in)"><input className="project-input" type="number" min={1} step={0.125} value={windowEditor.height} onChange={(event) => setWindowEditor({ ...windowEditor, height: numericInputValue(event.target.value) })} disabled={!editable} /></Field></> : null}
            <Field label="Quantity"><input className="project-input" type="number" min={1} value={windowEditor.qty} onChange={(event) => setWindowEditor({ ...windowEditor, qty: numericInputValue(event.target.value) })} disabled={!editable} /></Field>
            <Field label="Exterior colour"><select className="project-input" value={windowEditor.colour_ext} onChange={(event) => setWindowEditor({ ...windowEditor, colour_ext: event.target.value })} disabled={!editable}>{COLORS.map((color) => <option key={color}>{color}</option>)}</select></Field>
            {windowEditor.type === "bay_bow" ? <><Field label="Lite count"><input className="project-input" type="number" min={3} max={6} value={windowEditor.lite_count} onChange={(event) => setWindowEditor({ ...windowEditor, lite_count: numericInputValue(event.target.value) })} disabled={!editable} /></Field><Field label="Head / seat"><select className="project-input" value={windowEditor.head_seat} onChange={(event) => setWindowEditor({ ...windowEditor, head_seat: event.target.value })} disabled={!editable}>{quoteCatalog?.baybow.head_seat_sizes.map((size) => <option key={size}>{size}</option>)}</select></Field></> : null}
          </div>
          {windowEditor.type === "window" && combinationSuggestion ? <div className="project-suggestion"><div><strong>This {combinationSuggestion.styleCode} size may be a two-lite combination.</strong><p>For {combinationSuggestion.overallWidth} × {combinationSuggestion.height} overall, price two {combinationSuggestion.styleCode} lites at {combinationSuggestion.liteWidth} × {combinationSuggestion.height} each.</p></div><button type="button" className="button secondary" onClick={() => setWindowEditor((current) => ({ ...current, type: "combination", width: combinationSuggestion.liteWidth }))} disabled={!editable}>Use two-lite combination</button></div> : null}
          {windowEditor.type === "combination" ? <p className="project-help">Combination uses two equal lites with the selected style. For a 64 in overall width, enter 32 in as the lite width.</p> : null}
          {windowEditor.type !== "bay_bow" ? <div className="option-box"><p className="eyebrow">Glazing</p><div className="toggle-grid"><Toggle label="LoE 180" checked={windowEditor.loe180} onChange={(value) => setWindowEditor({ ...windowEditor, loe180: value })} /><Toggle label="i89" checked={windowEditor.i89} onChange={(value) => setWindowEditor({ ...windowEditor, i89: value })} /><Toggle label="Triple pane" checked={windowEditor.triple} onChange={(value) => setWindowEditor({ ...windowEditor, triple: value })} /><Toggle label="Tri-pane laminated" checked={windowEditor.tri_pane_lami} onChange={(value) => setWindowEditor({ ...windowEditor, tri_pane_lami: value })} /><Toggle label="Frost / tint" checked={windowEditor.frost_tint} onChange={(value) => setWindowEditor({ ...windowEditor, frost_tint: value })} /></div><Field label="Gas"><select className="project-input" value={windowEditor.gas} onChange={(event) => setWindowEditor({ ...windowEditor, gas: event.target.value })} disabled={!editable}>{GAS.map((gas) => <option key={gas}>{gas}</option>)}</select></Field></div> : null}
          {windowEditor.type === "window" ? <div className="option-box"><p className="eyebrow">Accessories</p><div className="toggle-grid"><Toggle label="Brickmould" checked={windowEditor.brickmould} onChange={(value) => setWindowEditor({ ...windowEditor, brickmould: value })} /><Toggle label="Wood jamb" checked={windowEditor.wood_jamb} onChange={(value) => setWindowEditor({ ...windowEditor, wood_jamb: value })} /></div></div> : null}
          <div className="editor-grid"><Field label="Location"><LocationInput className="project-input" value={windowEditor.location} onChange={(value) => setWindowEditor({ ...windowEditor, location: value })} disabled={!editable} placeholder="Living room" /></Field><Field label="Customer description"><input className="project-input" value={windowEditor.description} onChange={(event) => setWindowEditor({ ...windowEditor, description: event.target.value })} disabled={!editable} placeholder="Energy-efficient replacement window" /></Field></div>
          <button type="button" className="button secondary" onClick={addWindowLine} disabled={!editable || !quoteCatalog || !windowEditorIsValid}>Add window line</button>
          {estimate.windows.length ? <div className="line-list">{estimate.windows.map((line) => <div className="line-card" key={line.id}><div className="line-card-main"><strong>{windowLabel(line)}</strong><span>{line.spec.type?.replace(/_/g, " ")} · Qty {String(line.spec.qty || 1)}</span></div><div className="line-card-fields"><LocationInput className="project-input" required value={line.location} onChange={(value) => updateWindowLine(line.id, { location: value })} disabled={!editable} placeholder="Location" /><input className="project-input" value={line.description} onChange={(event) => updateWindowLine(line.id, { description: event.target.value })} disabled={!editable} placeholder="Customer description override" /><button type="button" className="text-button danger" onClick={() => removeWindowLine(line.id)} disabled={!editable}>Remove</button></div></div>)}</div> : null}
          </div>

          <div className="editor-card"><div className="card-heading"><div><p className="eyebrow">Doors</p><h3>Add entry-door openings</h3></div><span className="count-badge">{estimate.doors.length}</span></div><div className="editor-grid">
            <Field label="Material"><select className="project-input" value={doorEditor.material} onChange={(event) => { const material = event.target.value as "fiberglass" | "steel"; const data = doorCatalog?.materials.find((entry) => entry.key === material); setDoorEditor({ ...doorEditor, material, finish: data?.finishes[0]?.key || "" }); }} disabled={!editable}>{doorCatalog?.materials.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}</select></Field>
            <Field label="Opening type"><select className="project-input" value={doorEditor.opening_type} onChange={(event) => setDoorEditor({ ...doorEditor, opening_type: event.target.value as DoorOpeningSpec["opening_type"] })} disabled={!editable}>{OPENING_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></Field>
            <Field label="Finish"><select className="project-input" value={doorEditor.finish} onChange={(event) => setDoorEditor({ ...doorEditor, finish: event.target.value })} disabled={!editable}>{doorCatalog?.materials.find((entry) => entry.key === doorEditor.material)?.finishes.map((finish) => <option key={finish.key} value={finish.key}>{finish.label}</option>)}</select></Field>
            <Field label="Location"><LocationInput className="project-input" value={doorEditor.location} onChange={(value) => setDoorEditor({ ...doorEditor, location: value })} disabled={!editable} placeholder="Front entry" /></Field>
            <Field label="Customer description" className="field-span-2"><input className="project-input" value={doorEditor.description} onChange={(event) => setDoorEditor({ ...doorEditor, description: event.target.value })} disabled={!editable} placeholder="Fiberglass entry door package" /></Field>
          </div><button type="button" className="button secondary" onClick={addDoorOpening} disabled={!editable || !doorCatalog}>Add door opening</button>
          {estimate.doors.length ? <div className="line-list">{estimate.doors.map((opening) => <div className="line-card" key={opening.id}><div className="line-card-main"><strong>{opening.description || opening.spec.label || "Door opening"}</strong><span>{opening.spec.material} · {OPENING_TYPES.find((type) => type.value === opening.spec.opening_type)?.label}</span></div><div className="line-card-fields"><LocationInput className="project-input" required value={opening.location} onChange={(value) => updateDoorOpening(opening.id, { location: value })} disabled={!editable} placeholder="Location" /><input className="project-input" value={opening.description} onChange={(event) => updateDoorOpening(opening.id, { description: event.target.value })} disabled={!editable} placeholder="Customer description override" /><select className="project-input" value={opening.spec.material} onChange={(event) => rebuildDoorOpening(opening.id, event.target.value as "fiberglass" | "steel", opening.spec.opening_type, opening.spec.finish)} disabled={!editable}><option value="fiberglass">Fiberglass</option><option value="steel">Steel</option></select><select className="project-input" value={opening.spec.opening_type} onChange={(event) => rebuildDoorOpening(opening.id, opening.spec.material, event.target.value as DoorOpeningSpec["opening_type"], opening.spec.finish)} disabled={!editable}>{OPENING_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select><button type="button" className="text-button danger" onClick={() => productChanged((current) => ({ ...current, doors: current.doors.filter((item) => item.id !== opening.id) }))} disabled={!editable}>Remove</button></div></div>)}</div> : null}
          </div>

          {estimate.pricing?.review_required ? <div className="review-box"><strong>Review required before finalization</strong>{estimate.pricing.warnings.map((warning, index) => <p key={`${warning.code}-${index}`}>{warning.message}</p>)}</div> : null}
          {missingLocationLabels.length ? <div className="review-box"><strong>Locations required before finalization</strong><p>Add a location to every window and door. Missing: {missingLocationLabels.join(", ")}.</p></div> : null}
        </section>
        <section className="project-preview"><EstimateDocument estimate={estimate} editable={editable} onChange={updateMetadata} /></section>
      </div>
    </div>
  );
}
