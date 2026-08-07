"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  appendCustomerEstimateLines,
  CustomerEstimate,
  CustomerDoorOpening,
  DoorCatalog,
  DoorCatalogRow,
  DoorOpeningSpec,
  DoorOptionSpec,
  DoorPartSpec,
  DoorProjectResponse,
  fetchDoorCatalog,
  fetchCustomerEstimate,
  priceCustomerEstimate,
  quoteDoors,
} from "@/lib/api";
import { newEstimateLineId } from "@/lib/quoteHandoff";
import { describeDoorLine } from "@/lib/productDescriptions";
import ProjectAccessGate from "@/components/ProjectAccessGate";

const GLASS_SERIES: Record<string, string> = {
  A: "group_a",
  B: "group_b",
  C: "group_c",
  D: "group_d",
  W: "wrought_iron",
};

type OpeningDraft = DoorOpeningSpec & { label: string; finish: string };

type DoorQuoteOpening = {
  id: string;
  location: string;
  description: string;
  spec: OpeningDraft;
};

function money(value: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(value);
}

function keyForRow(row: DoorCatalogRow, index: number) {
  return [
    row.series,
    row.component,
    row.height,
    row.glass_size || "",
    row.panel || "",
    index,
  ].join("|");
}

function materialData(catalog: DoorCatalog, material: OpeningDraft["material"]) {
  return catalog.materials.find((entry) => entry.key === material) || catalog.materials[0];
}

function glassForSeries(catalog: DoorCatalog, material: string, series: string) {
  const group = Object.entries(GLASS_SERIES).find(([, value]) => value === series)?.[0];
  return catalog.glass_groups.find(
    (glass) => glass.group === group && glass.materials.includes(material)
  );
}

function rowsForPart(
  catalog: DoorCatalog,
  material: OpeningDraft["material"],
  part: DoorPartSpec,
  component: "door" | "sidelite" | "direct_glazed_sidelite"
) {
  const data = materialData(catalog, material);
  const series = part.glass
    ? GLASS_SERIES[catalog.glass_groups.find((glass) => glass.name === part.glass)?.group || ""]
    : part.series;
  return data.slabs.filter(
    (row) =>
      row.kind === "slab" &&
      row.component === component &&
      (!series || row.series === series)
  );
}

function partFromRow(row: DoorCatalogRow, existing: DoorPartSpec, glass?: string) {
  return {
    series: glass ? undefined : row.series,
    glass: glass || undefined,
    glass_size: row.glass_size || undefined,
    panel: row.panel || undefined,
    height: row.height,
    qty: existing.qty || 1,
    direct_glazed: existing.direct_glazed || false,
  } satisfies DoorPartSpec;
}

function firstPart(
  catalog: DoorCatalog,
  material: OpeningDraft["material"],
  component: "door" | "sidelite"
): DoorPartSpec {
  const data = materialData(catalog, material);
  const rows = data.slabs.filter(
    (row) => row.kind === "slab" && row.component === component
  );
  const preferred = rows.find((row) => row.series === "group_a") || rows[0];
  if (!preferred) {
    return { series: "solid_panel", height: '6\'8"', qty: 1 };
  }
  const glass = glassForSeries(catalog, material, preferred.series)?.name;
  return partFromRow(preferred, { height: preferred.height, qty: 1 }, glass);
}

function makeOpening(
  catalog: DoorCatalog,
  material: OpeningDraft["material"],
  openingType: DoorOpeningSpec["opening_type"],
  label = "Opening 1"
): OpeningDraft {
  const layout = catalog.opening_types.find((type) => type.key === openingType)!;
  const data = materialData(catalog, material);
  return {
    label,
    material,
    finish: data.finishes[0]?.key || "",
    opening_type: openingType,
    door: firstPart(catalog, material, "door"),
    door2: layout.doors === 2 ? firstPart(catalog, material, "door") : undefined,
    sidelites: Array.from({ length: layout.sidelites }, () => firstPart(catalog, material, "sidelite")),
    pull_bars: [],
    options: [],
  };
}

function sameSpec(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function PartPicker({
  catalog,
  material,
  component,
  label,
  value,
  onChange,
}: {
  catalog: DoorCatalog;
  material: OpeningDraft["material"];
  component: "door" | "sidelite";
  label: string;
  value: DoorPartSpec;
  onChange: (part: DoorPartSpec) => void;
}) {
  const data = materialData(catalog, material);
  const componentName = component === "door" ? "door" : value.direct_glazed ? "direct_glazed_sidelite" : "sidelite";
  const allRows = data.slabs.filter(
    (row) =>
      row.kind === "slab" &&
      (component === "door"
        ? row.component === "door"
        : row.component === "sidelite" || row.component === "direct_glazed_sidelite")
  );
  const rows = rowsForPart(catalog, material, value, componentName);
  const seriesOptions = Array.from(
    new Map(
      data.slabs
        .filter((row) => row.kind === "slab" && row.component === componentName)
        .map((row) => [row.series, row.series_label])
    ).entries()
  );
  const glassOptions = catalog.glass_groups.filter((glass) => glass.materials.includes(material));
  const selectedSeries = value.glass
    ? GLASS_SERIES[catalog.glass_groups.find((glass) => glass.name === value.glass)?.group || ""]
    : value.series;
  const filteredRows = rows.filter((row) => row.series === selectedSeries);
  const heights = Array.from(new Set(filteredRows.map((row) => row.height)));
  const currentHeight = heights.includes(value.height) ? value.height : heights[0];
  const heightRows = filteredRows.filter((row) => row.height === currentHeight);
  const currentIndex = heightRows.findIndex(
    (row) => row.glass_size === value.glass_size && row.panel === value.panel
  );

  function chooseRow(row: DoorCatalogRow | undefined, glass = value.glass) {
    if (row) onChange(partFromRow(row, value, glass));
  }

  function chooseGlass(nextGlass: string) {
    if (nextGlass === "__series__") {
      const row = allRows.find((entry) => entry.series === value.series) || allRows[0];
      chooseRow(row, undefined);
      return;
    }
    const group = catalog.glass_groups.find((glass) => glass.name === nextGlass);
    const nextSeries = GLASS_SERIES[group?.group || ""];
    const row = data.slabs.find(
      (entry) => entry.kind === "slab" && entry.component === componentName && entry.series === nextSeries
    );
    chooseRow(row, nextGlass);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-slate-900">{label}</h4>
        <Field label="Qty">
          <input
            className="input w-20"
            type="number"
            min={1}
            value={value.qty}
            onChange={(event) => onChange({ ...value, qty: Math.max(1, Number(event.target.value)) })}
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Named glass">
          <select
            className="input"
            value={value.glass || "__series__"}
            onChange={(event) => chooseGlass(event.target.value)}
          >
            <option value="__series__">Select by price-book series</option>
            {glassOptions.map((glass) => (
              <option key={glass.name} value={glass.name}>
                {glass.name} · Group {glass.group}
              </option>
            ))}
          </select>
        </Field>
        {!value.glass && (
          <Field label="Price-book series">
            <select
              className="input"
              value={selectedSeries || ""}
              onChange={(event) => {
                const nextRows = data.slabs.filter(
                  (row) => row.kind === "slab" && row.component === componentName && row.series === event.target.value
                );
                chooseRow(nextRows[0], undefined);
              }}
            >
              {seriesOptions.map(([key, labelText]) => (
                <option key={key} value={key}>
                  {labelText}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Height">
          <select
            className="input"
            value={currentHeight || ""}
            onChange={(event) => chooseRow(filteredRows.find((row) => row.height === event.target.value), value.glass)}
          >
            {heights.map((height) => (
              <option key={height}>{height}</option>
            ))}
          </select>
        </Field>
        <Field label="Size / panel row">
          <select
            className="input"
            value={currentIndex >= 0 ? String(currentIndex) : ""}
            onChange={(event) => chooseRow(heightRows[Number(event.target.value)], value.glass)}
          >
            {heightRows.map((row, index) => (
              <option key={keyForRow(row, index)} value={index}>
                {row.row_label || [row.glass_size, row.panel].filter(Boolean).join(" · ")}
              </option>
            ))}
          </select>
        </Field>
        {component === "sidelite" && (
          <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
            <input
              type="checkbox"
              checked={Boolean(value.direct_glazed)}
              onChange={(event) => {
                const nextComponent = event.target.checked ? "direct_glazed_sidelite" : "sidelite";
                const nextRows = data.slabs.filter(
                  (row) => row.kind === "slab" && row.component === nextComponent
                );
                const nextRow = nextRows.find((row) => row.series === selectedSeries) || nextRows[0];
                onChange({ ...partFromRow(nextRow, value, value.glass), direct_glazed: event.target.checked });
              }}
            />
            Direct-glazed sidelite
          </label>
        )}
      </div>
    </div>
  );
}

function OptionEditor({
  options,
  value,
  onChange,
  onRemove,
}: {
  options: DoorCatalog["materials"][number]["options"];
  value: DoorOptionSpec;
  onChange: (value: DoorOptionSpec) => void;
  onRemove: () => void;
}) {
  const categories = Array.from(new Map(options.map((option) => [option.category, option.category_label])).entries());
  const category = value.category || categories[0]?.[0] || "";
  const categoryOptions = options.filter((option) => option.category === category);
  const selected = categoryOptions.find((option) => option.item === value.item) || categoryOptions[0];
  return (
    <div className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_1.5fr_auto]">
      <select
        className="input"
        value={category}
        onChange={(event) => {
          const next = options.find((option) => option.category === event.target.value);
          onChange({ ...value, category: event.target.value, item: next?.item || "", column: undefined });
        }}
      >
        {categories.map(([key, label]) => (
          <option key={key} value={key}>{label}</option>
        ))}
      </select>
      <select
        className="input"
        value={selected?.item || value.item}
        onChange={(event) => onChange({ ...value, category, item: event.target.value, column: undefined })}
      >
        {categoryOptions.map((option) => <option key={option.item}>{option.item}</option>)}
      </select>
      <button type="button" className="text-xs font-medium text-rose-600 hover:underline" onClick={onRemove}>
        Remove
      </button>
      {selected?.columns && selected.columns.length > 0 && (
        <select
          className="input sm:col-span-2"
          value={value.column || selected.columns[0]}
          onChange={(event) => onChange({ ...value, column: event.target.value })}
        >
          {selected.columns.map((column) => <option key={column}>{column}</option>)}
        </select>
      )}
    </div>
  );
}

export default function DoorQuoteBuilder({ projectId }: { projectId?: string }) {
  const [catalog, setCatalog] = useState<DoorCatalog | null>(null);
  const [project, setProject] = useState<CustomerEstimate | null>(null);
  const [draft, setDraft] = useState<OpeningDraft | null>(null);
  const [openings, setOpenings] = useState<DoorQuoteOpening[]>([]);
  const [result, setResult] = useState<DoorProjectResponse | null>(null);
  const [presentationMode, setPresentationMode] = useState<"internal" | "customer">("internal");
  const [loading, setLoading] = useState(true);
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [handoffEstimateId, setHandoffEstimateId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projectLoading, setProjectLoading] = useState(Boolean(projectId));

  useEffect(() => {
    fetchDoorCatalog()
      .then((nextCatalog) => {
        setCatalog(nextCatalog);
        setDraft(makeOpening(nextCatalog, "fiberglass", "single_door"));
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load door catalog."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!projectId) {
      setProject(null);
      setProjectLoading(false);
      return;
    }
    setProjectLoading(true);
    fetchCustomerEstimate(projectId)
      .then(setProject)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load the selected project."))
      .finally(() => setProjectLoading(false));
  }, [projectId]);

  const data = useMemo(
    () => (catalog && draft ? materialData(catalog, draft.material) : null),
    [catalog, draft]
  );

  function updateDraft(next: OpeningDraft) {
    setDraft(next);
    setResult(null);
  }

  function updateOpeningType(nextType: DoorOpeningSpec["opening_type"]) {
    if (!catalog || !draft) return;
    const layout = catalog.opening_types.find((type) => type.key === nextType)!;
    updateDraft({
      ...draft,
      opening_type: nextType,
      door2: layout.doors === 2 ? draft.door2 || firstPart(catalog, draft.material, "door") : undefined,
      sidelites: Array.from({ length: layout.sidelites }, (_, index) => draft.sidelites[index] || firstPart(catalog, draft.material, "sidelite")),
    });
  }

  function updateMaterial(nextMaterial: OpeningDraft["material"]) {
    if (!catalog || !draft) return;
    updateDraft(makeOpening(catalog, nextMaterial, draft.opening_type, draft.label));
  }

  function buildPayload() {
    if (!draft) return [];
    const saved = openings.map((opening) => opening.spec);
    if (!openings.length) return [draft];
    return sameSpec(saved[saved.length - 1], draft) ? saved : [...saved, draft];
  }

  function addOpening() {
    if (!draft) return;
    const description = describeDoorLine(draft, catalog);
    setOpenings((current) => current.length && sameSpec(current[current.length - 1].spec, draft) ? current : [
      ...current,
      { id: newEstimateLineId("door"), location: "", description, spec: draft },
    ]);
    setResult(null);
  }

  async function generateQuote() {
    const payload = buildPayload();
    if (!payload.length) return;
    setLoading(true);
    setError(null);
    try {
      const response = await quoteDoors(payload);
      setOpenings((current) => payload.map((spec, index) => ({
        id: current[index]?.id || newEstimateLineId("door"),
        location: current[index]?.location || "",
        description: current[index]?.description || describeDoorLine(spec, catalog),
        spec,
      })));
      setResult(response);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not price this door opening.");
    } finally {
      setLoading(false);
    }
  }

  async function sendToProjectEstimate() {
    if (!projectId || !project || project.status === "finalized" || !result || !openings.length) return;
    setHandoffBusy(true);
    setHandoffEstimateId(null);
    setError(null);
    const doors: CustomerDoorOpening[] = openings.map((opening) => ({
      id: opening.id,
      location: opening.location,
      description: opening.description,
      spec: opening.spec,
    }));
    const projectHasProducts = project.windows.length > 0 || project.doors.length > 0;
    try {
      const assigned = await appendCustomerEstimateLines(projectId, {
        windows: [],
        doors,
        commercial: projectHasProducts ? undefined : { preset_id: "standard", negotiated_discount_percent: 0, presentation_mode: "internal" },
      });
      try {
        const priced = await priceCustomerEstimate(assigned.id);
        window.location.href = `/projects/${priced.id}`;
      } catch (pricingError) {
        setHandoffEstimateId(assigned.id);
        setError(pricingError instanceof Error ? `Door quote assigned, but project pricing needs attention: ${pricingError.message}` : "Door quote assigned, but project pricing needs attention.");
      }
    } catch (handoffError) {
      setError(handoffError instanceof Error ? handoffError.message : "Could not assign the door quote to this project.");
    } finally {
      setHandoffBusy(false);
    }
  }

  if (!projectId) return <ProjectAccessGate product="door" />;
  if (projectLoading) return <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading projectâ€¦</p>;
  if (!project) return <p className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">{error || "The selected project could not be loaded."}</p>;
  if (loading && !catalog) {
    return <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading Palma door catalog…</p>;
  }
  if (!catalog || !draft || !data) {
    return <p className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">{error || "Door catalog unavailable."}</p>;
  }

  const openingMeta = catalog.opening_types.find((type) => type.key === draft.opening_type)!;
  const transomMeta = data.transoms.find((transom) => transom.shape === (draft.transom?.shape || "rectangle"));
  const selectedOption = data.options[0];
  const selectedPanel = data.panel_upcharges[0];
  const selectedPull = data.pull_bars[0];

  const customer = result?.customer_presentation;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Workflow</p>
          <p className="text-base font-semibold text-slate-900">{presentationMode === "internal" ? "Internal door pricing workspace" : "Door customer presentation"}</p>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-white p-1 text-xs font-semibold">
          <button type="button" className={`rounded-lg px-3 py-2 ${presentationMode === "internal" ? "bg-brand-600 text-white" : "text-slate-700"}`} onClick={() => setPresentationMode("internal")}>Internal view</button>
          <button type="button" className={`rounded-lg px-3 py-2 ${presentationMode === "customer" ? "bg-emerald-600 text-white" : "text-slate-700"}`} onClick={() => setPresentationMode("customer")}>Customer view</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm">
        <div><span className="text-brand-700">Assigning this quote to </span><strong className="text-brand-900">{project.project_name || project.customer_name || "Selected project"}</strong>{project.estimate_number ? <span className="ml-2 text-xs text-brand-700">{project.estimate_number}</span> : null}</div>
        <Link href={`/projects/${project.id}`} className="font-semibold text-brand-700 hover:underline">Open project</Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-5">
      {presentationMode === "internal" ? (
        <section className="space-y-6 lg:col-span-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Door opening</h2>
              <p className="mt-1 text-sm text-slate-500">Complete the required price-book choices; downstream fields only show valid catalog rows.</p>
            </div>
            <Field label="Opening label">
              <input className="input w-44" value={draft.label} onChange={(event) => updateDraft({ ...draft, label: event.target.value })} />
            </Field>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field label="Material">
              <select className="input" value={draft.material} onChange={(event) => updateMaterial(event.target.value as OpeningDraft["material"]) }>
                {catalog.materials.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
              </select>
            </Field>
            <Field label="Finish">
              <select className="input" value={draft.finish} onChange={(event) => updateDraft({ ...draft, finish: event.target.value })}>
                {data.finishes.map((finish) => <option key={finish.key} value={finish.key}>{finish.label}</option>)}
              </select>
            </Field>
            <Field label="Opening type">
              <select className="input" value={draft.opening_type} onChange={(event) => updateOpeningType(event.target.value as DoorOpeningSpec["opening_type"]) }>
                {catalog.opening_types.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}
              </select>
            </Field>
          </div>

          <div className="mt-6 space-y-3">
            <PartPicker catalog={catalog} material={draft.material} component="door" label="Door slab" value={draft.door} onChange={(door) => updateDraft({ ...draft, door })} />
            {openingMeta.doors === 2 && draft.door2 && (
              <PartPicker catalog={catalog} material={draft.material} component="door" label="Second door slab" value={draft.door2} onChange={(door2) => updateDraft({ ...draft, door2 })} />
            )}
            {draft.sidelites.map((sidelite, index) => (
              <PartPicker key={index} catalog={catalog} material={draft.material} component="sidelite" label={`Sidelite ${index + 1}`} value={sidelite} onChange={(next) => updateDraft({ ...draft, sidelites: draft.sidelites.map((item, itemIndex) => itemIndex === index ? next : item) })} />
            ))}
          </div>

          <div className="mt-6 border-t border-slate-100 pt-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Transom</h3>
                <p className="text-xs text-slate-500">Optional frame, glass area, minimum billing, and tempering.</p>
              </div>
              <input type="checkbox" checked={Boolean(draft.transom)} onChange={(event) => updateDraft({ ...draft, transom: event.target.checked ? { shape: "rectangle", sq_ft: 10, tempered: false, qty: 1 } : undefined })} />
            </div>
            {draft.transom && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="Shape">
                  <select className="input" value={draft.transom.shape} onChange={(event) => updateDraft({ ...draft, transom: { ...draft.transom!, shape: event.target.value as "rectangle" | "shapes" } })}>
                    {data.transoms.map((transom) => <option key={transom.shape} value={transom.shape}>{transom.shape_label}</option>)}
                  </select>
                </Field>
                <Field label="Glass pricing group">
                  <select className="input" value={draft.transom.glass || ""} onChange={(event) => updateDraft({ ...draft, transom: { ...draft.transom!, glass: event.target.value || undefined } })}>
                    <option value="">Frame only</option>
                    {(transomMeta?.glass || []).map((glass) => <option key={glass} value={glass}>{glass.replace(/_/g, " ")}</option>)}
                  </select>
                </Field>
                {draft.transom.glass && <Field label="Glass sq. ft."><input className="input" type="number" min={0.01} step={0.1} value={draft.transom.sq_ft} onChange={(event) => updateDraft({ ...draft, transom: { ...draft.transom!, sq_ft: Number(event.target.value) } })} /></Field>}
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={draft.transom.tempered} onChange={(event) => updateDraft({ ...draft, transom: { ...draft.transom!, tempered: event.target.checked } })} /> Tempered transom glass</label>
              </div>
            )}
          </div>

          <div className="mt-6 border-t border-slate-100 pt-6">
            <div className="flex items-center justify-between gap-3">
              <div><h3 className="text-sm font-semibold text-slate-900">Panel upcharge</h3><p className="text-xs text-slate-500">Optional price-book panel selection with width-band pricing.</p></div>
              <input type="checkbox" checked={Boolean(draft.panel_upcharge)} onChange={(event) => updateDraft({ ...draft, panel_upcharge: event.target.checked && selectedPanel ? { code: selectedPanel.code, height: selectedPanel.height, width: 36, qty: 1 } : undefined })} />
            </div>
            {draft.panel_upcharge && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="Panel"><select className="input" value={draft.panel_upcharge.code || ""} onChange={(event) => { const panel = data.panel_upcharges.find((item) => item.code === event.target.value); updateDraft({ ...draft, panel_upcharge: { ...draft.panel_upcharge!, code: event.target.value, panel: panel?.panel, height: panel?.height || draft.panel_upcharge!.height } }); }}>{data.panel_upcharges.map((panel) => <option key={`${panel.code}-${panel.height}`} value={panel.code}>{panel.panel} · {panel.height}</option>)}</select></Field>
                <Field label="Width (in)"><input className="input" type="number" min={1} step={0.1} value={draft.panel_upcharge.width} onChange={(event) => updateDraft({ ...draft, panel_upcharge: { ...draft.panel_upcharge!, width: Number(event.target.value) } })} /></Field>
              </div>
            )}
          </div>

          <div className="mt-6 border-t border-slate-100 pt-6">
            <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-slate-900">Pull-bar hardware</h3><p className="text-xs text-slate-500">Each selected row is the all-in Palma hardware price.</p></div><button type="button" className="text-xs font-semibold text-brand-700 hover:underline" onClick={() => selectedPull && updateDraft({ ...draft, pull_bars: [...draft.pull_bars, { style: selectedPull.style, block: selectedPull.block, length_in: selectedPull.length_in, finish: selectedPull.finish, shape: selectedPull.shape, qty: 1 }] })}>Add pull bar</button></div>
            <div className="mt-4 space-y-2">
              {draft.pull_bars.map((pull, index) => <div key={index} className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_auto]"><select className="input" value={`${pull.style}|${pull.block}|${pull.length_in}|${pull.finish}|${pull.shape}`} onChange={(event) => { const choice = data.pull_bars.find((item) => `${item.style}|${item.block}|${item.length_in}|${item.finish}|${item.shape}` === event.target.value); if (!choice) return; updateDraft({ ...draft, pull_bars: draft.pull_bars.map((item, itemIndex) => itemIndex === index ? { ...item, style: choice.style, block: choice.block, length_in: choice.length_in, finish: choice.finish, shape: choice.shape } : item) }); }}>{Array.from(new Map(data.pull_bars.map((item) => [`${item.style}|${item.block}|${item.length_in}|${item.finish}|${item.shape}`, item])).values()).map((item) => <option key={`${item.style}|${item.block}|${item.length_in}|${item.finish}|${item.shape}`} value={`${item.style}|${item.block}|${item.length_in}|${item.finish}|${item.shape}`}>{item.length_in}&quot; {item.finish_label} {item.shape} · {item.block_label}</option>)}</select><button type="button" className="text-xs font-medium text-rose-600 hover:underline" onClick={() => updateDraft({ ...draft, pull_bars: draft.pull_bars.filter((_, itemIndex) => itemIndex !== index) })}>Remove</button></div>)}
            </div>
          </div>

          <div className="mt-6 border-t border-slate-100 pt-6">
            <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-slate-900">Catalog options</h3><p className="text-xs text-slate-500">Optional extras are selected from Palma’s exact option rows.</p></div><button type="button" className="text-xs font-semibold text-brand-700 hover:underline" onClick={() => selectedOption && updateDraft({ ...draft, options: [...draft.options, { category: selectedOption.category, item: selectedOption.item, qty: 1 }] })}>Add option</button></div>
            <div className="mt-4 space-y-2">
              {draft.options.map((option, index) => <OptionEditor key={index} options={data.options} value={option} onChange={(next) => updateDraft({ ...draft, options: draft.options.map((item, itemIndex) => itemIndex === index ? next : item) })} onRemove={() => updateDraft({ ...draft, options: draft.options.filter((_, itemIndex) => itemIndex !== index) })} />)}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={addOpening} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Add to project</button>
            <button type="button" onClick={generateQuote} disabled={loading} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60">{loading ? "Pricing…" : "Generate door quote"}</button>
          </div>
          {error && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        </div>

        {openings.length > 0 && <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h3 className="text-sm font-semibold text-slate-900">Project openings ({openings.length})</h3><ul className="mt-3 divide-y divide-slate-100">{openings.map((opening, index) => <li key={opening.id} className="py-3 text-sm"><div className="flex items-center justify-between gap-4"><div><p className="font-medium text-slate-900">{opening.spec.label || `Opening ${index + 1}`}</p><p className="text-slate-500">{opening.spec.material} · {opening.spec.opening_type.replace(/_/g, " ")} · {opening.spec.finish}</p></div><button type="button" className="text-xs font-medium text-rose-600 hover:underline" onClick={() => { setOpenings(openings.filter((_, itemIndex) => itemIndex !== index)); setResult(null); }}>Remove</button></div><div className="mt-2 grid gap-2 sm:grid-cols-2"><input className="input" value={opening.location} onChange={(event) => setOpenings(openings.map((item, itemIndex) => itemIndex === index ? { ...item, location: event.target.value } : item))} placeholder="Location (optional)" /><input className="input" value={opening.description} onChange={(event) => setOpenings(openings.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))} placeholder="Customer description (optional)" /></div></li>)}</ul></div>}
      </section>
      ) : (
        <section className="space-y-6 lg:col-span-3">
        <div className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-emerald-900">Door customer estimate</h2>
              <p className="mt-1 text-sm text-emerald-800">Customer-safe door components, sell amounts, tax, and total. Internal cost and markup details are hidden.</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">Customer view</span>
          </div>
          {!customer ? <p className="mt-5 text-sm text-slate-500">Generate a door quote first to see the customer presentation.</p> : <div className="mt-5 space-y-5">
            {customer.openings.map((opening) => <div key={opening.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-900">{opening.label}</p><p className="text-xs text-slate-500">{opening.location ? `${opening.location} · ` : ""}{opening.material} · {opening.finish_label}</p></div><p className="font-semibold text-slate-900">{money(opening.total)}</p></div>
              <div className="mt-3 space-y-1 text-sm text-slate-700">{opening.items.map((item, index) => <div key={`${opening.id}-${index}`} className="flex justify-between gap-3"><span>{item.description}{item.qty > 1 ? ` ×${item.qty}` : ""}</span><span className="font-medium">{money(item.line_total)}</span></div>)}</div>
            </div>)}
            <div className="ml-auto w-full max-w-xs space-y-1 border-t border-slate-200 pt-3 text-sm"><div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{money(customer.subtotal)}</span></div><div className="flex justify-between text-slate-600"><span>HST</span><span>{money(customer.hst)}</span></div><div className="flex justify-between text-base font-bold text-emerald-900"><span>Total</span><span>{money(customer.total)}</span></div></div>
          </div>}
        </div>
      </section>
      )}
      {presentationMode === "internal" ? <>

      <aside className="lg:col-span-2"><div className="sticky top-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-base font-semibold text-slate-900">Door quote</h2>{!result ? <p className="mt-3 text-sm text-slate-500">Complete the opening and click <strong>Generate door quote</strong> for the Palma list, install, markup, HST, and customer total.</p> : <div className="mt-4 space-y-4"><div className="rounded-xl bg-brand-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Project customer total</p><p className="mt-1 text-3xl font-bold text-brand-700">{money(result.totals.customer_total)}</p><p className="mt-1 text-xs text-slate-500">Sell {money(result.totals.sell)} · HST {money(result.totals.hst)}</p></div><div className="grid grid-cols-2 gap-3 text-sm"><Metric label="List" value={result.totals.list_total} /><Metric label="Material cost" value={result.totals.material_cost} /><Metric label="Install" value={result.totals.install} /><Metric label="Markup" value={result.totals.markup_amount} /></div>{result.openings.map((opening, index) => <div key={index} className="rounded-xl border border-slate-100 bg-slate-50 p-4"><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold text-slate-900">{opening.label}</p><p className="text-xs text-slate-500">{opening.material} · {opening.finish_label}</p></div><p className="text-sm font-bold text-slate-900">{money(opening.customer_total)}</p></div><div className="mt-3 space-y-1 text-xs text-slate-600">{opening.line_items.map((item, itemIndex) => <div key={itemIndex} className="flex justify-between gap-3"><span>{item.description}{item.qty > 1 ? ` ×${item.qty}` : ""}</span><span>{money(item.list)}</span></div>)}</div><div className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-500"><p>List {money(opening.list_total)} · Material {money(opening.material_cost)}</p><p>Install {money(opening.install)} · Sell {money(opening.sell)} · HST {money(opening.hst)}</p>{opening.notes.map((note) => <p key={note} className="mt-1">Note: {note}</p>)}</div></div>)}</div>}</div></aside>
      </> : null}
      <div className="lg:col-span-2">
        <div className="rounded-2xl border border-brand-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Project estimate</h2>
          <p className="mt-1 text-sm text-slate-500">Assign all {openings.length} added door opening{openings.length === 1 ? "" : "s"} to the selected project. Existing window and door lines stay together.</p>
          {project.status === "finalized" ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">This project is finalized and cannot accept new quote lines.</p> : null}
          <button type="button" className="mt-4 w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60" onClick={sendToProjectEstimate} disabled={handoffBusy || !openings.length || !result || project.status === "finalized"}>{handoffBusy ? "Assigning to project…" : "Assign to project"}</button>
          {handoffEstimateId ? <p className="mt-3 text-xs text-rose-700">The quote was assigned. <Link href={`/projects/${handoffEstimateId}`} className="font-semibold underline">Open project</Link> to resolve the pricing issue.</p> : null}
          {error && handoffEstimateId ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
          {error && !handoffEstimateId ? <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
        </div>
      </div>
      </div>
      <style jsx global>{`.input { width: 100%; border-radius: 0.5rem; border: 1px solid #e2e8f0; background: #fff; padding: 0.5rem 0.75rem; font-size: 0.875rem; color: #0f172a; }`}</style>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-slate-100 bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-semibold text-slate-900">{money(value)}</p></div>;
}
