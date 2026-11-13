"use client";

import { useId } from "react";
import type { DoorDrawingGeometry } from "@/lib/api";
import { palmaHex } from "@/lib/palmaColours";
import { fmtInches } from "@/lib/windowLayout";
import { brightness, GROOVE_IN, INLAY_IN, insetPanel, panelOutline, panelTop, SLOT_IN, TAPER_IN, withoutGlass, type FaceElement, type FacePanel } from "@/lib/doorFaces";

/**
 * Elevation drawing of an entrance door opening, viewed from outside: frame,
 * sidelites, transom, slab(s) with their panel style and glass lite, hinges,
 * handle and sill. Everything is in inches so glass sizes like 22x36 land
 * where they would on the real slab.
 */

// Swatches for colour names saved before the Palma lists (lib/palmaColours.ts).
const PAINT_HEX: Record<string, string> = {
  white: "#f8fafc",
  "factory white": "#f8fafc",
  black: "#1f2328",
  "iron ore": "#3d3f42",
  charcoal: "#36454f",
  "commercial brown": "#4b3621",
  sandtone: "#c9b48a",
  "forest green": "#244a33",
  "barn red": "#7c231c",
  navy: "#1f2a44",
};
const STAIN_HEX: Record<string, string> = {
  "light oak": "#c8a165",
  honey: "#b8792f",
  "medium oak": "#9a6a36",
  walnut: "#5d3a1a",
  mahogany: "#6b2e1f",
  espresso: "#3b2a20",
  ebony: "#2a211c",
};

export function finishHex(type?: string, colour?: string): string {
  const key = (colour || "").trim().toLowerCase();
  if (type === "white" || !type) return PAINT_HEX.white;
  const palma = palmaHex(type, colour);
  if (palma) return palma;
  if (type === "stained") return STAIN_HEX[key] || STAIN_HEX["medium oak"];
  if (PAINT_HEX[key]) return PAINT_HEX[key];
  if (!key) return "#64748b";
  // Unknown custom colour: a stable muted tone so the drawing still reads.
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return `hsl(${hash} 25% 40%)`;
}

function shade(hex: string, amount: number) {
  if (!hex.startsWith("#")) return hex;
  const value = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.max(0, Math.min(255, ((value >> shift) & 255) + amount));
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

type GlassSpec = { size?: string; family?: string } | null;

type Lite = { x: number; y: number; w: number; h: number; shape: "rect" | "half" | "oval" };

/** Parse "22x36", "08x36 (x2)", "22x12 (x4)", "Half-Moon", "Oval 3/4" into lites on a slab. */
export function glassLites(size: string | undefined, slabW: number, slabH: number, sidelite = false): Lite[] {
  if (!size) return [];
  const text = size.toLowerCase();
  if (text.includes("half")) {
    const w = Math.min(22, slabW - 8);
    return [{ x: (slabW - w) / 2, y: 8, w, h: w / 2, shape: "half" }];
  }
  if (text.includes("oval")) {
    const w = Math.min(20, slabW - 10);
    return [{ x: (slabW - w) / 2, y: 8, w, h: slabH * 0.55, shape: "oval" }];
  }
  if (text.includes("up to") || /\d+(\.\d+)?"-/.test(text)) {
    // Direct-glazed sidelite: glass fills the panel.
    return [{ x: 3, y: 3, w: slabW - 6, h: slabH - 6, shape: "rect" }];
  }
  const match = text.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/);
  if (!match) return [];
  let w = Math.min(parseFloat(match[1]), slabW - 5);
  let h = Math.min(parseFloat(match[2]), slabH - 10);
  const count = Number(text.match(/\(x(\d)\)/)?.[1] || 1);
  if (sidelite) w = Math.min(w, slabW - 4);
  const top = h >= slabH - 20 ? (slabH - h) / 2 : Math.max(6, slabH * 0.1);
  if (count <= 1) return [{ x: (slabW - w) / 2, y: top, w, h, shape: "rect" }];
  if (w < 12) {
    // Narrow lites side by side (08x36 (x2), 07x64 (x2)).
    const gap = 3;
    const total = count * w + (count - 1) * gap;
    return Array.from({ length: count }, (_, i) => ({ x: (slabW - total) / 2 + i * (w + gap), y: top, w, h, shape: "rect" as const }));
  }
  // Stacked lites (22x12 (x4), 08x08 (x5)).
  const gap = 2.5;
  h = Math.min(h, (slabH - 16 - gap * (count - 1)) / count);
  w = Math.min(w, slabW - 5);
  return Array.from({ length: count }, (_, i) => ({ x: (slabW - w) / 2, y: top + i * (h + gap), w, h, shape: "rect" as const }));
}

function panelRects(model: string, slabW: number, slabH: number, lites: Lite[]) {
  const label = model.toLowerCase();
  const inset = 4;
  const glassBottom = lites.length ? Math.max(...lites.map((lite) => lite.y + lite.h)) : 0;
  const top = lites.length ? glassBottom + 4 : inset + 2;
  const available = slabH - top - inset - 2;
  if (/flush|contemporary|plank|grooved|teak/.test(label) || available < 10) return [];
  let cols = 2;
  let rows = /6-panel|6 panel|6-lite/.test(label) ? 3 : /4-panel|4 panel/.test(label) ? 2 : /3.?panel|craftsman/.test(label) ? 3 : /2.?panel|london|orleans|soho|sydney|victoria|shaker/.test(label) ? 1 : 2;
  if (/3.?panel|craftsman|shaker|era|tao|oso|vog|linea/.test(label)) cols = 1;
  if (lites.length) rows = Math.max(1, Math.min(rows, Math.round(available / 22)));
  const gap = 3;
  const w = (slabW - inset * 2 - gap * (cols - 1)) / cols;
  const h = (available - gap * (rows - 1)) / rows;
  const rects = [];
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) rects.push({ x: inset + c * (w + gap), y: top + r * (h + gap), w, h });
  return rects;
}

function GlassFill({ id, family }: { id: string; family?: string }) {
  const frosted = family === "sandblast" || family === "obscure";
  return (
    <defs>
      <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={frosted ? "#f1f5f9" : "#e0f2fe"} />
        <stop offset="1" stopColor={frosted ? "#cbd5e1" : "#7dd3fc"} />
      </linearGradient>
      <pattern id={`${id}-deco`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="4" height="4" fill={`url(#${id}-g)`} />
        <line x1="0" y1="0" x2="0" y2="4" stroke="#0369a1" strokeWidth="0.5" opacity="0.55" />
      </pattern>
      <pattern id={`${id}-blinds`} width="2" height="2" patternUnits="userSpaceOnUse">
        <rect width="2" height="2" fill={`url(#${id}-g)`} />
        <line x1="0" y1="1.6" x2="2" y2="1.6" stroke="#f8fafc" strokeWidth="0.7" />
      </pattern>
    </defs>
  );
}

/** The moulded frame round a glass insert, the lattice spacing and border of decorative glass (as estimate_documents.py). */
const GLASS_FRAME_IN = 1.1;
const GLASS_LATTICE_IN = 4;
const GLASS_BORDER_IN = 1.2;

/** Decorative glass: both diagonals every `spacing` inches across a pane's box (the pane's clip path trims them). */
function latticeLines(x0: number, y0: number, w: number, h: number, spacing: number) {
  const out: Array<[number, number, number, number]> = [];
  for (const direction of [1, -1]) {
    const corners = [y0 - direction * x0, y0 + h - direction * x0, y0 - direction * (x0 + w), y0 + h - direction * (x0 + w)];
    for (let c = Math.floor(Math.min(...corners) / spacing) * spacing; c <= Math.max(...corners); c += spacing) {
      out.push([x0 - w, direction * (x0 - w) + c, x0 + 2 * w, direction * (x0 + 2 * w) + c]);
    }
  }
  return out;
}

function LiteShape({ lite, id, family, ox, oy, slabColour, framed = true }: { lite: Lite; id: string; family?: string; ox: number; oy: number; slabColour: string; framed?: boolean }) {
  const fill = family === "blinds" ? `url(#${id}-blinds)` : `url(#${id}-g)`;
  const x = ox + lite.x;
  const y = oy + lite.y;
  const common = { fill, stroke: "#475569", strokeWidth: 0.3 };
  const grid = family === "grills" || family === "sdl";
  const dark = brightness(slabColour) < 0.35;
  const clip = `${id}-clip-${Math.round(x * 10)}-${Math.round(y * 10)}`;
  const shape = (inflate: number, props: Record<string, unknown>) => lite.shape === "half"
    ? <path d={`M${x - inflate} ${y + lite.h + inflate} a${lite.w / 2 + inflate} ${lite.h + inflate} 0 0 1 ${lite.w + 2 * inflate} 0 z`} {...props} />
    : lite.shape === "oval"
      ? <ellipse cx={x + lite.w / 2} cy={y + lite.h / 2} rx={lite.w / 2 + inflate} ry={lite.h / 2 + inflate} {...props} />
      : <rect x={x - inflate} y={y - inflate} width={lite.w + 2 * inflate} height={lite.h + 2 * inflate} {...props} />;
  const pattern = "#0369a1";
  return (
    <g>
      {framed ? shape(GLASS_FRAME_IN, { fill: shade(slabColour, dark ? 26 : -16), stroke: shade(slabColour, dark ? 55 : -50), strokeWidth: 0.25 }) : null}
      <defs><clipPath id={clip}>{shape(0, {})}</clipPath></defs>
      {shape(0, common)}
      <g clipPath={`url(#${clip})`}>
        {lite.shape === "rect" ? (
          // A sheen across the glass (as the PDF's pane()).
          <polygon points={[[x + lite.w * 0.18, y], [x + lite.w * 0.42, y], [x + lite.w * 0.42 - lite.h * 0.45, y + lite.h], [x + lite.w * 0.18 - lite.h * 0.45, y + lite.h]].map((p) => p.join(",")).join(" ")} fill="#ffffff" opacity={0.45} />
        ) : null}
        {(family === "decorative" || family === "specialty") && lite.shape !== "half" ? (
          <g stroke={pattern} strokeWidth={0.15} opacity={0.5}>
            {latticeLines(x, y, lite.w, lite.h, GLASS_LATTICE_IN).map(([x1, y1, x2, y2], i) => <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />)}
          </g>
        ) : null}
      </g>
      {(family === "decorative" || family === "specialty") && lite.shape === "rect" && lite.w > 6 && lite.h > 6 ? (
        <rect x={x + GLASS_BORDER_IN} y={y + GLASS_BORDER_IN} width={lite.w - 2 * GLASS_BORDER_IN} height={lite.h - 2 * GLASS_BORDER_IN} fill="none" stroke={pattern} strokeWidth={0.15} opacity={0.6} />
      ) : null}
      {grid && lite.shape === "rect" ? (
        <g stroke="#f8fafc" strokeWidth={0.8}>
          <line x1={x + lite.w / 2} y1={y} x2={x + lite.w / 2} y2={y + lite.h} />
          {Array.from({ length: Math.max(1, Math.round(lite.h / 12) - 1) }, (_, i) => {
            const ly = y + ((i + 1) * lite.h) / Math.max(2, Math.round(lite.h / 12));
            return <line key={i} x1={x} y1={ly} x2={x + lite.w} y2={ly} />;
          })}
        </g>
      ) : null}
      {family === "vented" && lite.shape === "rect" ? <line x1={x} y1={y + lite.h / 2} x2={x + lite.w} y2={y + lite.h / 2} stroke="#334155" strokeWidth={0.9} /> : null}
    </g>
  );
}

/** A repeatable 0..1 number per index (_hash01() in estimate_documents.py). */
function hash01(index: number) {
  const value = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

/** Wood grain on a stained part: fine, slightly wavy lines about every 1.6" (grain() in estimate_documents.py). */
function Grain({ ox, oy, w, h, slabColour }: { ox: number; oy: number; w: number; h: number; slabColour: string }) {
  const count = Math.floor(w / 1.6);
  const rows: number[] = [];
  for (let y = 0; y < Math.floor(h); y += 4) rows.push(y);
  rows.push(h);
  const stroke = shade(slabColour, brightness(slabColour) < 0.35 ? 14 : -16);
  const lines: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const gx = ((i + 0.5) * w) / Math.max(count, 1) + (hash01(i) - 0.5) * 0.8;
    if (gx <= 0.4 || gx >= w - 0.4) continue;
    lines.push(rows.map((gy) => `${ox + gx + 0.3 * Math.sin(gy / 7 + lines.length * 1.7)},${oy + gy}`).join(" "));
  }
  return <g fill="none" stroke={stroke} strokeWidth={0.12}>{lines.map((points, i) => <polyline key={i} points={points} />)}</g>;
}

export type DoorDrawingProps = {
  doors: number;
  sidelites: number;
  transom: boolean;
  width: number;
  heightIn: number;
  model?: string;
  /** The slab's face from lib/doorFaces.ts (doorFace(...).elements); without it the drawing guesses generic panels from the model name. */
  face?: FaceElement[] | null;
  doorGlass?: GlassSpec;
  sideliteGlass?: Array<GlassSpec | null>;
  transomGlass?: string;
  slabColour: string;
  frameColour: string;
  lock?: "double_bore" | "multipoint" | "pull_bar";
  /** Pull bar length in inches; drawn to scale when the lock is a pull bar. */
  pullBarIn?: number;
  /** Each sidelite's width in inches (default 14"). */
  sideliteWidth?: number;
  /** The transom glass height in inches (default 14"). */
  transomHeight?: number;
  size?: number;
  showDimensions?: boolean;
  heightLabel?: string;
  /** Sidelite width and transom height to label (only sizes the rep set; an assumed size gets no dimension line). */
  sideliteLabelIn?: number | null;
  transomLabelIn?: number | null;
  /** Each sidelite's own panels (sidelite_face / sideliteFace()); absent on snapshots priced before them. */
  sideliteFaces?: Array<FaceElement[] | null>;
  /** Stained finishes: draw a wood grain. */
  grain?: boolean;
};

/** 10.5 -> 10-1/2" (as the custom door estimates and the PDF's _inch_label write sizes). */
function inchLabel(value: number): string {
  return `${fmtInches(value).replace(" ", "-")}"`;
}

export default function DoorDrawing({ doors, sidelites, transom, width, heightIn, model = "", face, doorGlass, sideliteGlass = [], transomGlass, slabColour, frameColour, lock, pullBarIn, sideliteWidth, transomHeight, size = 360, showDimensions = true, heightLabel, sideliteLabelIn, transomLabelIn, sideliteFaces, grain = false }: DoorDrawingProps) {
  const frame = 2;
  const mull = 1.5;
  const sideW = sideliteWidth && sideliteWidth > 0 ? sideliteWidth : 14;
  const transomH = transom ? (transomHeight && transomHeight > 0 ? transomHeight : 14) : 0;
  const leftSidelites = sidelites === 2 ? 1 : sidelites;
  const rightSidelites = sidelites === 2 ? 1 : 0;
  const innerW = doors * width + sidelites * sideW + sidelites * mull;
  const totalW = innerW + frame * 2;
  const totalH = heightIn + transomH + (transom ? mull : 0) + frame + 1.5;
  const pad = showDimensions ? 9 : 2;
  // Several drawings share a page (model cards, estimates): keep gradient ids unique.
  const id = `door${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const scale = size / Math.max(totalW + pad * 2, totalH + pad * 2);
  const doorTop = frame + transomH + (transom ? mull : 0);
  const trim = shade(frameColour, -25);

  const parts: Array<{ kind: "sidelite" | "door"; x: number; w: number; index: number }> = [];
  let cursor = frame;
  for (let i = 0; i < leftSidelites; i += 1) {
    parts.push({ kind: "sidelite", x: cursor, w: sideW, index: i });
    cursor += sideW + mull;
  }
  for (let i = 0; i < doors; i += 1) {
    parts.push({ kind: "door", x: cursor, w: width, index: i });
    cursor += width;
  }
  for (let i = 0; i < rightSidelites; i += 1) {
    cursor += mull;
    parts.push({ kind: "sidelite", x: cursor, w: sideW, index: leftSidelites + i });
    cursor += sideW;
  }

  return (
    <svg viewBox={`${-pad} ${-pad} ${totalW + pad * 2} ${totalH + pad * 2}`} width={(totalW + pad * 2) * scale} height={(totalH + pad * 2) * scale} role="img" aria-label="Door elevation">
      <GlassFill id={id} family={doorGlass?.family} />
      <GlassFill id={`${id}-s`} family={sideliteGlass.find(Boolean)?.family} />
      <GlassFill id={`${id}-t`} family={transomGlass?.includes("decorative") || transomGlass?.includes("wrought") ? "decorative" : transomGlass?.includes("sandblast") ? "sandblast" : transomGlass?.includes("grill") || transomGlass?.includes("sdl") ? "grills" : "clear"} />
      {/* Brickmould + frame */}
      <rect x={-1.5} y={-1.5} width={totalW + 3} height={totalH + 1.5} rx={0.6} fill={trim} />
      <rect x={0} y={0} width={totalW} height={totalH} fill={frameColour} stroke="#334155" strokeWidth={0.4} />
      {transom ? (
        <g>
          <rect x={frame} y={frame} width={innerW} height={transomH} fill={shade(frameColour, -10)} />
          <LiteShape lite={{ x: frame + 2, y: frame + 2, w: innerW - 4, h: transomH - 4, shape: "rect" }} id={`${id}-t`} family={!transomGlass || transomGlass.includes("sandblast") ? "sandblast" : transomGlass.includes("decorative") || transomGlass.includes("wrought") ? "decorative" : transomGlass.includes("grill") || transomGlass.includes("sdl") ? "grills" : "clear"} ox={0} oy={0} slabColour={frameColour} framed={false} />
        </g>
      ) : null}
      {parts.map((part) => {
        if (part.kind === "sidelite") {
          const glass = sideliteGlass[part.index];
          const lites = glass ? glassLites(glass.size, part.w, heightIn, true) : [];
          return (
            <g key={`s${part.index}`}>
              <rect x={part.x} y={doorTop} width={part.w} height={heightIn} fill={slabColour} stroke="#334155" strokeWidth={0.4} />
              {grain ? <Grain ox={part.x} oy={doorTop} w={part.w} h={heightIn} slabColour={slabColour} /> : null}
              {sideliteFaces?.[part.index] ? <FaceShapes elements={withoutGlass(sideliteFaces[part.index]!, lites, part.w, heightIn)} ox={part.x} oy={doorTop} slabW={part.w} slabH={heightIn} slabColour={slabColour} /> : null}
              {lites.map((lite, i) => <LiteShape key={i} lite={lite} id={`${id}-s`} family={glass?.family} ox={part.x} oy={doorTop} slabColour={slabColour} />)}
              {!lites.length && !sideliteFaces ? <rect x={part.x + 3} y={doorTop + 6} width={part.w - 6} height={heightIn - 12} fill="none" stroke={shade(slabColour, -30)} strokeWidth={0.5} /> : null}
            </g>
          );
        }
        const lites = doorGlass ? glassLites(doorGlass.size, part.w, heightIn) : [];
        const panels = face ? [] : panelRects(model, part.w, heightIn, lites);
        const hingeLeft = doors === 2 ? part.index === 0 : true;
        const handleX = hingeLeft ? part.x + part.w - 3.2 : part.x + 3.2;
        const hingeX = hingeLeft ? part.x + 0.2 : part.x + part.w - 1.2;
        return (
          <g key={`d${part.index}`}>
            <rect x={part.x} y={doorTop} width={part.w} height={heightIn} fill={slabColour} stroke="#1e293b" strokeWidth={0.5} />
            {grain ? <Grain ox={part.x} oy={doorTop} w={part.w} h={heightIn} slabColour={slabColour} /> : null}
            {panels.map((panel, i) => (
              <g key={i}>
                <rect x={part.x + panel.x} y={doorTop + panel.y} width={panel.w} height={panel.h} fill={shade(slabColour, -12)} rx={0.5} />
                <rect x={part.x + panel.x + 1.2} y={doorTop + panel.y + 1.2} width={panel.w - 2.4} height={panel.h - 2.4} fill={shade(slabColour, 8)} rx={0.4} />
              </g>
            ))}
            {face ? <FaceShapes elements={withoutGlass(face, lites, part.w, heightIn)} ox={part.x} oy={doorTop} slabW={part.w} slabH={heightIn} slabColour={slabColour} /> : null}
            {lites.map((lite, i) => <LiteShape key={i} lite={lite} id={id} family={doorGlass?.family} ox={part.x} oy={doorTop} slabColour={slabColour} />)}
            {[0.15, 0.5, 0.85].map((f) => <rect key={f} x={hingeX} y={doorTop + heightIn * f - 2} width={1} height={4} fill="#111827" />)}
            {lock === "pull_bar" && pullBarIn ? (
              // To scale on the latch side, centred near handle height; a double's inactive leaf carries the dummy bar.
              <PullBar x={handleX} top={doorTop + pullBarTop(pullBarIn, heightIn)} length={Math.min(pullBarIn, heightIn - 8)} />
            ) : lock === "multipoint" || lock === "pull_bar" ? (
              // A double's inactive leaf carries the dummy handle, drawn like the active one.
              <g>
                <rect x={handleX - 0.6} y={doorTop + heightIn * 0.44} width={1.2} height={9} rx={0.5} fill="#111827" />
                <rect x={hingeLeft ? handleX - 3.6 : handleX - 0.2} y={doorTop + heightIn * 0.44 + 2} width={3.8} height={0.9} rx={0.4} fill="#111827" />
              </g>
            ) : (
              <g>
                <circle cx={handleX} cy={doorTop + heightIn * 0.48} r={1.2} fill="#111827" />
                {doors === 2 && part.index === 1 ? null : <circle cx={handleX} cy={doorTop + heightIn * 0.42} r={0.8} fill="#111827" />}
              </g>
            )}
            {doors === 2 && part.index === 1 ? <rect x={part.x - 0.6} y={doorTop} width={1.2} height={heightIn} fill={shade(slabColour, -35)} /> : null}
          </g>
        );
      })}
      {/* Sill */}
      <rect x={-1} y={doorTop + heightIn} width={totalW + 2} height={1.5} fill="#111827" />
      {showDimensions ? (
        // Each slab's (and a set sidelite's) width underneath, the door (and a set transom's) height up the left: as _with_dimensions() in services/estimate_documents.py.
        // About 10px whatever the size (a small estimate drawing would otherwise print 6px labels); 3.4" at the builder's size.
        <g fontSize={Math.min(5.5, Math.max(3.4, 10 / scale))} fill="#475569" fontFamily="ui-sans-serif, system-ui" textAnchor="middle">
          {parts.map((part) => (part.kind === "door" || sideliteLabelIn ? (
            <g key={`dim-${part.kind}-${part.index}`}>
              <DimensionLine from={part.x} to={part.x + part.w} at={totalH + 3.4} horizontal />
              <text x={part.x + part.w / 2} y={totalH + 7.8}>{part.kind === "door" ? inchLabel(width) : inchLabel(sideliteLabelIn!)}</text>
            </g>
          ) : null))}
          <DimensionLine from={doorTop} to={doorTop + heightIn} at={-3} />
          <text x={-5} y={doorTop + heightIn / 2} transform={`rotate(-90 ${-5} ${doorTop + heightIn / 2})`}>{heightLabel || inchLabel(heightIn)}</text>
          {transom && transomLabelIn ? (
            <>
              <DimensionLine from={frame} to={frame + transomH} at={-3} />
              <text x={-5} y={frame + transomH / 2} transform={`rotate(-90 ${-5} ${frame + transomH / 2})`}>{inchLabel(transomLabelIn)}</text>
            </>
          ) : null}
        </g>
      ) : null}
    </svg>
  );
}

/**
 * A slab face (lib/doorFaces.ts) in slab inches: raised panels (bevel + field),
 * flat Shaker panels, planks, grooves (recess + highlight), stainless inlays and
 * slots. Edges are lighter than a dark slab and darker than a light one so a
 * black door still shows its design. Mirrors _draw_face() in services/estimate_documents.py.
 */
/** A square raised panel's four bevel faces (top, left, bottom, right) in slab inches, with their tone index. */
function bevelQuads(outer: FacePanel, inner: FacePanel, slabW: number, slabH: number): Array<[Array<[number, number]>, number]> {
  const [ox, oy, ow, oh] = [outer.x * slabW, outer.y * slabH, outer.w * slabW, outer.h * slabH];
  const [ix, iy, iw, ih] = [inner.x * slabW, inner.y * slabH, inner.w * slabW, inner.h * slabH];
  return [
    [[[ox, oy], [ox + ow, oy], [ix + iw, iy], [ix, iy]], 0],
    [[[ox, oy], [ix, iy], [ix, iy + ih], [ox, oy + oh]], 1],
    [[[ox, oy + oh], [ix, iy + ih], [ix + iw, iy + ih], [ox + ow, oy + oh]], 2],
    [[[ox + ow, oy], [ox + ow, oy + oh], [ix + iw, iy + ih], [ix + iw, iy]], 3],
  ];
}

export function FaceShapes({ elements, ox, oy, slabW, slabH, slabColour }: { elements: FaceElement[]; ox: number; oy: number; slabW: number; slabH: number; slabColour: string }) {
  const dark = brightness(slabColour) < 0.35;
  const edge = shade(slabColour, dark ? 45 : -45);
  const bevel = shade(slabColour, dark ? 18 : -14);
  const recess = shade(slabColour, dark ? 8 : -6);
  const ink = shade(slabColour, dark ? 55 : -55);
  const shine = shade(slabColour, dark ? 22 : 30);
  const points = (outline: Array<[number, number]>) => outline.map(([x, y]) => `${ox + x},${oy + y}`).join(" ");
  return (
    <g>
      {elements.map((element, i) => {
        if (element.t === "p") {
          const raised = element.s !== "shaker";
          const square = (element.top ?? "square") === "square";
          const inner = insetPanel(element, raised ? 1.4 : 0.6, slabW, slabH);
          const bottom = oy + (inner.y + inner.h) * slabH;
          return (
            <g key={i}>
              {raised && square ? (
                // The bevel lit from the top left: light top and left faces, shaded bottom and right (as _draw_face()).
                <>
                  {bevelQuads(element, inner, slabW, slabH).map(([quad, tone], q) => (
                    <polygon key={q} points={quad.map(([x, y]) => `${ox + x},${oy + y}`).join(" ")} fill={shade(slabColour, dark ? [42, 26, -6, 2][tone] : [24, 10, -42, -26][tone])} />
                  ))}
                  <polygon points={points(panelOutline(element, slabW, slabH))} fill="none" stroke={edge} strokeWidth={0.2} />
                  <polygon points={points(panelOutline(inner, slabW, slabH))} fill={shade(slabColour, dark ? 4 : 6)} stroke={edge} strokeWidth={0.1} />
                </>
              ) : raised ? (
                <>
                  <polygon points={points(panelOutline(element, slabW, slabH))} fill={bevel} stroke={edge} strokeWidth={0.25} />
                  <polygon points={points(panelOutline(inner, slabW, slabH))} fill={slabColour} stroke={edge} strokeWidth={0.12} />
                </>
              ) : (
                <>
                  <polygon points={points(panelOutline(element, slabW, slabH))} fill={slabColour} stroke={edge} strokeWidth={0.3} />
                  <polygon points={points(panelOutline(inner, slabW, slabH))} fill={recess} />
                  {square ? (() => {
                    // A recessed field: shadow under the top and left edges, light on the bottom and right.
                    const ix = ox + inner.x * slabW, iy = oy + inner.y * slabH, iw = inner.w * slabW, ih = inner.h * slabH;
                    const dim = shade(slabColour, dark ? -4 : -34), glow = shade(slabColour, dark ? 30 : 18);
                    return (
                      <>
                        <line x1={ix} y1={iy + 0.2} x2={ix + iw} y2={iy + 0.2} stroke={dim} strokeWidth={0.4} />
                        <line x1={ix + 0.2} y1={iy} x2={ix + 0.2} y2={iy + ih} stroke={dim} strokeWidth={0.4} />
                        <line x1={ix} y1={iy + ih - 0.15} x2={ix + iw} y2={iy + ih - 0.15} stroke={glow} strokeWidth={0.3} />
                        <line x1={ix + iw - 0.15} y1={iy} x2={ix + iw - 0.15} y2={iy + ih} stroke={glow} strokeWidth={0.3} />
                      </>
                    );
                  })() : null}
                </>
              )}
              {(element.planks ?? []).map((x) => {
                const top = oy + panelTop(inner, x) * slabH;
                return (
                  <g key={x}>
                    <line x1={ox + x * slabW} y1={top} x2={ox + x * slabW} y2={bottom} stroke={edge} strokeWidth={0.25} />
                    <line x1={ox + x * slabW + 0.3} y1={top} x2={ox + x * slabW + 0.3} y2={bottom} stroke={shine} strokeWidth={0.12} />
                  </g>
                );
              })}
            </g>
          );
        }
        if (element.t === "slot") {
          return <rect key={i} x={ox + element.x * slabW} y={oy + element.y * slabH - SLOT_IN / 2} width={element.w * slabW} height={SLOT_IN} rx={SLOT_IN / 2} fill={ink} stroke={edge} strokeWidth={0.1} />;
        }
        const x1 = ox + element.x1 * slabW, x2 = ox + element.x2 * slabW;
        const y1 = oy + element.y1 * slabH, y2 = oy + element.y2 * slabH;
        if (element.t === "i") {
          return (
            <g key={i}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#64748b" strokeWidth={INLAY_IN + 0.15} />
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#e2e8f0" strokeWidth={INLAY_IN} />
            </g>
          );
        }
        if (element.taper) {
          const [thick, thin] = TAPER_IN;
          return <polygon key={i} points={`${x1},${y1 - thick / 2} ${x2},${y2 - thin / 2} ${x2},${y2 + thin / 2} ${x1},${y1 + thick / 2}`} fill={ink} />;
        }
        const across = Math.abs(y2 - y1) < Math.abs(x2 - x1);
        return (
          <g key={i}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={ink} strokeWidth={GROOVE_IN} />
            <line x1={x1 + (across ? 0 : 0.45)} y1={y1 + (across ? 0.45 : 0)} x2={x2 + (across ? 0 : 0.45)} y2={y2 + (across ? 0.45 : 0)} stroke={shine} strokeWidth={0.15} />
          </g>
        );
      })}
    </g>
  );
}

/** Top of a pull bar, inches below the slab top: centred ~42" off the floor, kept 4" inside the slab. */
export function pullBarTop(length: number, slabHeight: number) {
  const bar = Math.min(length, slabHeight - 8);
  let centre = Math.max(42, bar / 2 + 6);
  if (centre + bar / 2 > slabHeight - 4) centre = slabHeight - 4 - bar / 2;
  return slabHeight - (centre + bar / 2);
}

function PullBar({ x, top, length }: { x: number; top: number; length: number }) {
  return (
    <g>
      <rect x={x - 0.7} y={top} width={1.4} height={length} rx={0.7} fill="#111827" stroke="#cbd5e1" strokeWidth={0.3} />
      <rect x={x - 0.3} y={top + 1.5} width={0.6} height={1.2} fill="#475569" />
      <rect x={x - 0.3} y={top + length - 2.7} width={0.6} height={1.2} fill="#475569" />
    </g>
  );
}

/** Draw a door from the geometry the server attaches to estimate openings. */
/** A dimension line with end ticks, in drawing inches; vertical lines run down the left at x = at. */
function DimensionLine({ from, to, at, horizontal = false }: { from: number; to: number; at: number; horizontal?: boolean }) {
  const [a, b, tick] = [from + 0.4, to - 0.4, 1.1];
  return horizontal ? (
    <g stroke="#94a3b8" strokeWidth={0.3}>
      <line x1={a} y1={at} x2={b} y2={at} /><line x1={a} y1={at - tick} x2={a} y2={at + tick} /><line x1={b} y1={at - tick} x2={b} y2={at + tick} />
    </g>
  ) : (
    <g stroke="#94a3b8" strokeWidth={0.3}>
      <line x1={at} y1={a} x2={at} y2={b} /><line x1={at - tick} y1={a} x2={at + tick} y2={a} /><line x1={at - tick} y1={b} x2={at + tick} y2={b} />
    </g>
  );
}

/** `dimensions` labels the slab width and height, and the sidelite width / transom height when the rep set them. */
export function DoorGeometryDrawing({ geometry, size = 110, title, dimensions = false }: { geometry: DoorDrawingGeometry; size?: number; title?: string; dimensions?: boolean }) {
  return (
    <span className="inline-block" title={title}>
      <DoorDrawing
        doors={geometry.doors}
        sidelites={geometry.sidelites}
        transom={geometry.transom}
        width={geometry.slab_width ?? geometry.width}
        heightIn={geometry.slab_height ?? geometry.height}
        heightLabel={geometry.height_label}
        model={geometry.model}
        face={geometry.face?.elements}
        doorGlass={geometry.door_glass || null}
        sideliteGlass={geometry.sidelite_glass || []}
        transomGlass={geometry.transom_glass || undefined}
        slabColour={geometry.slab_colour}
        frameColour={geometry.frame_colour}
        lock={geometry.lock || undefined}
        pullBarIn={geometry.pull_bar_in ?? undefined}
        sideliteWidth={geometry.sidelite_width ?? undefined}
        transomHeight={geometry.transom_height ?? undefined}
        size={size}
        showDimensions={dimensions}
        sideliteLabelIn={geometry.sidelite_width_in}
        transomLabelIn={geometry.transom_height_in}
        sideliteFaces={geometry.sidelite_faces ? geometry.sidelite_faces.map((face) => face?.elements ?? null) : undefined}
        grain={Boolean(geometry.grain)}
      />
    </span>
  );
}
