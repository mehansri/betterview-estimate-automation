"use client";

import { useState } from "react";
import type { QuoteCatalog } from "@/lib/api";
import type { NumericInputValue } from "@/lib/numericInput";
import ConfiguratorShell, { ConfiguratorPrice } from "@/components/configurator/ConfiguratorShell";
import FinishStep from "@/components/configurator/FinishStep";
import { ChipGroup, Glyph, InchInput, OptionCard, SectionTitle, Stepper, ToolButton } from "@/components/configurator/parts";
import { DivisionEditor, layoutDrawing, PresetGrid, SectionPalette, useLayoutEditor } from "@/components/configurator/layoutEditor";
import { blackInteriorStyles, FinishOptions, WINDOW_GASES, WINDOW_GLASS } from "@/lib/productOptions";
import { addLite, BAY_PRESETS, bayProblem, headSeatFor, liteCount, MAX_LITES, MIN_LITES, removeLite } from "@/lib/bayLayout";
import { LayoutNode, LayoutPreset, layoutSummary, OPERATION_LABELS, sectionLabel, sectionSizeProblem, WindowOperation } from "@/lib/windowLayout";

/** The bay fields the configurator edits; names match QuoteBuilder's draft. */
export type BayValue = FinishOptions & {
  unit_series: string;
  width: NumericInputValue;
  height: NumericInputValue;
  qty: NumericInputValue;
  layout: LayoutNode;
  preset: string;
  bay_style: string;
  head_seat: string;
  insulated: boolean;
  welded_bm: boolean;
  cable_support: boolean;
};

type Props = {
  catalog: QuoteCatalog;
  value: BayValue;
  onChange: (patch: Partial<BayValue>) => void;
  colours: string[];
  price: ConfiguratorPrice;
  location: string;
  onLocationChange: (value: string) => void;
  primaryAction?: { label: string; onClick: () => void; disabled?: boolean };
  editingLabel?: string | null;
};

// Same four steps, in the same order, as the window configurator.
const STEPS = [
  { id: "layout", label: "Layout", hint: "Pick a bay or bow" },
  { id: "sections", label: "Lites", hint: "Choose what each lite does" },
  { id: "sizes", label: "Sizes", hint: "Overall size and lite widths" },
  { id: "finish", label: "Glass & finish", hint: "Glass, colour, trim, head & seat" },
] as const;

export default function BayConfigurator({ catalog, value, onChange, colours, price, location, onLocationChange, primaryAction, editingLabel }: Props) {
  const layoutCatalog = catalog.layout;
  const [step, setStep] = useState<string>("layout");
  const editor = useLayoutEditor(value, onChange, { onSelect: () => setStep((current) => (current === "layout" ? "sections" : current)) });
  const { resolved, error, primary } = editor;

  const series = layoutCatalog?.series.find((item) => item.id === value.unit_series) || layoutCatalog?.series[0];
  const seriesOps = new Set<WindowOperation>((series?.operations || Object.keys(OPERATION_LABELS)) as WindowOperation[]);
  const styleByCode = new Map(catalog.styles.map((style) => [style.code, style]));
  const tripleGlass = value.triple || value.tri_pane_lami;
  const problem = bayProblem(value.layout);
  const lites = liteCount(value.layout);
  const headSeatSizes = catalog.baybow.head_seat_sizes;
  const suggestedHeadSeat = headSeatFor(Number(value.width) || 0, headSeatSizes);

  const sizeProblems = (resolved?.sections || []).flatMap((section) => {
    const code = series?.styles?.[section.node.op];
    const sizeProblem = sectionSizeProblem(code ? styleByCode.get(code) : undefined, section.width, section.height, tripleGlass);
    return sizeProblem ? [{ index: section.index, label: sectionLabel(section.node), problem: sizeProblem }] : [];
  });
  const unsupported = (resolved?.sections || []).filter((section) => !seriesOps.has(section.node.op));
  const blackStyles = blackInteriorStyles(catalog);
  const noBlack = (resolved?.sections || []).map((section) => series?.styles?.[section.node.op] || "").filter((code) => code && !blackStyles.has(code));
  const interiorUnavailable = noBlack.length
    ? `Black interior isn't offered on ${Array.from(new Set(noBlack)).join(", ")}. Use casement, awning or fixed lites in the Classic or Heritage Maximum series.`
    : null;

  const activePreset = BAY_PRESETS.find((preset) => preset.id === value.preset);
  const drawing = layoutDrawing(editor, value, "lite");

  function applyPreset(preset: LayoutPreset) {
    const style = (preset as LayoutPreset & { style?: string }).style || "bay";
    editor.setSelected([[]]);
    onChange({ layout: JSON.parse(JSON.stringify(preset.layout)) as LayoutNode, preset: preset.id, bay_style: style, width: preset.width, height: preset.height, head_seat: value.welded_bm ? value.head_seat : headSeatFor(preset.width, headSeatSizes) });
  }

  return (
    <ConfiguratorShell
      eyebrow="Bay & bow configurator"
      title={editingLabel || "Design the bay"}
      steps={STEPS}
      step={step}
      onStep={setStep}
      noun="bay"
      price={price}
      energy={price.sections ?? null}
      qty={Number(value.qty) || 1}
      onQty={(qty) => onChange({ qty })}
      location={location}
      onLocationChange={onLocationChange}
      primaryAction={primaryAction}
      preview={{
        heading: `${value.bay_style === "bow" ? "Bow" : "Bay"} window · ${lites} lites${activePreset ? ` · ${activePreset.label}` : ""}`,
        subheading: resolved ? layoutSummary(resolved) : error,
        badge: `${value.colour_ext}${value.colour_int === "black" ? " in/out" : ""} · ${series?.label.split(" (")[0] || ""}`,
        drawing: drawing.drawing,
        hint: "Drawn flat, viewed from outside · click a lite to select it · drag a blue handle to change lite widths",
        below: (
          <>
            {drawing.chips}
            {problem || sizeProblems.length || unsupported.length ? (
              <div className="mt-4 space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                {problem ? <p>{problem}</p> : null}
                {unsupported.map((section) => <p key={`u${section.index}`}>Lite {section.index}: {OPERATION_LABELS[section.node.op]} isn&apos;t offered in the {series?.label}.</p>)}
                {sizeProblems.map((item) => <p key={item.index}>Lite {item.index} ({item.label}): outside the printed size — {item.problem}.</p>)}
              </div>
            ) : null}
          </>
        ),
      }}
    >
      {step === "layout" ? (
        <div className="space-y-5">
          <PresetGrid
            groups={[
              { label: "Bay (30° or 45°)", presets: BAY_PRESETS.filter((preset) => preset.style === "bay") },
              { label: "Bow (10° or 15°)", presets: BAY_PRESETS.filter((preset) => preset.style === "bow") },
            ]}
            activeId={value.preset}
            colour={value.colour_ext}
            onPick={applyPreset}
          />
          <ChipGroup label="Style" options={[{ id: "bay", label: "Bay" }, { id: "bow", label: "Bow" }]} value={value.bay_style === "bow" ? "bow" : "bay"} onChange={(bay_style) => onChange({ bay_style })} />
        </div>
      ) : null}

      {step === "sections" ? (
        <SectionPalette
          editor={editor}
          operations={seriesOps}
          colour={value.colour_ext}
          noun="lite"
          seriesNote={series ? `${series.label} offers ${Array.from(seriesOps).map((op) => OPERATION_LABELS[op].toLowerCase()).join(", ")}.` : ""}
          tools={(
            <div>
              <SectionTitle>Lites</SectionTitle>
              <div className="flex flex-wrap gap-2">
                <ToolButton title="Add a fixed lite at the end" onClick={() => editor.setLayout(addLite(value.layout))} disabled={lites >= MAX_LITES}><Glyph kind="plus" />Add a lite</ToolButton>
                <ToolButton tone="danger" title="Remove the selected lite" onClick={() => primary && editor.setLayout(removeLite(value.layout, primary.path[0] ?? 0))} disabled={lites <= MIN_LITES || !primary}><Glyph kind="minus" />Remove selected lite</ToolButton>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">A bay or bow has {MIN_LITES} to {MAX_LITES} lites. Each lite is priced as its own window; angled couplers join them.</p>
            </div>
          )}
        />
      ) : null}

      {step === "sizes" ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <InchInput label="Overall width" value={value.width} onChange={(width) => editor.resize("cols", width)} />
            <InchInput label="Height" value={value.height} onChange={(height) => editor.resize("rows", height)} />
          </div>
          <p className="text-xs text-slate-500">Overall width is the lite widths added together, as ordered; the bay projects out from the wall.</p>
          <DivisionEditor editor={editor} layout={value.layout} labelFor={() => "Lite widths, left to right"} />
          <Stepper label="Quantity" value={Number(value.qty) || 1} onChange={(qty) => onChange({ qty })} min={1} max={99} />
        </div>
      ) : null}

      {step === "finish" ? (
        <FinishStep
          catalog={catalog}
          value={value}
          onChange={onChange}
          colours={colours}
          glass={WINDOW_GLASS}
          gases={WINDOW_GASES}
          flags={[
            { key: "loe180", label: "LoE 180" },
            { key: "i89", label: "i89" },
            { key: "triple", label: "Triple pane" },
            { key: "tri_pane_lami", label: "Tri-pane laminated" },
            { key: "frost_tint", label: "Frost / tint (all lites)" },
          ]}
          interiorUnavailable={interiorUnavailable}
          lead={(
            <div>
              <SectionTitle>Series</SectionTitle>
              <div className="grid gap-2 sm:grid-cols-2">
                {(layoutCatalog?.series || []).map((item) => (
                  <OptionCard key={item.id} active={item.id === series?.id} onClick={() => onChange({ unit_series: item.id })} className="p-3">
                    <p className="pr-6 text-sm font-semibold text-slate-900">{item.label}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{item.operations.map((op) => OPERATION_LABELS[op]).join(" · ")}</p>
                  </OptionCard>
                ))}
              </div>
            </div>
          )}
          brickmould={null}
          extraTrim={(
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <OptionCard active={!value.welded_bm} onClick={() => onChange({ welded_bm: false, head_seat: value.head_seat || suggestedHeadSeat })} className="p-3">
                  <p className="pr-6 text-sm font-semibold text-slate-900">Plywood head & seat</p>
                  <p className="text-[11px] text-slate-500">3/4″ plywood, good one side · 5 7/8″ standard jamb</p>
                </OptionCard>
                <OptionCard active={value.welded_bm} onClick={() => onChange({ welded_bm: true })} className="p-3">
                  <p className="pr-6 text-sm font-semibold text-slate-900">Welded brickmould</p>
                  <p className="text-[11px] text-slate-500">No head & seat · {lites}-lite welded brickmould</p>
                </OptionCard>
              </div>
              {!value.welded_bm ? (
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <ChipGroup label="Head & seat" options={headSeatSizes.map((size) => ({ id: size, label: size }))} value={value.head_seat || suggestedHeadSeat} onChange={(head_seat) => onChange({ head_seat })} />
                  {value.head_seat && value.head_seat !== suggestedHeadSeat ? <p className="mt-2 text-[11px] text-amber-700">{Number(value.width)}″ wide usually takes “{suggestedHeadSeat}”.</p> : null}
                  <label className="mt-3 flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={value.insulated} onChange={(e) => onChange({ insulated: e.target.checked })} />Insulated head & seat</label>
                </div>
              ) : null}
              <label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={value.cable_support} onChange={(e) => onChange({ cable_support: e.target.checked })} />Grip-Tite cable support (for projecting bays)</label>
            </div>
          )}
        />
      ) : null}
    </ConfiguratorShell>
  );
}
