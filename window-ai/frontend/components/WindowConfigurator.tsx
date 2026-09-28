"use client";

import { useState } from "react";
import type { QuoteCatalog } from "@/lib/api";
import type { NumericInputValue } from "@/lib/numericInput";
import WindowUnitDrawing from "@/components/WindowUnitDrawing";
import ConfiguratorShell, { ConfiguratorPrice } from "@/components/configurator/ConfiguratorShell";
import FinishStep from "@/components/configurator/FinishStep";
import { Glyph, InchInput, OptionCard, SectionTitle, Stepper, ToolButton } from "@/components/configurator/parts";
import { DivisionEditor, layoutDrawing, PresetGrid, SectionPalette, useLayoutEditor } from "@/components/configurator/layoutEditor";
import { blackInteriorStyles, FinishOptions, WINDOW_GASES, WINDOW_GLASS } from "@/lib/productOptions";
import {
  gridLayout,
  LayoutNode,
  LayoutPreset,
  layoutSummary,
  leafCount,
  mergeSection,
  nodeAt,
  OPERATION_LABELS,
  replaceAt,
  sectionLabel,
  sectionSizeProblem,
  splitSection,
  WindowOperation,
} from "@/lib/windowLayout";

export type { ConfiguratorPrice } from "@/components/configurator/ConfiguratorShell";

/** The window fields the configurator edits; names match QuoteBuilder's draft. */
export type ConfiguratorValue = FinishOptions & {
  unit_series: string;
  width: NumericInputValue;
  height: NumericInputValue;
  qty: NumericInputValue;
  layout: LayoutNode;
  preset: string;
};

type Props = {
  catalog: QuoteCatalog;
  value: ConfiguratorValue;
  onChange: (patch: Partial<ConfiguratorValue>) => void;
  colours: string[];
  price: ConfiguratorPrice;
  location: string;
  onLocationChange: (value: string) => void;
  /** Add-to-project button; omitted while editing a saved line. */
  primaryAction?: { label: string; onClick: () => void; disabled?: boolean };
  editingLabel?: string | null;
};

const STEPS = [
  { id: "layout", label: "Layout", hint: "Pick a starting shape" },
  { id: "sections", label: "Sections", hint: "Choose what each part does" },
  { id: "sizes", label: "Sizes", hint: "Overall size and divisions" },
  { id: "finish", label: "Glass & finish", hint: "Glass, colour, trim" },
] as const;

const PANEL_GROUPS = [
  { label: "Single", test: (n: number) => n === 1 },
  { label: "2 panels", test: (n: number) => n === 2 },
  { label: "3 panels", test: (n: number) => n === 3 },
  { label: "4+ panels", test: (n: number) => n >= 4 },
];

export default function WindowConfigurator({ catalog, value, onChange, colours, price, location, onLocationChange, primaryAction, editingLabel }: Props) {
  const layoutCatalog = catalog.layout;
  const [step, setStep] = useState<string>("layout");
  const [gridCols, setGridCols] = useState(2);
  const [gridRows, setGridRows] = useState(1);
  const editor = useLayoutEditor(value, onChange, { onSelect: () => setStep((current) => (current === "layout" ? "sections" : current)) });
  const { resolved, error, primary } = editor;

  const series = layoutCatalog?.series.find((item) => item.id === value.unit_series) || layoutCatalog?.series[0];
  const seriesOps = new Set<WindowOperation>((series?.operations || Object.keys(OPERATION_LABELS)) as WindowOperation[]);
  const styleByCode = new Map(catalog.styles.map((style) => [style.code, style]));
  const tripleGlass = value.triple || value.tri_pane_lami;

  const sizeProblems = (resolved?.sections || []).flatMap((section) => {
    const code = section.node.style || series?.styles?.[section.node.op];
    const problem = sectionSizeProblem(code ? styleByCode.get(code) : undefined, section.width, section.height, tripleGlass);
    return problem ? [{ index: section.index, label: sectionLabel(section.node), problem }] : [];
  });
  const unsupported = (resolved?.sections || []).filter((section) => !seriesOps.has(section.node.op));

  // Black in / black out is offered on casements, awnings and fixed units in
  // the Classic and Heritage Maximum series -- not on sliders, hung or slim fixed.
  const blackStyles = blackInteriorStyles(catalog);
  const sectionStyles = (resolved?.sections || []).map((section) => section.node.style || series?.styles?.[section.node.op] || "");
  const noBlackInterior = sectionStyles.filter((code) => code && !blackStyles.has(code));
  const interiorUnavailable = noBlackInterior.length
    ? `Black interior isn't offered on ${Array.from(new Set(noBlackInterior)).join(", ")}. It is offered on casement, awning and fixed windows in the Classic and Heritage Maximum series.`
    : null;

  const presetGroups = PANEL_GROUPS.map((group) => ({ ...group, presets: (layoutCatalog?.presets || []).filter((preset) => group.test(leafCount(preset.layout))) }));
  const activePreset = layoutCatalog?.presets.find((preset) => preset.id === value.preset);
  const drawing = layoutDrawing(editor, value);

  function applyPreset(preset: LayoutPreset) {
    editor.setSelected([[]]);
    onChange({ layout: JSON.parse(JSON.stringify(preset.layout)) as LayoutNode, preset: preset.id });
  }

  function addTransom() {
    if (!primary) return;
    const node = nodeAt(value.layout, primary.path);
    editor.setLayout(replaceAt(value.layout, primary.path, { split: "rows", sizes: ["1/4", "*"], children: [{ op: "fixed" }, JSON.parse(JSON.stringify(node))] }));
    editor.setSelected([[...primary.path, 0]]);
  }

  return (
    <ConfiguratorShell
      eyebrow="Window configurator"
      title={editingLabel || "Design the opening"}
      steps={STEPS}
      step={step}
      onStep={setStep}
      noun="window"
      price={price}
      energy={price.sections ?? null}
      qty={Number(value.qty) || 1}
      onQty={(qty) => onChange({ qty })}
      location={location}
      onLocationChange={onLocationChange}
      primaryAction={primaryAction}
      preview={{
        heading: activePreset ? `${activePreset.code ? `${activePreset.code} · ` : ""}${activePreset.label}` : resolved ? `Custom ${resolved.sections.length === 1 ? "window" : `${resolved.sections.length}-section unit`}` : "Window",
        subheading: resolved ? layoutSummary(resolved) : error,
        badge: `${value.colour_ext}${value.colour_int === "black" ? " in/out" : ""} · ${series?.label.split(" (")[0] || ""}`,
        drawing: drawing.drawing,
        hint: "Click a section to select it · Shift-click for several · drag a blue handle to move a mullion (snaps to ¼, ⅓, ½)",
        below: (
          <>
            {drawing.chips}
            {sizeProblems.length || unsupported.length ? (
              <div className="mt-4 space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                {unsupported.map((section) => <p key={`u${section.index}`}>Section {section.index}: {OPERATION_LABELS[section.node.op]} isn&apos;t offered in the {series?.label}.</p>)}
                {sizeProblems.map((item) => <p key={item.index}>Section {item.index} ({item.label}): outside the printed size — {item.problem}.</p>)}
              </div>
            ) : null}
          </>
        ),
      }}
    >
      {step === "layout" ? (
        <div className="space-y-5">
          <PresetGrid groups={presetGroups} activeId={value.preset} colour={value.colour_ext} onPick={applyPreset} />
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4">
            <p className="text-sm font-semibold text-slate-800">Custom grid</p>
            <p className="mt-0.5 text-xs text-slate-500">Start from an even grid, then set each section and drag the mullions.</p>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <Stepper label="Columns" value={gridCols} onChange={setGridCols} min={1} max={5} />
              <Stepper label="Rows" value={gridRows} onChange={setGridRows} min={1} max={4} />
              <span className="flex h-12 w-16 items-center justify-center"><WindowUnitDrawing layout={gridLayout(gridCols, gridRows)} width={gridCols * 24} height={gridRows * 30} colour={value.colour_ext} size={48} showDimensions={false} showIndexes={false} /></span>
              <button type="button" className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800" onClick={() => { editor.setSelected([[]]); onChange({ layout: gridLayout(gridCols, gridRows), preset: "" }); setStep("sections"); }}>Use this grid</button>
            </div>
          </div>
        </div>
      ) : null}

      {step === "sections" ? (
        <SectionPalette
          editor={editor}
          operations={seriesOps}
          colour={value.colour_ext}
          seriesNote={series ? `${series.label} offers ${Array.from(seriesOps).map((op) => OPERATION_LABELS[op].toLowerCase()).join(", ")}.` : ""}
          tools={(
            <div>
              <SectionTitle>Divide or combine</SectionTitle>
              <div className="flex flex-wrap gap-2">
                <ToolButton title="Split the selected section into two side by side" onClick={() => primary && editor.setLayout(splitSection(value.layout, primary.path, "cols", 2))} disabled={!primary}><Glyph kind="cols2" />Split in 2 across</ToolButton>
                <ToolButton title="Split the selected section into three side by side" onClick={() => primary && editor.setLayout(splitSection(value.layout, primary.path, "cols", 3))} disabled={!primary}><Glyph kind="cols3" />Split in 3 across</ToolButton>
                <ToolButton title="Split the selected section top and bottom" onClick={() => primary && editor.setLayout(splitSection(value.layout, primary.path, "rows", 2))} disabled={!primary}><Glyph kind="rows2" />Split top / bottom</ToolButton>
                <ToolButton title="Add a fixed transom over the selected section (1/4 of its height)" onClick={addTransom} disabled={!primary}><Glyph kind="transom" />Add transom</ToolButton>
                <ToolButton tone="danger" title="Remove the division this section belongs to" onClick={() => { if (primary?.path.length) { editor.setLayout(mergeSection(value.layout, primary.path)); editor.setSelected([primary.path.slice(0, -1)]); } }} disabled={!primary?.path.length}><Glyph kind="merge" />Remove division</ToolButton>
              </div>
            </div>
          )}
        />
      ) : null}

      {step === "sizes" ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <InchInput label="Overall width" value={value.width} onChange={(width) => editor.resize("cols", width)} />
            <InchInput label="Overall height" value={value.height} onChange={(height) => editor.resize("rows", height)} />
          </div>
          <p className="text-xs text-slate-500">Frame size, as ordered. Fractions like 35 1/2 work. Divisions keep their proportions when the overall size changes.</p>
          <DivisionEditor editor={editor} layout={value.layout} />
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
            { key: "frost_tint", label: "Frost / tint (whole unit)" },
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
          brickmould={{ title: "Brickmould", detail: `${catalog.accessories.brickmould?.[0]?.name || "Exterior brickmould"}${leafCount(value.layout) > 1 ? " — wraps the whole unit" : ""}` }}
        />
      ) : null}
    </ConfiguratorShell>
  );
}
