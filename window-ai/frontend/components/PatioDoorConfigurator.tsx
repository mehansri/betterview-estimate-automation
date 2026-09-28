"use client";

import { useState } from "react";
import type { QuoteCatalog } from "@/lib/api";
import type { NumericInputValue } from "@/lib/numericInput";
import WindowUnitDrawing from "@/components/WindowUnitDrawing";
import ConfiguratorShell, { ConfiguratorPrice } from "@/components/configurator/ConfiguratorShell";
import FinishStep from "@/components/configurator/FinishStep";
import { InchInput, OptionCard, SectionTitle, Stepper } from "@/components/configurator/parts";
import { DOOR_GLASS, FinishOptions } from "@/lib/productOptions";
import { OPERATION_TEXT, SLIDING_FALLBACK, slidingPanels, swingPanels } from "@/lib/patioLayout";
import { fmtInches } from "@/lib/windowLayout";

/** The patio-door fields the configurator edits; names match QuoteBuilder's draft. */
export type PatioDoorValue = FinishOptions & {
  type: "patio_sliding" | "patio_swing";
  sliding_ft: number;
  operation: string;
  swing_kind: string;
  swing_hinge: string;
  width: NumericInputValue;
  height: NumericInputValue;
  qty: NumericInputValue;
  kick_lock: boolean;
};

type Props = {
  catalog: QuoteCatalog;
  value: PatioDoorValue;
  onChange: (patch: Partial<PatioDoorValue>) => void;
  colours: string[];
  price: ConfiguratorPrice;
  location: string;
  onLocationChange: (value: string) => void;
  primaryAction?: { label: string; onClick: () => void; disabled?: boolean };
  editingLabel?: string | null;
};

// Same four steps, in the same order, as the window configurator.
const STEPS = [
  { id: "layout", label: "Layout", hint: "Pick the door and its size" },
  { id: "sections", label: "Panels", hint: "Choose which panel opens" },
  { id: "sizes", label: "Sizes", hint: "Frame size and quantity" },
  { id: "finish", label: "Glass & finish", hint: "Glass, colour, trim" },
] as const;

export default function PatioDoorConfigurator({ catalog, value, onChange, colours, price, location, onLocationChange, primaryAction, editingLabel }: Props) {
  const [step, setStep] = useState<string>("layout");
  const sliding = value.type === "patio_sliding";
  const sizes = catalog.patio_sliding?.length ? catalog.patio_sliding : SLIDING_FALLBACK;
  const row = sizes.find((item) => item.nominal_ft === value.sliding_ft) || sizes[1] || sizes[0];
  const bands = catalog.patio_swing_sizes?.[value.swing_kind] || [];

  const layout = sliding ? slidingPanels(value.operation) : swingPanels(value.swing_kind, value.swing_hinge);
  const width = sliding ? row.frame_width : value.width;
  const height = sliding ? row.frame_height : value.height;

  function pickSliding(nominal: number) {
    const next = sizes.find((item) => item.nominal_ft === nominal) || row;
    const operation = next.operations.includes(value.operation) ? value.operation : next.operations[0];
    const patch: Partial<PatioDoorValue> = { type: "patio_sliding", sliding_ft: nominal, operation };
    // Triple and tint are not offered on every size; fall back to regular glass.
    if (!next.triple && value.triple) Object.assign(patch, { triple: false, gas: "argon" });
    if (!next.tint && value.frost_tint) patch.frost_tint = false;
    onChange(patch);
  }

  function pickSwing(kind: string) {
    const band = catalog.patio_swing_sizes?.[kind]?.[1] || catalog.patio_swing_sizes?.[kind]?.[0];
    onChange({
      type: "patio_swing",
      swing_kind: kind,
      width: band ? Math.min(band.width_to, Math.max(band.width_from, kind === "double" ? 60 : 34)) : kind === "double" ? 60 : 34,
      height: band ? Math.min(band.height_to, Math.max(band.height_from, 80)) : 80,
      gas: "argon",
    });
  }

  const tripleNote = sliding && !row.triple ? `Not offered on the ${row.nominal_ft} ft door.` : "";
  const heading = sliding ? `WC-500 ${row.nominal_ft} ft sliding door` : `${value.swing_kind === "double" ? "Double" : "Single"} in-swing patio door`;

  return (
    <ConfiguratorShell
      eyebrow="Patio door configurator"
      title={editingLabel || "Design the door"}
      steps={STEPS}
      step={step}
      onStep={setStep}
      noun="door"
      price={price}
      qty={Number(value.qty) || 1}
      onQty={(qty) => onChange({ qty })}
      location={location}
      onLocationChange={onLocationChange}
      primaryAction={primaryAction}
      preview={{
        heading,
        subheading: sliding ? `${OPERATION_TEXT[value.operation] || value.operation} · ${fmtInches(row.frame_width)}″ × ${fmtInches(row.frame_height)}″ frame` : `${value.swing_kind === "double" ? "Both doors swing" : `Hinged ${value.swing_hinge}`} · ${width}″ × ${height}″`,
        badge: `${value.colour_ext}${value.colour_int === "black" ? " in/out" : ""} · ${sliding ? "Sliding" : "Swing"}`,
        drawing: <WindowUnitDrawing layout={layout} width={width} height={height} colour={value.colour_ext} size={420} />,
        hint: sliding ? "Arrows show the sliding panel, viewed from outside." : "Swing lines meet at the hinge side, viewed from outside.",
      }}
    >
      {step === "layout" ? (
        <div className="space-y-5">
          <div>
            <SectionTitle>Sliding · 2 panels</SectionTitle>
            <div className="grid grid-cols-3 gap-2">
              {sizes.filter((item) => item.panels === 2).map((item) => (
                <OptionCard key={item.nominal_ft} active={sliding && value.sliding_ft === item.nominal_ft} onClick={() => pickSliding(item.nominal_ft)} className="flex flex-col items-center p-3">
                  <span className="flex h-24 w-full items-center justify-center"><WindowUnitDrawing layout={slidingPanels("XO")} width={item.frame_width} height={item.frame_height} colour={value.colour_ext} size={84} showDimensions={false} showIndexes={false} /></span>
                  <span className="mt-2 text-xs font-semibold text-slate-800">{item.nominal_ft} ft</span>
                  <span className="text-[10px] text-slate-500">{fmtInches(item.frame_width)}″ × {fmtInches(item.frame_height)}″</span>
                </OptionCard>
              ))}
            </div>
          </div>
          <div>
            <SectionTitle>Sliding · 4 panels</SectionTitle>
            <div className="grid grid-cols-3 gap-2">
              {sizes.filter((item) => item.panels === 4).map((item) => (
                <OptionCard key={item.nominal_ft} active={sliding && value.sliding_ft === item.nominal_ft} onClick={() => pickSliding(item.nominal_ft)} className="flex flex-col items-center p-3">
                  <span className="flex h-24 w-full items-center justify-center"><WindowUnitDrawing layout={slidingPanels("OXXO")} width={item.frame_width} height={item.frame_height} colour={value.colour_ext} size={84} showDimensions={false} showIndexes={false} /></span>
                  <span className="mt-2 text-xs font-semibold text-slate-800">{item.nominal_ft} ft</span>
                  <span className="text-[10px] text-slate-500">{fmtInches(item.frame_width)}″ × {fmtInches(item.frame_height)}″</span>
                </OptionCard>
              ))}
            </div>
          </div>
          {catalog.patio_swing_kinds.length ? (
            <div>
              <SectionTitle>In-swing garden doors</SectionTitle>
              <div className="grid grid-cols-3 gap-2">
                {catalog.patio_swing_kinds.map((kind) => (
                  <OptionCard key={kind} active={!sliding && value.swing_kind === kind} onClick={() => pickSwing(kind)} className="flex flex-col items-center p-3">
                    <span className="flex h-24 w-full items-center justify-center"><WindowUnitDrawing layout={swingPanels(kind, "left")} width={kind === "double" ? 60 : 34} height={80} colour={value.colour_ext} size={84} showDimensions={false} showIndexes={false} /></span>
                    <span className="mt-2 text-xs font-semibold capitalize text-slate-800">{kind} swing</span>
                  </OptionCard>
                ))}
              </div>
            </div>
          ) : null}
          <p className="text-[11px] text-slate-500">WC-500 sliding doors come in the standard sizes above. Custom sizes are quoted by Window City.</p>
        </div>
      ) : null}

      {step === "sections" ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-brand-50/70 px-4 py-3 text-sm text-brand-900">Operation is as viewed from outside.</div>
          {sliding ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {row.operations.map((operation) => (
                <OptionCard key={operation} active={value.operation === operation} onClick={() => onChange({ operation })} className="flex flex-col items-center p-3">
                  <span className="flex h-24 w-full items-center justify-center"><WindowUnitDrawing layout={slidingPanels(operation)} width={row.frame_width} height={row.frame_height} colour={value.colour_ext} size={96} showDimensions={false} showIndexes={false} /></span>
                  <span className="mt-2 text-xs font-semibold text-slate-800">{OPERATION_TEXT[operation] || operation}</span>
                </OptionCard>
              ))}
            </div>
          ) : value.swing_kind === "double" ? (
            <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Both doors swing in, hinged on the outer jambs.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {(["left", "right"] as const).map((hinge) => (
                <OptionCard key={hinge} active={value.swing_hinge === hinge} onClick={() => onChange({ swing_hinge: hinge })} className="flex flex-col items-center p-3">
                  <span className="flex h-24 w-full items-center justify-center"><WindowUnitDrawing layout={swingPanels("single", hinge)} width={34} height={80} colour={value.colour_ext} size={84} showDimensions={false} showIndexes={false} /></span>
                  <span className="mt-2 text-xs font-semibold capitalize text-slate-800">{hinge} hinge</span>
                </OptionCard>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {step === "sizes" ? (
        <div className="space-y-5">
          {sliding ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-800">{row.nominal_ft} ft · {row.panels} panels</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{fmtInches(row.frame_width)}″ × {fmtInches(row.frame_height)}″</p>
              <p className="mt-1 text-xs text-slate-500">Frame size, as ordered. Pick another size in the Layout step.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <InchInput label="Frame width" value={value.width} onChange={(width) => onChange({ width })} />
                <InchInput label="Frame height" value={value.height} onChange={(height) => onChange({ height })} />
              </div>
              {bands.length ? <p className="text-xs text-slate-500">Priced sizes: {bands.map((band) => `${fmtInches(band.width_from)}–${fmtInches(band.width_to)}″ wide × ${fmtInches(band.height_from)}–${fmtInches(band.height_to)}″ high`).join("; ")}.</p> : null}
            </>
          )}
          <Stepper label="Quantity" value={Number(value.qty) || 1} onChange={(qty) => onChange({ qty })} min={1} max={99} />
        </div>
      ) : null}

      {step === "finish" ? (
        <FinishStep
          catalog={catalog}
          value={value}
          onChange={onChange}
          colours={colours}
          glass={DOOR_GLASS}
          unavailableGlass={tripleNote ? { triple: tripleNote } : {}}
          gases={sliding && value.triple
            ? [{ id: "argon", label: "Argon" }, { id: "50/50", label: "50/50 argon-krypton" }, { id: "krypton", label: "Krypton" }]
            : [{ id: "argon", label: "Argon" }]}
          flags={sliding && row.tint ? [{ key: "frost_tint", label: "Grey or bronze tint" }] : []}
          interiorUnavailable={value.colour_ext !== "white" && value.colour_ext !== "black" ? `A black interior goes with a black exterior (black in / black out).` : null}
          brickmould={{ title: "Brickmould", detail: sliding ? "EP326, installed on the head and both jambs" : "Installed on the head and both jambs" }}
          jambProduct="patio"
          extraTrim={sliding ? (
            <OptionCard active={value.kick_lock} onClick={() => onChange({ kick_lock: !value.kick_lock })} className="w-full p-3 sm:w-1/2">
              <p className="pr-6 text-sm font-semibold text-slate-900">Kick lock</p>
              <p className="text-[11px] text-slate-500">Foot-operated security lock{row.panels === 4 ? ", one per sliding panel" : ""}. Twin-point 10″ handle included.</p>
            </OptionCard>
          ) : null}
        />
      ) : null}
    </ConfiguratorShell>
  );
}
