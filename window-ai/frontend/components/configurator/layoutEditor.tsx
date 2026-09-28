"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import type { NumericInputValue } from "@/lib/numericInput";
import WindowUnitDrawing from "@/components/WindowUnitDrawing";
import { OptionCard, SectionTitle } from "@/components/configurator/parts";
import {
  DivisionSize,
  dragJoint,
  fmtInches,
  Hinge,
  isSplit,
  LayoutLeaf,
  LayoutNode,
  LayoutPreset,
  leafCount,
  OPERATION_LABELS,
  parseInches,
  resolveSizes,
  ResolvedJoint,
  scaleLayout,
  sectionLabel,
  setDivisionSizes,
  tryResolveLayout,
  updateLeaf,
  WindowOperation,
} from "@/lib/windowLayout";

/**
 * Layout editing shared by windows and bays: presets, a section palette,
 * division sizes and the clickable, draggable drawing. The configurator that
 * owns the value keeps the selection through ``useLayoutEditor``.
 */

type LayoutValue = { layout: LayoutNode; width: NumericInputValue; height: NumericInputValue; preset: string; colour_ext: string };

export type PaletteItem = { key: string; label: string; leaf: LayoutLeaf };

export const PALETTE: PaletteItem[] = [
  { key: "fixed", label: "Fixed", leaf: { op: "fixed" } },
  { key: "casement-left", label: "Casement · left hinge", leaf: { op: "casement", hinge: "left" } },
  { key: "casement-right", label: "Casement · right hinge", leaf: { op: "casement", hinge: "right" } },
  { key: "awning", label: "Awning", leaf: { op: "awning", hinge: "top" } },
  { key: "slim_fixed", label: "Slim fixed", leaf: { op: "slim_fixed" } },
  { key: "single_slider-left", label: "Single slider · left", leaf: { op: "single_slider", hinge: "left" } },
  { key: "single_slider-right", label: "Single slider · right", leaf: { op: "single_slider", hinge: "right" } },
  { key: "double_slider", label: "Double slider", leaf: { op: "double_slider" } },
  { key: "single_hung", label: "Single hung", leaf: { op: "single_hung" } },
  { key: "double_hung", label: "Double hung", leaf: { op: "double_hung" } },
];

function samePath(a: number[], b: number[]) {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

function sameLeaf(node: LayoutLeaf, leaf: LayoutLeaf) {
  return node.op === leaf.op && (node.hinge || null) === (leaf.hinge || null);
}

export function useLayoutEditor<V extends LayoutValue>(value: V, onChange: (patch: Partial<V>) => void, options: { onSelect?: () => void } = {}) {
  const [selected, setSelected] = useState<number[][]>([[]]);
  const [preview, setPreview] = useState<LayoutNode | null>(null);
  const [dragLabel, setDragLabel] = useState<string | null>(null);

  const layout = preview || value.layout;
  const { resolved, error } = useMemo(() => tryResolveLayout(layout, value.width, value.height), [layout, value.width, value.height]);

  // Keep the selection pointing at sections that still exist.
  useEffect(() => {
    if (!resolved) return;
    const valid = selected.filter((path) => resolved.sections.some((section) => samePath(section.path, path)));
    if (valid.length !== selected.length || !valid.length) setSelected(valid.length ? valid : [resolved.sections[0].path]);
  }, [resolved, selected]);

  const selectedSections = resolved?.sections.filter((section) => selected.some((path) => samePath(path, section.path))) || [];
  const primary = selectedSections[0] || null;

  function setLayout(next: LayoutNode, keepPreset = false) {
    onChange({ layout: next, ...(keepPreset ? {} : { preset: "" }) } as Partial<V>);
  }

  function select(path: number[], additive: boolean) {
    setSelected((current) => {
      if (!additive) return [path];
      const exists = current.some((item) => samePath(item, path));
      const next = exists ? current.filter((item) => !samePath(item, path)) : [...current, path];
      return next.length ? next : [path];
    });
    options.onSelect?.();
  }

  function applyLeaf(leaf: LayoutLeaf) {
    let next = value.layout;
    for (const section of selectedSections) next = updateLeaf(next, section.path, { op: leaf.op, hinge: leaf.hinge as Hinge | undefined });
    setLayout(next);
  }

  function toggleFrost(on: boolean) {
    let next = value.layout;
    for (const section of selectedSections) {
      const glazing = { ...(section.node.glazing || {}) };
      if (on) glazing.frost_tint = true;
      else delete glazing.frost_tint;
      next = updateLeaf(next, section.path, { glazing: Object.keys(glazing).length ? glazing : undefined });
    }
    setLayout(next, true);
  }

  // Inch divisions keep their proportions when the overall size changes.
  function resize(axis: "cols" | "rows", next: NumericInputValue) {
    const previous = Number(axis === "cols" ? value.width : value.height);
    const patch = (axis === "cols" ? { width: next } : { height: next }) as Partial<V>;
    if (next !== "" && previous > 0) (patch as Partial<LayoutValue>).layout = scaleLayout(value.layout, axis, Number(next) / previous);
    onChange(patch);
  }

  function onJointDrag(joint: ResolvedJoint, pos: number, phase: "move" | "end") {
    const { sizes, snapped, pair } = dragJoint(joint, pos);
    const next = setDivisionSizes(value.layout, joint.splitPath, sizes);
    if (phase === "move") {
      setPreview(next);
      setDragLabel(`${fmtInches(pair[0])}″ · ${fmtInches(pair[1])}″${snapped ? `  (${snapped})` : ""}`);
    } else {
      setPreview(null);
      setDragLabel(null);
      setLayout(next, true);
    }
  }

  return { layout, resolved, error, selected, setSelected, selectedSections, primary, setLayout, select, applyLeaf, toggleFrost, resize, onJointDrag, dragLabel };
}

export type LayoutEditor = ReturnType<typeof useLayoutEditor>;

export function PresetGrid({ groups, activeId, colour, onPick }: { groups: Array<{ label: string; presets: LayoutPreset[] }>; activeId: string; colour: string; onPick: (preset: LayoutPreset) => void }) {
  return (
    <div className="space-y-5">
      {groups.filter((group) => group.presets.length).map((group) => (
        <div key={group.label}>
          <SectionTitle>{group.label}</SectionTitle>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {group.presets.map((preset) => (
              <OptionCard key={preset.id} active={activeId === preset.id} onClick={() => onPick(preset)} className="flex flex-col items-center p-3">
                <span className="flex h-24 w-full items-center justify-center">
                  <WindowUnitDrawing layout={preset.layout} width={preset.width} height={preset.height} colour={colour} size={84} showDimensions={false} showIndexes={false} />
                </span>
                <span className="mt-2 text-center text-xs font-semibold leading-tight text-slate-800">{preset.label}</span>
                {preset.code ? <span className="mt-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{preset.code}</span> : null}
              </OptionCard>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Which section is selected, and the product palette for it. */
export function SectionPalette({ editor, operations, colour, seriesNote, tools, frost = true, noun = "section" }: { editor: LayoutEditor; operations: Set<WindowOperation>; colour: string; seriesNote?: string; tools?: ReactNode; frost?: boolean; noun?: string }) {
  const { resolved, selectedSections, primary } = editor;
  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-brand-50/70 px-4 py-3 text-sm text-brand-900">
        {selectedSections.length > 1
          ? <><b>{selectedSections.length} {noun}s selected</b> ({selectedSections.map((s) => s.index).join(", ")}). A choice below applies to all of them.</>
          : primary ? <><b className="capitalize">{noun} {primary.index}</b> · {fmtInches(primary.width)}″ × {fmtInches(primary.height)}″ — click the drawing to pick another, Shift-click to select several.</> : "Click a section on the drawing."}
        {resolved && resolved.sections.length > 1 ? (
          <button type="button" className="ml-2 font-semibold text-brand-700 underline-offset-2 hover:underline" onClick={() => editor.setSelected(resolved.sections.map((s) => s.path))}>Select all</button>
        ) : null}
      </div>

      <div>
        <SectionTitle>{noun === "lite" ? "Lite type" : "Section type"}</SectionTitle>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {PALETTE.filter((item) => operations.has(item.leaf.op)).map((item) => {
            const active = selectedSections.length > 0 && selectedSections.every((section) => sameLeaf(section.node, item.leaf));
            return (
              <OptionCard key={item.key} active={active} onClick={() => editor.applyLeaf(item.leaf)} className="flex flex-col items-center p-2">
                <span className="flex h-16 items-center"><WindowUnitDrawing layout={item.leaf} width={28} height={40} colour={colour} size={56} showDimensions={false} /></span>
                <span className="mt-1 text-center text-[11px] font-semibold leading-tight text-slate-700">{item.label}</span>
              </OptionCard>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">Hinge sides are as seen from outside. {seriesNote || ""}</p>
      </div>

      {tools}

      {frost ? (
        <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          <input type="checkbox" className="h-4 w-4" checked={selectedSections.length > 0 && selectedSections.every((s) => s.node.glazing?.frost_tint)} onChange={(event) => editor.toggleFrost(event.target.checked)} />
          <span><b>Frosted / tinted glass</b> in the selected {noun}{selectedSections.length > 1 ? "s" : ""} only — for bathrooms and privacy.</span>
        </label>
      ) : null}
    </div>
  );
}

/** Every division in the tree with its sizes, ratio shortcuts and a total. */
export function DivisionEditor({ editor, layout, labelFor }: { editor: LayoutEditor; layout: LayoutNode; labelFor?: (split: "cols" | "rows", span: string) => string }) {
  const [sizeDrafts, setSizeDrafts] = useState<Record<string, string>>({});
  useEffect(() => setSizeDrafts({}), [layout]);
  const { resolved } = editor;

  const divisions = useMemo(() => {
    if (!resolved) return [];
    const out: Array<{ path: number[]; node: Extract<LayoutNode, { split: string }>; total: number; label: string }> = [];
    const walk = (node: LayoutNode, path: number[]) => {
      if (!isSplit(node)) return;
      const inside = resolved.sections.filter((section) => path.every((v, i) => section.path[i] === v));
      const extent = node.split === "cols"
        ? Math.max(...inside.map((s) => s.x + s.width)) - Math.min(...inside.map((s) => s.x))
        : Math.max(...inside.map((s) => s.y + s.height)) - Math.min(...inside.map((s) => s.y));
      const indexes = inside.map((s) => s.index);
      const span = indexes.length === resolved.sections.length ? "whole unit" : `sections ${Math.min(...indexes)}–${Math.max(...indexes)}`;
      out.push({ path, node, total: extent, label: labelFor ? labelFor(node.split, span) : `${node.split === "cols" ? "Widths across" : "Heights, top to bottom"} · ${span}` });
      node.children.forEach((child, i) => walk(child, [...path, i]));
    };
    walk(layout, []);
    return out;
  }, [labelFor, layout, resolved]);

  if (!divisions.length) return <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">A single window has no divisions. Split it in the Sections step to add mullions.</p>;

  return (
    <div className="space-y-3">
      <SectionTitle note="or drag the blue handles on the drawing">Divisions</SectionTitle>
      {divisions.map(({ path, node, total, label }) => {
        const key = path.join(".") || "root";
        let resolvedSizes: number[] | null = null;
        try { resolvedSizes = resolveSizes(node.sizes, node.children.length, total); } catch { resolvedSizes = null; }
        const raw: DivisionSize[] = node.sizes && node.sizes.length === node.children.length ? node.sizes : node.children.map(() => "*");
        const ratios: Array<[string, DivisionSize[]]> = node.children.length === 2
          ? [["Equal", ["*", "*"]], ["1/3 · 2/3", ["1/3", "*"]], ["2/3 · 1/3", ["2/3", "*"]], ["1/4 · 3/4", ["1/4", "*"]], ["3/4 · 1/4", ["3/4", "*"]]]
          : node.children.length === 3 ? [["Equal", ["*", "*", "*"]], ["1/4 · 1/2 · 1/4", ["1/4", "1/2", "*"]]] : [["Equal", node.children.map(() => "*")]];
        return (
          <div key={key} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-800">{label}</p>
              <span className="text-xs text-slate-500">{fmtInches(total)}″ total</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {raw.map((item, index) => {
                const draftKey = `${key}:${index}`;
                return (
                  <span key={draftKey} className="flex items-center gap-1.5">
                    {index ? <span className="text-slate-300">|</span> : null}
                    <input
                      className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-center text-sm font-semibold tabular-nums focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                      aria-label={`${node.split === "cols" ? "Width" : "Height"} of part ${index + 1}`}
                      value={sizeDrafts[draftKey] ?? (typeof item === "number" ? fmtInches(item) : String(item))}
                      onChange={(event) => setSizeDrafts((current) => ({ ...current, [draftKey]: event.target.value }))}
                      onBlur={(event) => {
                        const text = event.target.value.trim();
                        const parsed = parseInches(text);
                        const entry: DivisionSize = Number.isFinite(parsed) && !text.includes("%") && !/^\d+\/\d+$/.test(text) ? parsed : text;
                        editor.setLayout(setDivisionSizes(layout, path, raw.map((v, i) => (i === index ? entry : v))), true);
                      }}
                      onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }}
                    />
                  </span>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">{resolvedSizes ? `= ${resolvedSizes.map((v) => `${fmtInches(v)}″`).join(" : ")}` : "These sizes don't fit the total."} · inches, a share (1/3, 25%) or * for the rest</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {ratios.map(([ratioLabel, sizes]) => (
                <button key={ratioLabel} type="button" className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:border-brand-300 hover:bg-brand-50" onClick={() => editor.setLayout(setDivisionSizes(layout, path, sizes), true)}>{ratioLabel}</button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The big interactive drawing plus the section chips under it (not a component: two slots). */
export function layoutDrawing(editor: LayoutEditor, value: LayoutValue, noun = "section"): { drawing: ReactNode; chips: ReactNode } {
  const { resolved, layout, selected, dragLabel } = editor;
  return {
    drawing: (
      <WindowUnitDrawing
        layout={layout}
        width={value.width}
        height={value.height}
        colour={value.colour_ext}
        selectedPaths={selected}
        onSelect={editor.select}
        onJointDrag={editor.onJointDrag}
        dragLabel={dragLabel}
        size={420}
        showDivisions
      />
    ),
    chips: resolved && resolved.sections.length > 1 ? (
      <div className="mt-4 flex flex-wrap gap-1.5">
        {resolved.sections.map((section) => {
          const active = selected.some((path) => samePath(path, section.path));
          return (
            <button key={section.path.join(".")} type="button" aria-label={`${noun} ${section.index}`} onClick={(event) => editor.select(section.path, event.shiftKey || event.metaKey || event.ctrlKey)} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${active ? "border-brand-500 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-brand-300"}`}>
              {section.index} · {sectionLabel(section.node)} · {fmtInches(section.width)}×{fmtInches(section.height)}
            </button>
          );
        })}
      </div>
    ) : null,
  };
}

export { leafCount, OPERATION_LABELS };
