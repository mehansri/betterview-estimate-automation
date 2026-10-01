"use client";

import { ReactNode, useMemo, useState } from "react";
import ConfiguratorShell, { ConfiguratorPrice } from "@/components/configurator/ConfiguratorShell";
import { ChipGroup, InchInput, OptionCard, SectionTitle, Stepper } from "@/components/configurator/parts";
import DoorDrawing, { finishHex } from "@/components/DoorDrawing";
import { useViewMode } from "@/lib/viewMode";
import { isCustomColour, PALMA_PAINTS, PALMA_STAINS, standardColourName } from "@/lib/palmaColours";
import {
  accentsFor,
  availableModels,
  configurationOf,
  configurationOffered,
  customColours,
  customSizeProblem,
  DEFAULT_PULL_BAR,
  defaultSidelite,
  designsFor,
  doorOffers,
  familyInfo,
  FINISH_LABELS,
  finishKey,
  firstIncomplete,
  framedLites,
  frameDepths,
  GlassFamilyMap,
  handleOf,
  heightInches,
  interiorTypes,
  isCutDown,
  materialOf,
  modelOf,
  multipointRequired,
  normalizeSelection,
  patternsFor,
  PIPELINE_STEPS,
  PipelineCatalog,
  PipelineGlassChoice,
  PipelineSelection,
  PipelineSide,
  PipelineSideliteChoice,
  pullBarLengths,
  reededAccentAllowed,
  retractableScreenAllowed,
  selectionSummary,
  sideliteModels,
  sideliteOffers,
  sideTypes,
  sills,
  stepComplete,
  tedeeAllowed,
  verticalAccentAllowed,
  widthsFor,
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

const BRICKMOULDS = [
  { key: "regular", label: 'Standard 2"' },
  { key: "flat", label: 'Flat 1-1/2"' },
  { key: "none", label: "None" },
  { key: "custom_pvc", label: 'Custom PVC, up to 6"' },
  { key: "custom_textured", label: 'Custom textured, up to 4-1/2"' },
];
const HINGES = [
  { key: "black", label: "Matte black heavy-duty (default)" },
  { key: "satin_nickel", label: "Satin nickel heavy-duty" },
  { key: "standard", label: "Standard" },
];

function Note({ tone = "slate", children }: { tone?: "slate" | "amber" | "brand" | "emerald"; children: ReactNode }) {
  const tones = {
    slate: "border-slate-200 bg-slate-50 text-slate-600",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    brand: "border-brand-200 bg-brand-50 text-brand-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
  };
  return <div className={`rounded-xl border px-3 py-2 text-xs ${tones[tone]}`}>{children}</div>;
}

function Check({ checked, onChange, children, hint }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-900"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{children}</label>
      {hint ? <p className="ml-6 text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
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

/** Palma's standard colours as swatches, plus a free-text custom colour (priced as a colour match). */
function ColourPicker({ value, onChange, type }: { value?: string; onChange: (colour: string) => void; type: string }) {
  const [custom, setCustom] = useState("");
  const [filter, setFilter] = useState("");
  const current = (value || "").trim();
  const standard = standardColourName(type, current);
  const swatches = type === "stained" ? PALMA_STAINS.map((stain) => ({ name: stain.name, code: "" })) : PALMA_PAINTS.map((paint) => ({ name: paint.name, code: paint.code }));
  const shown = swatches.filter((swatch) => `${swatch.code} ${swatch.name}`.toLowerCase().includes(filter.trim().toLowerCase()));
  return (
    <div className="mt-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[11px] text-slate-500">Palma standard {type === "stained" ? "stains" : "paint colours"} ({swatches.length})</p>
        {swatches.length > 20 ? <input className="w-40 rounded-lg border border-slate-300 px-2 py-1 text-xs" placeholder="Find colour or code…" value={filter} onChange={(event) => setFilter(event.target.value)} /> : null}
      </div>
      <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto pr-1">
        {shown.map((swatch) => {
          const active = standard === swatch.name;
          return (
            <button key={swatch.name} type="button" onClick={() => onChange(swatch.name)} aria-pressed={active} title={swatch.code || undefined} className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold transition ${active ? "border-brand-500 bg-brand-50 text-brand-800 ring-2 ring-brand-100" : "border-slate-200 bg-white text-slate-600 hover:border-brand-300"}`}>
              <span className="h-4 w-4 rounded-full border border-slate-300" style={{ background: finishHex(type, swatch.name) }} />
              {swatch.name}{swatch.code ? <span className="font-normal text-slate-400">{swatch.code.replace("G-", "")}</span> : null}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2">
        <input className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs" placeholder="Custom colour (e.g. Benjamin Moore HC-154)" value={custom} onChange={(event) => setCustom(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && custom.trim()) onChange(custom.trim()); }} />
        <button type="button" className="rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40" disabled={!custom.trim()} onClick={() => onChange(custom.trim())}>Use</button>
      </div>
      {current && isCustomColour(type, current) ? (
        <p className="mt-1 text-[11px] text-amber-800">Custom colour <b>{current}</b>: not on Palma&apos;s list, so Palma&apos;s custom colour match upcharge applies and a physical colour chip is needed (about 2 weeks extra).</p>
      ) : null}
    </div>
  );
}

function GlassPicker({ catalog, sel, choice, offer, solidAllowed, onChange, label }: { catalog: PipelineCatalog; sel: PipelineSelection; choice: PipelineGlassChoice; offer: { glass: Record<string, GlassFamilyMap> } | null; solidAllowed: boolean; onChange: (next: PipelineGlassChoice) => void; label: string }) {
  const sizes = offer ? Object.keys(offer.glass).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : [];
  const families = choice.size && offer ? offer.glass[choice.size] || {} : {};
  const family = familyInfo(catalog, choice.family);
  const series = choice.size && choice.family ? families[choice.family] || [] : [];
  const designs = family?.flat_max ? designsFor(catalog, sel, series) : [];
  const patterns = patternsFor(catalog, { ...choice, series: choice.series || series[0] });
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
              <SectionTitle>{family.key === "vented" ? "Vented unit" : `${family.label} option`}</SectionTitle>
              <ChipGroup options={series.map((key) => ({ id: key, label: family.series.find((item) => item.key === key)?.label || key }))} value={choice.series || series[0]} onChange={(key) => onChange({ ...choice, series: key, design: undefined })} />
            </div>
          ) : null}
          {family?.per_square ? (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">SDL squares per lite</span>
              <input className="w-24 rounded-lg border border-slate-300 px-3 py-1.5 text-sm tabular-nums" type="number" min={1} step={1} value={choice.squares ?? ""} onChange={(event) => { const squares = Math.round(Number(event.target.value)); onChange({ ...choice, squares: event.target.value === "" || !Number.isFinite(squares) || squares < 1 ? undefined : squares }); }} />
              <span className="mt-1 block text-[11px] text-slate-500">Palma charges per SDL square on top of the glass price — count the squares on the lite.</span>
            </label>
          ) : null}
          {patterns.length ? (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Pattern (optional, same price)</span>
              <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={choice.design || ""} onChange={(event) => onChange({ ...choice, design: event.target.value || undefined })}>
                <option value="">To be selected by the customer</option>
                {patterns.map((pattern) => <option key={pattern} value={pattern}>{pattern}</option>)}
              </select>
            </label>
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
          {family?.key === "specialty" && (choice.series || series[0]) === "special_order" ? <Note tone="amber">Palma orders special-order doorlites and sidelites together and prices both as special order — choose special-order for decorative sidelites too.</Note> : null}
          {family?.key === "executive" ? <Note tone="amber">Executive panel layouts are priced as printed (ST p37); confirm the layout letters and glass with Palma.</Note> : null}
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
  const mustMultipoint = multipointRequired(catalog, value);
  const extrasInfo = material?.extras;

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
      pullBarIn={value.standard.lock === "pull_bar" ? value.standard.pull_bar?.length_in ?? 36 : undefined}
      size={330}
    />
  );

  const summary = selectionSummary(catalog, value);
  const firstOpen = completed.findIndex((done) => !done);
  const customs = customColours(value);
  const handle = handleOf(catalog, value);
  const pullBar = { ...DEFAULT_PULL_BAR, ...value.standard.pull_bar };
  const accents = accentsFor(catalog, value);
  const lites = framedLites(catalog, value);

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
            {customs.length ? <Note tone="amber">Custom colour match for {customs.join(", ")} — Palma needs a colour chip.</Note> : null}
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
            <div className="grid grid-cols-3 gap-2">
              {catalog.heights.map((height) => {
                const count = value.width ? availableModels(catalog, { ...value, height: height.key }).length : null;
                return (
                  <OptionCard key={height.key} active={value.height === height.key} onClick={() => update((draft) => { draft.height = height.key; })} className="p-3" disabled={count === 0}>
                    <p className="text-lg font-semibold tabular-nums text-slate-900">{height.key}</p>
                    <p className="text-[11px] text-slate-500">{height.inches}" slab · {count == null ? (height.inches > 80 ? "limited models" : "standard") : `${count} model${count === 1 ? "" : "s"}`}</p>
                  </OptionCard>
                );
              })}
            </div>
          </div>
          <div>
            <SectionTitle note="model count for the chosen height">Slab width</SectionTitle>
            <div className="grid grid-cols-5 gap-2">
              {widthsFor(catalog, value).map((width) => {
                const count = value.height ? availableModels(catalog, { ...value, width }).length : null;
                return (
                  <OptionCard key={width} active={value.width === width} onClick={() => update((draft) => { draft.width = width; })} className="p-3 text-center" disabled={count === 0}>
                    <p className="text-lg font-semibold tabular-nums text-slate-900">{width}"</p>
                    <p className="text-[10px] text-slate-500">{count == null ? (catalog.standard_widths.includes(width) ? "standard" : "limited") : `${count} model${count === 1 ? "" : "s"}`}</p>
                  </OptionCard>
                );
              })}
            </div>
            {value.material === "steel" ? <p className="mt-2 text-[11px] text-slate-500">24"–28" and 38"–42" steel slabs are flush only, with Palma&apos;s non-standard panel upcharge.</p> : null}
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
                <OptionCard key={item.key} active={value.configuration === item.key} onClick={() => update((draft) => { draft.configuration = item.key; })} className="flex flex-col items-center gap-2 p-3" disabled={!configurationOffered(catalog, value, item)}>
                  <LayoutGlyph doors={item.doors} sidelites={item.sidelites} transom={item.transom} />
                  <p className="text-center text-xs font-semibold text-slate-800">{item.label}</p>
                </OptionCard>
              ))}
            </div>
            {catalog.configurations.some((item) => !configurationOffered(catalog, value, item)) ? <p className="mt-2 text-[11px] text-slate-500">No {material?.label.toLowerCase()} sidelites are made at {value.height}.</p> : null}
          </div>
          <div>
            <SectionTitle note={value.frame_type === "textured" ? "5-1/4\" and 5-5/8\" jambs are smooth only" : undefined}>Frame depth</SectionTitle>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {frameDepths(catalog, value).map((depth) => (
                <OptionCard key={depth.key} active={value.frame_depth === depth.key} onClick={() => update((draft) => { draft.frame_depth = depth.key; })} className="p-3">
                  <p className="text-lg font-semibold tabular-nums text-slate-900">{depth.label}</p>
                  <p className="text-[11px] text-slate-500">{depth.standard ? "Standard jamb" : "Jamb upcharge"}{depth.key === "7.25" ? " · for retractable screens / outswing" : ""}</p>
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
                  <DoorDrawing doors={1} sidelites={0} transom={false} width={value.width || 36} heightIn={heightInches(catalog, value.height)} model={item.label} doorGlass={!itemOffers.solid && itemOffers.glazed ? { size: Object.keys(itemOffers.glazed.glass)[0], family: "clear" } : null} slabColour={value.material === "fiberglass" && !item.smooth ? "#c8a165" : "#f1f5f9"} frameColour="#f8fafc" size={90} showDimensions={false} />
                  <p className="mt-1 text-center text-xs font-semibold text-slate-900">{item.label}</p>
                  <p className="text-center text-[10px] text-slate-500">{[itemOffers.solid ? "Solid" : null, sizes ? `${sizes} glass size${sizes === 1 ? "" : "s"}` : null, item.smooth ? "smooth skin" : null].filter(Boolean).join(" · ")}</p>
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
            const types = side === "exterior" ? sideTypes(catalog, value) : interiorTypes(catalog, value, value.colours.exterior?.type);
            const current = value.colours[side];
            return (
              <div key={side} className="rounded-2xl border border-slate-200 bg-white p-4">
                <SectionTitle>{side === "exterior" ? "Exterior finish" : "Interior finish"}</SectionTitle>
                <ChipGroup options={types.map((type) => ({ id: type.key, label: type.label }))} value={current?.type || ""} onChange={(type) => setSide(side, { type })} />
                {current?.type && current.type !== "white" ? (
                  <ColourPicker type={current.type} value={current.colour} onChange={(colour) => setSide(side, { colour })} />
                ) : null}
                {side === "interior" && material.key === "fiberglass" && value.colours.exterior?.type === "painted" ? <p className="mt-2 text-[11px] text-slate-500">A painted exterior is painted inside too — Palma offers stained outside / painted inside, not the reverse.</p> : null}
                {side === "exterior" && model?.smooth ? <p className="mt-2 text-[11px] text-slate-500">{model.label} is a smooth skin: Palma&apos;s stains are for woodgrain fiberglass, so it is paint only.</p> : null}
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
                      {current?.type && current.type !== "white" ? <ColourPicker type={current.type} value={current.colour} onChange={(colour) => update((draft) => { draft.colours.frame[side] = { ...draft.colours.frame[side], colour }; })} /> : null}
                    </div>
                  );
                })}
                <p className="text-[11px] text-slate-500 sm:col-span-2">{material.key === "steel" ? "A painted frame adds Palma's frame & brickmould paint line for each door and panel sidelite (direct-set sidelites include it)." : "A painted or stained frame adds Palma's frame & brickmould finishing line for each door and sidelite."}</p>
              </div>
            ) : null}
            {material.key === "steel" && value.colours.frame.mode === "match" && [value.colours.exterior?.type, value.colours.interior?.type].includes("painted") ? (
              <p className="mt-2 text-[11px] text-slate-500">The frame is painted to match, so Palma&apos;s frame &amp; brickmould paint line is added for each door and panel sidelite (direct-set sidelites include it).</p>
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
            {value.height && value.height !== "6'8\"" && value.glass.door.glazed ? <p className="mt-3 text-[11px] text-slate-500">{value.height} glazed doors are priced as the 6&apos;8&quot; glass row plus Palma&apos;s {value.height} system charge.</p> : null}
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
                    {matchSize ? <button type="button" className="rounded-lg border border-brand-200 px-2.5 py-1 text-[11px] font-semibold text-brand-700 hover:bg-brand-50" onClick={() => setPart({ model: part.model, glazed: true, size: matchSize, family: doorFamily, series: sideOffers.glazed!.glass[matchSize][doorFamily!][0], squares: value.glass.door.squares })}>Match door glass</button> : null}
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
                    {sidelite.direct_glazed && value.material === "steel" ? (
                      <div className="mb-3"><Note tone="brand">Pick the size by the sidelite&apos;s <b>overall width</b> (frame width minus slab width), not the glass width — e.g. a 69&quot; frame with a 42&quot; slab is &quot;up to 27.5&quot;&quot;.</Note></div>
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
              {value.glass.transom.glass && /grills|sdls/.test(value.glass.transom.glass) ? <p className="mt-2 text-[11px] text-amber-800">Palma adds an unprinted per-box charge for transom grilles/SDLs — get it from Palma.</p> : null}
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
            <div className="grid gap-2 sm:grid-cols-3">
              <OptionCard active={value.standard.lock === "double_bore"} onClick={() => update((draft) => { draft.standard.lock = "double_bore"; })} className="p-3" disabled={mustMultipoint && value.standard.lock !== "double_bore"}>
                <p className="text-sm font-semibold text-slate-900">Double-bore prep</p>
                <p className="text-[11px] text-slate-500">{mustMultipoint ? "Not for this door — see below" : "Deadbolt + handleset holes; hardware by others"}</p>
              </OptionCard>
              <OptionCard active={value.standard.lock === "multipoint"} onClick={() => update((draft) => { draft.standard.lock = "multipoint"; })} className="p-3">
                <p className="text-sm font-semibold text-slate-900">Multipoint lock</p>
                <p className="text-[11px] text-slate-500">FERCO multipoint with handle set{layout?.doors === 2 ? "; dummy on the inactive leaf" : ""}</p>
              </OptionCard>
              <OptionCard active={value.standard.lock === "pull_bar"} onClick={() => update((draft) => { draft.standard.lock = "pull_bar"; draft.standard.pull_bar = { ...DEFAULT_PULL_BAR, block: "with_multipoint_lock_and_t_bar_handle", ...draft.standard.pull_bar }; })} className="p-3">
                <p className="text-sm font-semibold text-slate-900">Pull bar</p>
                <p className="text-[11px] text-slate-500">Replaces the handle set, with its lock hardware{layout?.doors === 2 ? "; dummy bar on the inactive leaf" : ""}</p>
              </OptionCard>
            </div>
            {mustMultipoint ? <p className="mt-2 text-[11px] text-amber-800">Palma: &quot;Multipoint locks are necessary for all fiberglass doors and all 8&apos; doors&quot;.{value.standard.lock === "double_bore" ? " This saved door has double-bore prep — confirm with Palma or switch to multipoint." : ""}</p> : null}
            {value.standard.lock === "multipoint" ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {material.handles.map((item) => (
                  <OptionCard key={item.item} active={value.standard.handle === item.item} onClick={() => update((draft) => { draft.standard.handle = item.item; })} className="p-2.5">
                    <p className="pr-6 text-xs font-semibold text-slate-900">{item.label}</p>
                    {item.tedee ? <p className="text-[10px] text-slate-500">{item.tedee === "yes" ? "Tedee compatible" : item.tedee === "miami_only" ? "Tedee: Miami handle only" : "Not Tedee compatible"}</p> : null}
                  </OptionCard>
                ))}
              </div>
            ) : null}
            {value.standard.lock === "pull_bar" && material.pull_bars ? (
              <div className="mt-3 space-y-2">
                {material.pull_bars.styles.length > 1 ? <ChipGroup label="Style" options={material.pull_bars.styles.map((item) => ({ id: item.key, label: item.label }))} value={pullBar.style} onChange={(style) => update((draft) => { draft.standard.pull_bar = { ...pullBar, style }; })} /> : null}
                <ChipGroup label="Lock hardware" options={material.pull_bars.blocks.map((item) => ({ id: item.key, label: item.label.replace(/^with /, "") }))} value={pullBar.block || ""} onChange={(block) => update((draft) => { draft.standard.pull_bar = { ...pullBar, block }; })} />
                <ChipGroup label="Length" options={pullBarLengths(catalog, value).map((length) => ({ id: length, label: `${length}"` }))} value={pullBar.length_in} onChange={(length_in) => update((draft) => { draft.standard.pull_bar = { ...pullBar, length_in }; })} />
                <ChipGroup label="Finish" options={material.pull_bars.finishes.map((item) => ({ id: item.key, label: item.label }))} value={pullBar.finish} onChange={(finish) => update((draft) => { draft.standard.pull_bar = { ...pullBar, finish }; })} />
                <ChipGroup label="Shape" options={material.pull_bars.shapes.map((item) => ({ id: item.key, label: item.label }))} value={pullBar.shape} onChange={(shape) => update((draft) => { draft.standard.pull_bar = { ...pullBar, shape }; })} />
                {material.key === "fiberglass" && pullBar.style === "offset" ? <p className="text-[11px] text-slate-500">Offset bars now fit fiberglass doors with doorlites (Palma, June 2025).</p> : null}
              </div>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <SectionTitle note="included by default">Brickmould</SectionTitle>
              <ChipGroup options={BRICKMOULDS.map((item) => ({ id: item.key as PipelineSelection["standard"]["brickmould"], label: item.label }))} value={value.standard.brickmould} onChange={(brickmould) => update((draft) => { draft.standard.brickmould = brickmould; })} />
              <p className="mt-2 text-[11px] text-slate-500">Finish follows the door; 101" lengths with a transom or a 7&apos;/8&apos; door. Custom brickmould is 3 pieces.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <SectionTitle>Hinges</SectionTitle>
              <ChipGroup options={HINGES.map((item) => ({ id: item.key as PipelineSelection["standard"]["hinges"], label: item.label }))} value={value.standard.hinges} onChange={(hinges) => update((draft) => { draft.standard.hinges = hinges; })} />
              {value.extras.fire_rated && material.extras?.fire_rating ? <p className="mt-2 text-[11px] text-slate-500">The fire rating includes self-closing hinges.</p> : null}
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
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <SectionTitle>Locks and smart lock</SectionTitle>
            {tedeeAllowed(catalog, value) ? (
              <>
                <Check checked={value.extras.tedee} onChange={(checked) => update((draft) => { draft.extras.tedee = checked; if (!checked) Object.assign(draft.extras, { tedee_keypad: false, tedee_bridge: false, tedee_sensor: false, tedee_knob: false }); })} hint={handle?.tedee === "miami_only" ? "Works only with the Miami handle from this handle row" : "Tedee-PRO on the FERCO multipoint or pull bar"}>Tedee smart lock integration</Check>
                {value.extras.tedee ? (
                  <div className="ml-6 mt-2 flex flex-wrap gap-4 text-xs text-slate-700">
                    {([["tedee_keypad", "Biometric keypad"], ["tedee_bridge", "WiFi bridge"], ["tedee_sensor", "Door sensor"], ["tedee_knob", "Temporary knob"]] as const).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={value.extras[key]} onChange={(event) => update((draft) => { draft.extras[key] = event.target.checked; })} />{label}</label>
                    ))}
                  </div>
                ) : null}
              </>
            ) : <Note>Tedee works with FERCO handles, Miami handles and multipoint pull bars (step 7).</Note>}
            <div className="mt-3 flex flex-wrap gap-6">
              <Check checked={value.extras.key_alike} onChange={(checked) => update((draft) => { draft.extras.key_alike = checked; })} hint="Same brand only">Key alike</Check>
              {layout?.doors === 2 ? <Check checked={value.extras.astragal_lock} onChange={(checked) => update((draft) => { draft.extras.astragal_lock = checked; })} hint="FERCO mortise lock for the inactive leaf">Astragal mortise lock</Check> : null}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <SectionTitle note={value.height === "8'0\"" ? "8' retractable screen" : undefined}>Screen</SectionTitle>
            <div className="flex flex-wrap items-center gap-4">
              <ChipGroup options={(extrasInfo?.screens || [{ key: "none", label: "None" }, { key: "white", label: "Retractable, white" }, { key: "painted", label: "Retractable, painted" }]).map((item) => ({ id: item.key as PipelineSelection["extras"]["screen"], label: item.label, disabled: (item.key === "white" || item.key === "painted") && !retractableScreenAllowed(catalog, value) }))} value={value.extras.screen} onChange={(screen) => update((draft) => { draft.extras.screen = screen; })} />
              {value.extras.screen !== "none" ? <Stepper label="Screens" value={value.extras.screen_qty} onChange={(screen_qty) => update((draft) => { draft.extras.screen_qty = screen_qty; })} min={1} max={4} /> : null}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">{retractableScreenAllowed(catalog, value) ? "Retractable screens: in-swing doors with regular 2\" brickmould; a double door takes two." : "Retractable screens need a 6-5/8\" or 7-1/4\" jamb (step 3)."}</p>
          </div>
          {material.key === "steel" && (accents.length || verticalAccentAllowed(catalog, value) || reededAccentAllowed(catalog, value)) ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <SectionTitle note="Novatech steel, priced per side">Decorative accents</SectionTitle>
              {accents.length ? (
                <div className="space-y-2">
                  <ChipGroup label="Accent" options={[{ id: "", label: "None" }, ...accents.map((item) => ({ id: item.key, label: item.label }))]} value={value.extras.accent?.design || ""} onChange={(design) => update((draft) => { draft.extras.accent = design ? { design, finish: accents.find((item) => item.key === design)!.finishes[0].key, sides: draft.extras.accent?.sides || "exterior" } : undefined; })} />
                  {value.extras.accent?.design ? (
                    <>
                      <ChipGroup label="Finish" options={(accents.find((item) => item.key === value.extras.accent!.design)?.finishes || []).map((item) => ({ id: item.key, label: item.label }))} value={value.extras.accent.finish || "ss"} onChange={(finish) => update((draft) => { draft.extras.accent = { ...draft.extras.accent, finish }; })} />
                      <ChipGroup label="Sides" options={[{ id: "exterior", label: "Exterior" }, { id: "both", label: "Both sides" }]} value={value.extras.accent.sides || "exterior"} onChange={(sides) => update((draft) => { draft.extras.accent = { ...draft.extras.accent, sides }; })} />
                      {(() => {
                        const accent = accents.find((item) => item.key === value.extras.accent!.design);
                        return accent && value.width && !accent.widths.includes(value.width) ? <p className="text-[11px] text-amber-800">Palma lists this accent for {accent.widths.join(", ")}" slabs — confirm {value.width}".</p> : null;
                      })()}
                    </>
                  ) : null}
                </div>
              ) : null}
              {verticalAccentAllowed(catalog, value) ? (
                <div className="mt-3"><ChipGroup label="Vertical accent (7x64, exterior)" options={[{ id: "", label: "None" }, ...(extrasInfo?.vertical_accent?.finishes || []).map((item) => ({ id: item.key, label: item.label }))]} value={value.extras.vertical_accent || ""} onChange={(finish) => update((draft) => { draft.extras.vertical_accent = finish || undefined; })} /></div>
              ) : null}
              {reededAccentAllowed(catalog, value) ? <div className="mt-3"><Check checked={value.extras.reeded_accent} onChange={(checked) => update((draft) => { draft.extras.reeded_accent = checked; })} hint='10" x 76" wood accent for the Uno slab'>Reeded wood vertical accent</Check></div> : null}
            </div>
          ) : null}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <SectionTitle>Trim</SectionTitle>
            <div className="flex flex-wrap gap-6">
              <Check checked={value.extras.casing} onChange={(checked) => update((draft) => { draft.extras.casing = checked; if (!checked) draft.extras.casing_backband = false; })} hint={`Poplar 3-1/2" colonial, ${finish?.startsWith("stain") ? "stained" : "painted"}`}>Interior casing</Check>
              {value.extras.casing ? <Check checked={value.extras.casing_backband} onChange={(checked) => update((draft) => { draft.extras.casing_backband = checked; })} hint="+50% of the casing">Backband</Check> : null}
            </div>
          </div>
          {lites || (layout?.sidelites ?? 0) > 0 || (extrasInfo?.triple_glazing && value.glass.door.glazed) ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <SectionTitle>Glass and sidelite options</SectionTitle>
              <div className="space-y-3">
                {lites ? <ChipGroup label="Glass frame" options={[{ id: "", label: "Standard" }, ...(extrasInfo?.glass_frames || []).map((item) => ({ id: item.key, label: item.label.replace(" glass frame", "") }))]} value={value.extras.glass_frame || ""} onChange={(frame) => update((draft) => { draft.extras.glass_frame = frame || undefined; })} /> : null}
                {extrasInfo?.triple_glazing && value.glass.door.glazed ? (
                  <div>
                    <ChipGroup label="Triple glazing" options={[{ id: "", label: "None" }, { id: "lowe_1x", label: "LowE 1x" }, { id: "lowe_2x", label: "LowE 2x" }]} value={value.extras.triple_glazing || ""} onChange={(glazing) => update((draft) => { draft.extras.triple_glazing = (glazing || undefined) as PipelineSelection["extras"]["triple_glazing"]; })} />
                    <p className="mt-1 text-[11px] text-slate-500">Novatech Silkscreen and V-Groove doorlites only.</p>
                  </div>
                ) : null}
                {(layout?.sidelites ?? 0) > 0 ? <Stepper label="Operating (hinged) sidelites" value={value.extras.operating_sidelite} onChange={(operating_sidelite) => update((draft) => { draft.extras.operating_sidelite = operating_sidelite; })} min={0} max={isCutDown(catalog, value) ? 0 : layout!.sidelites} /> : null}
              </div>
            </div>
          ) : null}
          <div className={`rounded-2xl border p-4 ${isCutDown(catalog, value) ? "border-brand-200 bg-brand-50/60" : "border-slate-200 bg-white"}`}>
            <p className="text-sm font-semibold text-slate-900">Custom cut-down height</p>
            <p className="text-[11px] text-slate-600">{isCutDown(catalog, value) ? "Flagged from step 2 — the cut-down upcharge is on this quote." : "Not needed — standard size. Turn on a custom size in step 2 to flag it."}</p>
          </div>
          {extrasInfo?.fire_rating || value.extras.fire_rated ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <Check checked={value.extras.fire_rated} onChange={(checked) => update((draft) => { draft.extras.fire_rated = checked; })} hint={extrasInfo?.fire_rating ? "Palma 20-minute rating, includes self-closing hinges" : undefined}>{extrasInfo?.fire_rating ? "20-minute fire rating" : "Fire-rated panel"}</Check>
              {value.extras.fire_rated && extrasInfo?.fire_rating && value.glass.door.glazed ? <p className="ml-6 mt-1 text-[11px] text-amber-800">Palma prints the rating on the solid-slab page — confirm it is available with glass.</p> : null}
              {value.extras.fire_rated && !extrasInfo?.fire_rating ? (
                <div className="ml-6 mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-700">
                  <span>List price per slab $</span>
                  <input className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-sm tabular-nums" inputMode="decimal" value={value.extras.fire_rated_list ?? ""} onChange={(event) => update((draft) => { const number = Number(event.target.value); draft.extras.fire_rated_list = event.target.value === "" || !Number.isFinite(number) ? undefined : number; })} />
                  <span className="text-[11px] text-amber-700">Palma&apos;s fiberglass book has no fire rating — confirm with Palma.</span>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-700">
            {([["mail_slot", "Mail slot"], ["peep_viewer", "Peep viewer"], ["dentil_shelf", "Dentil shelf"], ["kick_panel", "Kick panel"]] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={value.extras[key]} onChange={(event) => update((draft) => { draft.extras[key] = event.target.checked; })} />{label}</label>
            ))}
          </div>
        </div>
      ) : null}
    </ConfiguratorShell>
  );
}
