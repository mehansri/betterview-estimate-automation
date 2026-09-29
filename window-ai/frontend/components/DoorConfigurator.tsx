"use client";

import { ReactNode, useMemo, useState } from "react";
import ConfiguratorShell, { ConfiguratorPrice } from "@/components/configurator/ConfiguratorShell";
import { ChipGroup, InchInput, OptionCard, SectionTitle, Stepper } from "@/components/configurator/parts";
import DoorDrawing, { finishHex } from "@/components/DoorDrawing";
import { useViewMode } from "@/lib/viewMode";
import {
  availableModels,
  configurationOf,
  customSizeProblem,
  defaultSidelite,
  designsFor,
  doorOffers,
  familyInfo,
  FINISH_LABELS,
  finishKey,
  firstIncomplete,
  frameDepths,
  GlassFamilyMap,
  heightInches,
  interiorTypes,
  isCutDown,
  materialOf,
  modelOf,
  normalizeSelection,
  PIPELINE_STEPS,
  PipelineCatalog,
  PipelineGlassChoice,
  PipelineSelection,
  PipelineSide,
  PipelineSideliteChoice,
  selectionSummary,
  sideliteModels,
  sideliteOffers,
  sills,
  stepComplete,
} from "@/lib/doorPipeline";

type Props = {
  catalog: PipelineCatalog;
  value: PipelineSelection;
  onChange: (next: PipelineSelection) => void;
  price: ConfiguratorPrice;
  location: string;
  onLocationChange: (value: string) => void;
  primaryAction?: { label: string; onClick: () => void; disabled?: boolean };
  editingLabel?: string | null;
};

const MATERIAL_TEXT = {
  steel: { title: "Steel", body: "Factory white or painted. Smooth vinyl composite frame.", accent: "from-slate-200 to-slate-400" },
  fiberglass: { title: "Fiberglass", body: "Painted or stained woodgrain skins. Textured composite frame.", accent: "from-amber-200 to-amber-500" },
} as const;

function Note({ tone = "slate", children }: { tone?: "slate" | "amber" | "brand" | "emerald"; children: ReactNode }) {
  const tones = {
    slate: "border-slate-200 bg-slate-50 text-slate-600",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    brand: "border-brand-200 bg-brand-50 text-brand-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
  };
  return <div className={`rounded-xl border px-3 py-2 text-xs ${tones[tone]}`}>{children}</div>;
}

/** Tiny schematic of a door configuration for the configuration cards. */
function LayoutGlyph({ doors, sidelites, transom }: { doors: number; sidelites: number; transom: boolean }) {
  const unit = 10;
  const side = 5;
  const w = doors * unit + sidelites * side + 2;
  const h = 22 + (transom ? 6 : 0);
  let x = 1;
  const rects: ReactNode[] = [];
  const top = transom ? 7 : 1;
  const add = (width: number, fill: string, key: string) => {
    rects.push(<rect key={key} x={x} y={top} width={width} height={20} fill={fill} stroke="#475569" strokeWidth={0.6} />);
    x += width;
  };
  if (sidelites) add(side, "#bae6fd", "s1");
  for (let i = 0; i < doors; i += 1) add(unit, "#e2e8f0", `d${i}`);
  if (sidelites === 2) add(side, "#bae6fd", "s2");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w * 2.2} height={h * 2.2} aria-hidden>
      {transom ? <rect x={1} y={1} width={w - 2} height={5} fill="#bae6fd" stroke="#475569" strokeWidth={0.6} /> : null}
      {rects}
    </svg>
  );
}

function ColourPicker({ presets, value, onChange, type }: { presets: string[]; value?: string; onChange: (colour: string) => void; type: string }) {
  const [custom, setCustom] = useState("");
  const current = (value || "").trim();
  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-2">
        {presets.map((name) => {
          const active = current.toLowerCase() === name.toLowerCase();
          return (
            <button key={name} type="button" onClick={() => onChange(name)} aria-pressed={active} className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold transition ${active ? "border-brand-500 bg-brand-50 text-brand-800 ring-2 ring-brand-100" : "border-slate-200 bg-white text-slate-600 hover:border-brand-300"}`}>
              <span className="h-4 w-4 rounded-full border border-slate-300" style={{ background: finishHex(type, name) }} />
              {name}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2">
        <input className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs" placeholder="Other colour (e.g. Benjamin Moore HC-154)" value={custom} onChange={(event) => setCustom(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && custom.trim()) onChange(custom.trim()); }} />
        <button type="button" className="rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40" disabled={!custom.trim()} onClick={() => onChange(custom.trim())}>Use</button>
      </div>
      {current && !presets.some((name) => name.toLowerCase() === current.toLowerCase()) ? <p className="mt-1 text-[11px] text-slate-500">Colour: <b>{current}</b></p> : null}
    </div>
  );
}

function GlassPicker({ catalog, sel, choice, offer, solidAllowed, onChange, label }: { catalog: PipelineCatalog; sel: PipelineSelection; choice: PipelineGlassChoice; offer: { glass: Record<string, GlassFamilyMap> } | null; solidAllowed: boolean; onChange: (next: PipelineGlassChoice) => void; label: string }) {
  const sizes = offer ? Object.keys(offer.glass).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : [];
  const families = choice.size && offer ? offer.glass[choice.size] || {} : {};
  const family = familyInfo(catalog, choice.family);
  const series = choice.size && choice.family ? families[choice.family] || [] : [];
  const designs = family?.flat_max ? designsFor(catalog, sel, series) : [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {solidAllowed ? (
          <OptionCard active={choice.glazed === false} onClick={() => onChange({ glazed: false })} className="p-3">
            <p className="text-sm font-semibold text-slate-900">Solid</p>
            <p className="text-[11px] text-slate-500">No glass in the {label.toLowerCase()}</p>
          </OptionCard>
        ) : null}
        {offer ? (
          <OptionCard active={choice.glazed === true} onClick={() => onChange({ glazed: true, size: sizes.length === 1 ? sizes[0] : choice.size })} className="p-3">
            <p className="text-sm font-semibold text-slate-900">Glazed</p>
            <p className="text-[11px] text-slate-500">{sizes.length} glass size{sizes.length === 1 ? "" : "s"} for this slab</p>
          </OptionCard>
        ) : null}
      </div>
      {choice.glazed ? (
        <>
          <div>
            <SectionTitle note="set by the slab">Glass size</SectionTitle>
            <ChipGroup options={sizes.map((size) => ({ id: size, label: size }))} value={choice.size || ""} onChange={(size) => onChange({ glazed: true, size, family: offer?.glass[size]?.[choice.family || ""] ? choice.family : undefined })} />
          </div>
          {choice.size ? (
            <div>
              <SectionTitle note="only glass offered in this size is shown">Glass</SectionTitle>
              <div className="grid gap-2 sm:grid-cols-2">
                {catalog.glass_families.filter((item) => families[item.key]).map((item) => (
                  <OptionCard key={item.key} active={choice.family === item.key} onClick={() => onChange({ glazed: true, size: choice.size, family: item.key, series: item.flat_max ? undefined : families[item.key][0] })} className="p-3">
                    <p className="pr-6 text-sm font-semibold text-slate-900">{item.label}</p>
                    <p className="text-[11px] text-slate-500">{item.hint}</p>
                  </OptionCard>
                ))}
              </div>
            </div>
          ) : null}
          {family && !family.flat_max && series.length > 1 ? (
            <div>
              <SectionTitle>{family.label} option</SectionTitle>
              <ChipGroup options={series.map((key) => ({ id: key, label: family.series.find((item) => item.key === key)?.label || key }))} value={choice.series || series[0]} onChange={(key) => onChange({ ...choice, series: key })} />
            </div>
          ) : null}
          {family?.flat_max ? (
            <div>
              <Note tone="brand">One flat price at the dearest decorative group offered in {choice.size} ({series.map((key) => key.replace("group_", "").toUpperCase()).join(", ")}) — the customer can change patterns without re-quoting.</Note>
              {designs.length ? (
                <label className="mt-3 block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Pattern (optional)</span>
                  <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={choice.design || ""} onChange={(event) => onChange({ ...choice, design: event.target.value || undefined })}>
                    <option value="">To be selected by the customer</option>
                    {designs.map((design) => <option key={design.name} value={design.name}>{design.name} · group {design.group}</option>)}
                  </select>
                </label>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default function DoorConfigurator({ catalog, value, onChange, price, location, onLocationChange, primaryAction, editingLabel }: Props) {
  // A new door starts at step 1; a saved one opens on its first incomplete step.
  const [step, setStep] = useState<string>(() => PIPELINE_STEPS[Math.min(firstIncomplete(catalog, value), PIPELINE_STEPS.length - 1)].id);
  const [cleared, setCleared] = useState<string[]>([]);
  const [modelFilter, setModelFilter] = useState("");
  const { internal } = useViewMode();

  const material = materialOf(catalog, value);
  const layout = configurationOf(catalog, value);
  const completed = stepComplete(catalog, value);
  const models = useMemo(() => availableModels(catalog, value), [catalog, value]);
  const model = modelOf(catalog, value);
  const offers = doorOffers(model, value);
  const finish = finishKey(value);

  /** Apply a change, then re-validate every downstream step. */
  function update(mutate: (draft: PipelineSelection) => void) {
    const draft = JSON.parse(JSON.stringify(value)) as PipelineSelection;
    mutate(draft);
    const result = normalizeSelection(catalog, draft);
    // Fill new sidelite slots with a sensible starting model.
    result.selection.glass.sidelites = result.selection.glass.sidelites.map((part) => (part.model ? part : { ...defaultSidelite(catalog, result.selection), ...part }));
    setCleared(result.cleared);
    // If the change reopened an earlier step, go back to it: later steps are locked until it is done.
    const open = firstIncomplete(catalog, result.selection);
    const current = PIPELINE_STEPS.findIndex((item) => item.id === step);
    if (open < current) setStep(PIPELINE_STEPS[open].id);
    onChange(result.selection);
  }

  function setSide(side: "exterior" | "interior", patch: PipelineSide) {
    update((draft) => {
      const current = draft.colours[side] || {};
      const typeChanged = patch.type && patch.type !== current.type;
      draft.colours[side] = { ...current, ...patch, ...(typeChanged ? { colour: patch.type === "white" ? undefined : current.colour } : {}) };
    });
  }

  const slabColour = finishHex(value.colours.exterior?.type, value.colours.exterior?.colour);
  const frameSide = value.colours.frame.mode === "split" ? value.colours.frame.exterior : value.colours.exterior;
  const frameColour = value.material === "steel" && value.colours.frame.mode === "match" && value.colours.exterior?.type !== "painted" ? "#f8fafc" : finishHex(frameSide?.type, frameSide?.colour);
  const modelLabel = model?.label || material?.models.find((item) => item.key === value.model)?.label || "";
  const sideliteGlass = (value.glass.sidelites || []).map((part) => (part.glazed ? { size: part.size, family: part.family } : null));
  const drawing = (
    <DoorDrawing
      doors={layout?.doors ?? 1}
      sidelites={layout?.sidelites ?? 0}
      transom={layout?.transom ?? false}
      width={value.custom_size.enabled && value.custom_size.width_in ? value.custom_size.width_in : value.width || 36}
      heightIn={value.custom_size.enabled && value.custom_size.height_in ? value.custom_size.height_in : heightInches(catalog, value.height)}
      heightLabel={value.height}
      model={modelLabel}
      doorGlass={value.glass.door.glazed ? { size: value.glass.door.size, family: value.glass.door.family } : null}
      sideliteGlass={sideliteGlass}
      transomGlass={value.glass.transom?.glass}
      slabColour={value.colours.exterior?.type ? slabColour : "#e2e8f0"}
      frameColour={frameColour}
      lock={value.standard.lock}
      size={330}
    />
  );

  const summary = selectionSummary(catalog, value);
  const firstOpen = completed.findIndex((done) => !done);

  return (
    <ConfiguratorShell
      eyebrow="Palma entrance door"
      title={editingLabel || "Configure the entrance door"}
      steps={PIPELINE_STEPS}
      step={step}
      onStep={setStep}
      noun="door opening"
      price={price}
      pricePlaceholder={firstOpen >= 0 ? `Complete step ${firstOpen + 1} (${PIPELINE_STEPS[firstOpen].label}) to price` : undefined}
      qty={1}
      location={location}
      onLocationChange={onLocationChange}
      primaryAction={primaryAction}
      completed={completed}
      preview={{
        heading: modelLabel ? `${modelLabel}${layout ? ` · ${layout.label}` : ""}` : material ? `${material.label} entrance door` : "Entrance door",
        subheading: summary.join(" · ") || "Start with the material",
        badge: finish ? FINISH_LABELS[finish] : material?.label,
        drawing,
        // The dealer discount is internal: never shown in the customer view.
        hint: internal ? `Palma list less ${Math.round((1 - catalog.discount) * 100)}% dealer discount, plus install and margin` : undefined,
        below: (
          <div className="mt-3 space-y-2">
            {cleared.length ? (
              <Note tone="amber">
                <p className="font-semibold">Updated to match your change — please re-check:</p>
                <ul className="mt-1 list-disc pl-4">{cleared.map((item) => <li key={item}>{item}</li>)}</ul>
              </Note>
            ) : null}
            {isCutDown(catalog, value) ? <Note tone="brand">Custom cut-down upcharge will be added (per door and sidelite panel cut).</Note> : null}
          </div>
        ),
      }}
    >
      {/* ------------------------------------------------ 1. Material */}
      {step === "material" ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {(["steel", "fiberglass"] as const).map((key) => (
              <OptionCard key={key} active={value.material === key} onClick={() => update((draft) => { if (draft.material !== key) { draft.material = key; draft.frame_type = catalog.materials[key].default_frame_type; } })} className="p-4">
                <span className={`mb-3 block h-16 w-12 rounded-md border border-slate-300 bg-gradient-to-br ${MATERIAL_TEXT[key].accent}`} />
                <p className="text-base font-semibold text-slate-900">{MATERIAL_TEXT[key].title}</p>
                <p className="mt-0.5 text-xs text-slate-500">{MATERIAL_TEXT[key].body}</p>
                <p className="mt-2 text-[11px] font-semibold text-slate-600">{catalog.materials[key].models.length} slab models</p>
              </OptionCard>
            ))}
          </div>
          {material ? (
            <div>
              <SectionTitle note="defaults from the material, editable">Frame type</SectionTitle>
              <ChipGroup options={catalog.frame_types.map((type) => ({ id: type.key, label: `${type.label}${type.key === material.default_frame_type ? " (default)" : ""}` }))} value={value.frame_type || material.default_frame_type} onChange={(frame_type) => update((draft) => { draft.frame_type = frame_type; })} />
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ------------------------------------------------ 2. Size */}
      {step === "size" ? (
        <div className="space-y-5">
          <div>
            <SectionTitle>Slab height</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              {catalog.heights.map((height) => (
                <OptionCard key={height.key} active={value.height === height.key} onClick={() => update((draft) => { draft.height = height.key; })} className="p-3">
                  <p className="text-lg font-semibold tabular-nums text-slate-900">{height.key}</p>
                  <p className="text-[11px] text-slate-500">{height.inches}" slab{height.inches > 80 ? " · limited models" : " · standard"}</p>
                </OptionCard>
              ))}
            </div>
          </div>
          <div>
            <SectionTitle note="model count for the chosen height">Slab width</SectionTitle>
            <div className="grid grid-cols-5 gap-2">
              {catalog.widths.map((width) => {
                const count = value.height ? availableModels(catalog, { ...value, width }).length : null;
                return (
                  <OptionCard key={width} active={value.width === width} onClick={() => update((draft) => { draft.width = width; })} className="p-3 text-center" disabled={count === 0}>
                    <p className="text-lg font-semibold tabular-nums text-slate-900">{width}"</p>
                    <p className="text-[10px] text-slate-500">{count == null ? (catalog.standard_widths.includes(width) ? "standard" : "limited") : `${count} model${count === 1 ? "" : "s"}`}</p>
                  </OptionCard>
                );
              })}
            </div>
          </div>
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <input type="checkbox" checked={value.custom_size.enabled} onChange={(event) => update((draft) => { draft.custom_size = event.target.checked ? { enabled: true, width_in: draft.width, height_in: heightInches(catalog, draft.height) } : { enabled: false }; })} />
              Custom size — cut down from the standard slab
            </label>
            <p className="mt-1 text-xs text-slate-500">Any size outside standard is cut from the next size up and flags the Palma cut-down upcharge.</p>
            {value.custom_size.enabled ? (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <InchInput label="Actual slab width" value={value.custom_size.width_in ?? ""} onChange={(width_in) => update((draft) => { draft.custom_size.width_in = width_in === "" ? undefined : Number(width_in); })} />
                <InchInput label="Actual slab height" value={value.custom_size.height_in ?? ""} onChange={(height_in) => update((draft) => { draft.custom_size.height_in = height_in === "" ? undefined : Number(height_in); })} />
              </div>
            ) : null}
            {customSizeProblem(catalog, value) ? <p className="mt-2 text-xs font-semibold text-rose-700">{customSizeProblem(catalog, value)}</p> : null}
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------------ 3. Configuration */}
      {step === "configuration" ? (
        <div className="space-y-5">
          <div>
            <SectionTitle>Door configuration</SectionTitle>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {catalog.configurations.map((item) => (
                <OptionCard key={item.key} active={value.configuration === item.key} onClick={() => update((draft) => { draft.configuration = item.key; })} className="flex flex-col items-center gap-2 p-3">
                  <LayoutGlyph doors={item.doors} sidelites={item.sidelites} transom={item.transom} />
                  <p className="text-center text-xs font-semibold text-slate-800">{item.label}</p>
                </OptionCard>
              ))}
            </div>
          </div>
          <div>
            <SectionTitle note={value.frame_type === "textured" ? "5-5/8\" jambs are smooth only" : undefined}>Frame depth</SectionTitle>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {frameDepths(catalog, value).map((depth) => (
                <OptionCard key={depth.key} active={value.frame_depth === depth.key} onClick={() => update((draft) => { draft.frame_depth = depth.key; })} className="p-3">
                  <p className="text-lg font-semibold tabular-nums text-slate-900">{depth.label}</p>
                  <p className="text-[11px] text-slate-500">{depth.standard ? "Standard jamb" : "Jamb upcharge"}</p>
                </OptionCard>
              ))}
            </div>
          </div>
          {layout ? <Note>{layout.sidelites ? `Glass is chosen for ${layout.sidelites === 1 ? "the sidelite" : "each sidelite"}` : "No sidelites"}{layout.transom ? " and the transom" : ""} in step 6.{layout.doors === 2 ? " Double doors add the astragal mortise lock to the extras." : ""}</Note> : null}
        </div>
      ) : null}

      {/* ------------------------------------------------ 4. Slab model */}
      {step === "model" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500"><b className="text-slate-800">{models.length}</b> {material?.label.toLowerCase()} models built {value.width}" x {value.height}</p>
            {models.length > 8 ? <input className="w-48 rounded-lg border border-slate-300 px-3 py-1.5 text-xs" placeholder="Filter models…" value={modelFilter} onChange={(event) => setModelFilter(event.target.value)} /> : null}
          </div>
          <div className="grid max-h-[32rem] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
            {models.filter((item) => item.label.toLowerCase().includes(modelFilter.toLowerCase())).map((item) => {
              const itemOffers = doorOffers(item, value);
              const sizes = itemOffers.glazed ? Object.keys(itemOffers.glazed.glass).length : 0;
              return (
                <OptionCard key={item.key} active={value.model === item.key} onClick={() => update((draft) => { draft.model = item.key; })} className="flex flex-col items-center p-2.5">
                  <DoorDrawing doors={1} sidelites={0} transom={false} width={value.width || 36} heightIn={heightInches(catalog, value.height)} model={item.label} doorGlass={!itemOffers.solid && itemOffers.glazed ? { size: Object.keys(itemOffers.glazed.glass)[0], family: "clear" } : null} slabColour={value.material === "fiberglass" ? "#c8a165" : "#f1f5f9"} frameColour="#f8fafc" size={90} showDimensions={false} />
                  <p className="mt-1 text-center text-xs font-semibold text-slate-900">{item.label}</p>
                  <p className="text-center text-[10px] text-slate-500">{[itemOffers.solid ? "Solid" : null, sizes ? `${sizes} glass size${sizes === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ")}</p>
                </OptionCard>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------------ 5. Colours */}
      {step === "colours" && material ? (
        <div className="space-y-5">
          {(["exterior", "interior"] as const).map((side) => {
            const types = side === "exterior" ? material.side_types : interiorTypes(catalog, value, value.colours.exterior?.type);
            const current = value.colours[side];
            return (
              <div key={side} className="rounded-2xl border border-slate-200 bg-white p-4">
                <SectionTitle>{side === "exterior" ? "Exterior finish" : "Interior finish"}</SectionTitle>
                <ChipGroup options={types.map((type) => ({ id: type.key, label: type.label }))} value={current?.type || ""} onChange={(type) => setSide(side, { type })} />
                {current?.type && current.type !== "white" ? (
                  <ColourPicker type={current.type} presets={current.type === "stained" ? catalog.stain_presets : catalog.paint_presets} value={current.colour} onChange={(colour) => setSide(side, { colour })} />
                ) : null}
                {side === "interior" && material.key === "fiberglass" && value.colours.exterior?.type === "painted" ? <p className="mt-2 text-[11px] text-slate-500">A painted exterior is painted inside too — Palma offers stained outside / painted inside, not the reverse.</p> : null}
              </div>
            );
          })}
          {finish ? <Note tone="emerald">Priced as <b>{FINISH_LABELS[finish]}</b>{/2c|out_paint/.test(finish) ? " — two colours" : ""}. Name colours to split 1 vs 2 colour pricing.</Note> : null}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <SectionTitle note="Palma prices frame & brickmould finishing per door or sidelite">Frame colour</SectionTitle>
            <ChipGroup options={[{ id: "match", label: "Match the slab" }, { id: "split", label: "Split — different frame colour" }]} value={value.colours.frame.mode} onChange={(mode) => update((draft) => { draft.colours.frame = mode === "match" ? { mode } : { mode, exterior: { type: material.key === "steel" ? "white" : "painted" }, interior: { type: material.key === "steel" ? "white" : "painted" } }; })} />
            {value.colours.frame.mode === "split" ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {(["exterior", "interior"] as const).map((side) => {
                  const current = value.colours.frame[side];
                  const types = material.key === "steel" ? [{ key: "white", label: "White" }, { key: "painted", label: "Painted" }] : material.side_types;
                  return (
                    <div key={side}>
                      <p className="mb-1 text-[11px] font-semibold uppercase text-slate-500">Frame {side}</p>
                      <ChipGroup options={types.map((type) => ({ id: type.key, label: type.label }))} value={current?.type || ""} onChange={(type) => update((draft) => { draft.colours.frame[side] = { type }; })} />
                      {current?.type && current.type !== "white" ? <ColourPicker type={current.type} presets={current.type === "stained" ? catalog.stain_presets : catalog.paint_presets} value={current.colour} onChange={(colour) => update((draft) => { draft.colours.frame[side] = { ...draft.colours.frame[side], colour }; })} /> : null}
                    </div>
                  );
                })}
                <p className="text-[11px] text-slate-500 sm:col-span-2">A painted or stained frame adds Palma&apos;s frame &amp; brickmould finishing line for each door and sidelite.</p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------------ 6. Glass */}
      {step === "glass" && model ? (
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="mb-3 text-sm font-semibold text-slate-900">{layout?.doors === 2 ? "Door slabs (both leaves)" : "Door slab"} — {model.label}</p>
            <GlassPicker catalog={catalog} sel={value} choice={value.glass.door} offer={offers.glazed} solidAllowed={offers.solid} label="Door" onChange={(next) => update((draft) => { draft.glass.door = next; })} />
          </div>
          {value.glass.sidelites.map((part, index) => {
            const choices = sideliteModels(catalog, value);
            const sidelite = choices.find((item) => item.key === part.model);
            const sideOffers = sideliteOffers(sidelite, value.height);
            const setPart = (next: PipelineSideliteChoice) => update((draft) => { draft.glass.sidelites[index] = next; });
            const doorFamily = value.glass.door.glazed ? value.glass.door.family : undefined;
            const matchSize = doorFamily && sideOffers.glazed ? Object.keys(sideOffers.glazed.glass).find((size) => sideOffers.glazed!.glass[size][doorFamily]) : undefined;
            return (
              <div key={index} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{value.glass.sidelites.length > 1 ? `Sidelite ${index + 1}` : "Sidelite"}</p>
                  <div className="flex gap-2">
                    {matchSize ? <button type="button" className="rounded-lg border border-brand-200 px-2.5 py-1 text-[11px] font-semibold text-brand-700 hover:bg-brand-50" onClick={() => setPart({ model: part.model, glazed: true, size: matchSize, family: doorFamily, series: sideOffers.glazed!.glass[matchSize][doorFamily!][0] })}>Match door glass</button> : null}
                    {index > 0 ? <button type="button" className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setPart(JSON.parse(JSON.stringify(value.glass.sidelites[0])))}>Same as sidelite 1</button> : null}
                  </div>
                </div>
                <SectionTitle>Sidelite style</SectionTitle>
                <ChipGroup options={choices.map((item) => ({ id: item.key, label: item.label }))} value={part.model || ""} onChange={(model) => setPart({ model })} />
                {sidelite ? (
                  <div className="mt-4">
                    {sideOffers.solid && part.glazed === false ? (
                      <div className="mb-3"><ChipGroup label="Panel" options={sideOffers.solid.panels.map((panel) => ({ id: panel, label: panel }))} value={part.panel || sideOffers.solid.panels[0]} onChange={(panel) => setPart({ ...part, panel })} /></div>
                    ) : null}
                    <GlassPicker catalog={catalog} sel={value} choice={part} offer={sideOffers.glazed} solidAllowed={Boolean(sideOffers.solid)} label="Sidelite" onChange={(next) => setPart({ ...next, model: part.model, panel: next.glazed === false ? sideOffers.solid?.panels[0] : undefined })} />
                  </div>
                ) : null}
              </div>
            );
          })}
          {layout?.transom && value.glass.transom ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="mb-3 text-sm font-semibold text-slate-900">Transom</p>
              <SectionTitle note="priced per sq. ft., Palma minimum applies">Transom glass</SectionTitle>
              <div className="grid gap-2 sm:grid-cols-3">
                {catalog.transom_glass.map((item) => (
                  <OptionCard key={item.key} active={value.glass.transom?.glass === item.key} onClick={() => update((draft) => { draft.glass.transom = { ...draft.glass.transom!, glass: item.key }; })} className="p-2.5">
                    <p className="pr-6 text-xs font-semibold text-slate-900">{item.label}</p>
                  </OptionCard>
                ))}
              </div>
              <div className="mt-4 grid items-end gap-3 sm:grid-cols-3">
                <ChipGroup label="Shape" options={[{ id: "rectangle", label: "Rectangular" }, { id: "shapes", label: "Shaped" }]} value={value.glass.transom.shape} onChange={(shape) => update((draft) => { draft.glass.transom = { ...draft.glass.transom!, shape }; })} />
                <InchInput label="Glass height" value={value.glass.transom.height_in ?? catalog.default_transom_height} onChange={(height) => update((draft) => { draft.glass.transom = { ...draft.glass.transom!, height_in: height === "" ? undefined : Number(height) }; })} />
                <label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={value.glass.transom.tempered} onChange={(event) => update((draft) => { draft.glass.transom = { ...draft.glass.transom!, tempered: event.target.checked }; })} />Tempered glass</label>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ------------------------------------------------ 7. Standard options */}
      {step === "standard" && material ? (
        <div className="space-y-5">
          <div className={`rounded-2xl border p-4 ${value.standard.lock ? "border-slate-200 bg-white" : "border-amber-300 bg-amber-50/60"}`}>
            <SectionTitle note="required">Lock prep</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              <OptionCard active={value.standard.lock === "double_bore"} onClick={() => update((draft) => { draft.standard.lock = "double_bore"; })} className="p-3">
                <p className="text-sm font-semibold text-slate-900">Double-bore prep</p>
                <p className="text-[11px] text-slate-500">Deadbolt + handleset holes; hardware by others</p>
              </OptionCard>
              <OptionCard active={value.standard.lock === "multipoint"} onClick={() => update((draft) => { draft.standard.lock = "multipoint"; })} className="p-3">
                <p className="text-sm font-semibold text-slate-900">Multipoint lock</p>
                <p className="text-[11px] text-slate-500">FERCO multipoint with handle set{layout?.doors === 2 ? "; dummy on the inactive leaf" : ""}</p>
              </OptionCard>
            </div>
            {value.standard.lock === "multipoint" ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {material.handles.map((handle) => (
                  <OptionCard key={handle.item} active={value.standard.handle === handle.item} onClick={() => update((draft) => { draft.standard.handle = handle.item; })} className="p-2.5">
                    <p className="pr-6 text-xs font-semibold text-slate-900">{handle.label}</p>
                  </OptionCard>
                ))}
              </div>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <SectionTitle note="included by default">Brickmould</SectionTitle>
              <ChipGroup options={[{ id: "regular", label: 'Standard 2"' }, { id: "flat", label: 'Flat 1-1/2"' }, { id: "none", label: "None" }]} value={value.standard.brickmould} onChange={(brickmould) => update((draft) => { draft.standard.brickmould = brickmould; })} />
              <p className="mt-2 text-[11px] text-slate-500">Finish follows the door; 101" lengths with a transom or 8' door.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <SectionTitle>Hinges</SectionTitle>
              <ChipGroup options={[{ id: "black", label: "Black heavy-duty (default)" }, { id: "standard", label: "Standard" }]} value={value.standard.hinges} onChange={(hinges) => update((draft) => { draft.standard.hinges = hinges; })} />
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <SectionTitle note="filtered by frame depth">Sill</SectionTitle>
            <div className="grid gap-2 sm:grid-cols-3">
              {sills(catalog, value).map((sill) => (
                <OptionCard key={sill.key} active={value.standard.sill === sill.key} onClick={() => update((draft) => { draft.standard.sill = sill.key; })} className="p-2.5">
                  <p className="pr-6 text-xs font-semibold text-slate-900">{sill.label}{sill.key === "black_anodized" ? " (default)" : ""}</p>
                </OptionCard>
              ))}
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={value.standard.sill_extension} onChange={(event) => update((draft) => { draft.standard.sill_extension = event.target.checked; })} />3"–4" sill extension</label>
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------------ 8. Extras */}
      {step === "extras" && material ? (
        <div className="space-y-4">
          {value.standard.lock === "multipoint" ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-900"><input type="checkbox" checked={value.extras.tedee} onChange={(event) => update((draft) => { draft.extras.tedee = event.target.checked; if (!event.target.checked) Object.assign(draft.extras, { tedee_keypad: false, tedee_bridge: false, tedee_sensor: false }); })} />Tedee smart lock integration</label>
              <p className="ml-6 text-[11px] text-slate-500">Tedee-PRO on the FERCO multipoint</p>
              {value.extras.tedee ? (
                <div className="ml-6 mt-2 flex flex-wrap gap-4 text-xs text-slate-700">
                  {([["tedee_keypad", "Biometric keypad"], ["tedee_bridge", "WiFi bridge"], ["tedee_sensor", "Door sensor"]] as const).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={value.extras[key]} onChange={(event) => update((draft) => { draft.extras[key] = event.target.checked; })} />{label}</label>
                  ))}
                </div>
              ) : null}
            </div>
          ) : <Note>Tedee smart lock integration is offered with the multipoint lock (step 7).</Note>}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <SectionTitle note={value.height === "8'0\"" ? "8' screen" : undefined}>Retractable sliding screen</SectionTitle>
            <div className="flex flex-wrap items-center gap-4">
              <ChipGroup options={[{ id: "none", label: "None" }, { id: "white", label: "White" }, { id: "painted", label: "Painted" }]} value={value.extras.screen} onChange={(screen) => update((draft) => { draft.extras.screen = screen; })} />
              {value.extras.screen !== "none" ? <Stepper label="Screens" value={value.extras.screen_qty} onChange={(screen_qty) => update((draft) => { draft.extras.screen_qty = screen_qty; })} min={1} max={4} /> : null}
            </div>
          </div>
          {layout?.doors === 2 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-900"><input type="checkbox" checked={value.extras.astragal_lock} onChange={(event) => update((draft) => { draft.extras.astragal_lock = event.target.checked; })} />Astragal mortise lock</label>
              <p className="ml-6 text-[11px] text-slate-500">FERCO mortise astragal lock for the inactive leaf</p>
            </div>
          ) : null}
          <div className={`rounded-2xl border p-4 ${isCutDown(catalog, value) ? "border-brand-200 bg-brand-50/60" : "border-slate-200 bg-white"}`}>
            <p className="text-sm font-semibold text-slate-900">Custom cut-down height</p>
            <p className="text-[11px] text-slate-600">{isCutDown(catalog, value) ? "Flagged from step 2 — the cut-down upcharge is on this quote." : "Not needed — standard size. Turn on a custom size in step 2 to flag it."}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-900"><input type="checkbox" checked={value.extras.fire_rated} onChange={(event) => update((draft) => { draft.extras.fire_rated = event.target.checked; if (event.target.checked && draft.extras.fire_rated_list == null && catalog.fire_rated_list) draft.extras.fire_rated_list = catalog.fire_rated_list; })} />Fire-rated panel</label>
            {value.extras.fire_rated ? (
              <div className="ml-6 mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-700">
                <span>List price per slab $</span>
                <input className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-sm tabular-nums" inputMode="decimal" value={value.extras.fire_rated_list ?? ""} onChange={(event) => update((draft) => { const number = Number(event.target.value); draft.extras.fire_rated_list = event.target.value === "" || !Number.isFinite(number) ? undefined : number; })} />
                <span className="text-[11px] text-amber-700">Not in the Palma book — confirm with Palma.</span>
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-700">
            <label className="flex items-center gap-2"><input type="checkbox" checked={value.extras.mail_slot} onChange={(event) => update((draft) => { draft.extras.mail_slot = event.target.checked; })} />Mail slot</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={value.extras.peep_viewer} onChange={(event) => update((draft) => { draft.extras.peep_viewer = event.target.checked; })} />Peep viewer</label>
          </div>
        </div>
      ) : null}
    </ConfiguratorShell>
  );
}
