"use client";

import { ReactNode } from "react";
import type { QuoteCatalog } from "@/lib/api";
import { FRAME_SWATCHES } from "@/components/WindowUnitDrawing";
import { ChipGroup, InchInput, OptionCard, SectionTitle } from "@/components/configurator/parts";
import {
  activeGlass,
  CUSTOM_JAMB,
  FinishOptions,
  GlassPackage,
  INTERIOR_COLOURS,
  jambLabel,
  withColourRules,
} from "@/lib/productOptions";

type Flag = { key: "loe180" | "i89" | "triple" | "tri_pane_lami" | "frost_tint"; label: string };

type Props = {
  catalog: QuoteCatalog;
  value: FinishOptions;
  onChange: (patch: Partial<FinishOptions>) => void;
  colours: string[];
  glass: GlassPackage[];
  /** Glass packages the selected product cannot take (e.g. triple on an 8 ft door). */
  unavailableGlass?: Record<string, string>;
  gases: Array<{ id: string; label: string; disabled?: boolean }>;
  flags: Flag[];
  /** Why a black interior is not offered on the current product, or null when it is. */
  interiorUnavailable?: string | null;
  /** Series (windows, bays) or door family picker, shown first. */
  lead?: ReactNode;
  brickmould?: { title: string; detail: string } | null;
  /** Product-specific trim after brickmould and jamb (bay head & seat, door kick lock). */
  extraTrim?: ReactNode;
  glassNote?: ReactNode;
};

function Swatch({ colour, active, onClick, disabled, title }: { colour: string; active: boolean; onClick: () => void; disabled?: boolean; title?: string }) {
  const swatch = FRAME_SWATCHES[colour] || FRAME_SWATCHES.white;
  return (
    <button type="button" onClick={onClick} aria-pressed={active} disabled={disabled} title={title} className="flex flex-col items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-40">
      <span className={`h-11 w-11 rounded-full border-2 shadow-inner transition ${active ? "border-brand-600 ring-4 ring-brand-100" : "border-slate-200 hover:border-slate-400"}`} style={{ background: `linear-gradient(135deg, ${swatch.light}, ${swatch.fill} 60%, ${swatch.edge})` }} />
      <span className={`text-[11px] capitalize ${active ? "font-semibold text-slate-900" : "text-slate-600"}`}>{colour}</span>
    </button>
  );
}

/** Glass & finish: the same colours, glass and trim fields, in the same order, for every product. */
export default function FinishStep({ catalog, value, onChange, colours, glass, unavailableGlass = {}, gases, flags, interiorUnavailable, lead, brickmould, extraTrim, glassNote }: Props) {
  const set = (patch: Partial<FinishOptions>) => onChange(withColourRules(value, patch));
  const current = activeGlass(glass, value);
  const depths = catalog.wood_jamb?.depths || [];
  const customMax = catalog.wood_jamb?.custom_max_in || 7.5;

  return (
    <div className="space-y-6">
      {lead}

      <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
        <div>
          <SectionTitle>Exterior colour</SectionTitle>
          <div className="flex flex-wrap gap-3">
            {colours.map((colour) => <Swatch key={colour} colour={colour} active={value.colour_ext === colour} onClick={() => set({ colour_ext: colour })} />)}
          </div>
        </div>
        <div>
          <SectionTitle>Interior colour</SectionTitle>
          <div className="flex flex-wrap gap-3">
            {INTERIOR_COLOURS.map((colour) => (
              <Swatch
                key={colour}
                colour={colour}
                active={(value.colour_int || "white") === colour}
                disabled={colour !== "white" && Boolean(interiorUnavailable)}
                title={colour !== "white" && interiorUnavailable ? interiorUnavailable : colour === "black" ? "Black in / black out" : undefined}
                onClick={() => set({ colour_int: colour })}
              />
            ))}
          </div>
        </div>
      </div>
      {value.colour_int === "black" ? (
        <p className="-mt-3 rounded-lg bg-slate-900 px-3 py-2 text-xs text-white">Black in / black out — the black interior is priced with a black exterior.</p>
      ) : interiorUnavailable ? (
        <p className="-mt-3 text-[11px] text-slate-500">{interiorUnavailable}</p>
      ) : null}

      <div>
        <SectionTitle>Glass package</SectionTitle>
        <div className="grid gap-2 sm:grid-cols-3">
          {glass.map((pkg) => (
            <OptionCard key={pkg.id} active={current?.id === pkg.id} onClick={() => set({ ...pkg.patch })} className="p-3" disabled={Boolean(unavailableGlass[pkg.id])}>
              <div className="mb-2 flex gap-0.5" aria-hidden>
                {Array.from({ length: pkg.panes }).map((_, i) => <span key={i} className="h-8 w-1.5 rounded-sm bg-gradient-to-b from-sky-200 to-sky-400" />)}
              </div>
              <p className="pr-6 text-sm font-semibold text-slate-900">{pkg.title}</p>
              <p className="text-[11px] text-slate-600">{pkg.detail}</p>
              <p className="mt-1 text-[11px] text-slate-500">{unavailableGlass[pkg.id] || pkg.note}</p>
            </OptionCard>
          ))}
        </div>
        {gases.length > 1 ? <div className="mt-3"><ChipGroup label="Gas" options={gases} value={value.gas} onChange={(gas) => set({ gas })} /></div> : null}
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-700">
          {flags.map((flag) => (
            <label key={flag.key} className="flex items-center gap-2"><input type="checkbox" checked={Boolean(value[flag.key])} onChange={(e) => set({ [flag.key]: e.target.checked } as Partial<FinishOptions>)} />{flag.label}</label>
          ))}
        </div>
        {glassNote}
      </div>

      <div>
        <SectionTitle>Trim</SectionTitle>
        <div className="grid gap-2 sm:grid-cols-2">
          {brickmould ? (
            <OptionCard active={value.brickmould} onClick={() => set({ brickmould: !value.brickmould })} className="p-3">
              <p className="pr-6 text-sm font-semibold text-slate-900">{brickmould.title}</p>
              <p className="text-[11px] text-slate-500">{brickmould.detail}</p>
            </OptionCard>
          ) : null}
          <OptionCard active={value.wood_jamb} onClick={() => set({ wood_jamb: !value.wood_jamb })} className="p-3">
            <p className="pr-6 text-sm font-semibold text-slate-900">Wood jamb extension</p>
            <p className="text-[11px] text-slate-500">{value.wood_jamb ? jambLabel(value, catalog) : "Interior jamb, primed"}</p>
          </OptionCard>
        </div>
        {value.wood_jamb ? (
          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-xs font-semibold text-slate-700">Jamb depth <span className="font-normal text-slate-500">· primed · 5 1/2″ is the standard</span></p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {depths.map((depth) => (
                <button key={depth.name} type="button" aria-pressed={value.jamb_depth === depth.name} onClick={() => set({ jamb_depth: depth.name })} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${value.jamb_depth === depth.name ? "border-brand-500 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-brand-300"}`}>{depth.name.replace('"', "″")}</button>
              ))}
              <button type="button" aria-pressed={value.jamb_depth === CUSTOM_JAMB} onClick={() => set({ jamb_depth: CUSTOM_JAMB })} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${value.jamb_depth === CUSTOM_JAMB ? "border-brand-500 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-brand-300"}`}>Custom depth…</button>
            </div>
            {value.jamb_depth === CUSTOM_JAMB ? (
              <div className="mt-3 max-w-[12rem]">
                <InchInput label="Custom depth" value={value.jamb_custom} onChange={(jamb_custom) => set({ jamb_custom })} min={0.5} hint={`Up to ${customMax}″, priced on the custom row.`} />
              </div>
            ) : null}
          </div>
        ) : null}
        {extraTrim ? <div className="mt-3">{extraTrim}</div> : null}
      </div>
    </div>
  );
}
