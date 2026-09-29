"use client";

import { useId } from "react";
import type { DoorDrawingGeometry } from "@/lib/api";

/**
 * Elevation drawing of an entrance door opening, viewed from outside: frame,
 * sidelites, transom, slab(s) with their panel style and glass lite, hinges,
 * handle and sill. Everything is in inches so glass sizes like 22x36 land
 * where they would on the real slab.
 */

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

function LiteShape({ lite, id, family, ox, oy }: { lite: Lite; id: string; family?: string; ox: number; oy: number }) {
  const fill = family === "decorative" || family === "specialty" ? `url(#${id}-deco)` : family === "blinds" ? `url(#${id}-blinds)` : `url(#${id}-g)`;
  const x = ox + lite.x;
  const y = oy + lite.y;
  const common = { fill, stroke: "#475569", strokeWidth: 0.6 };
  const grid = family === "grills" || family === "sdl";
  return (
    <g>
      {lite.shape === "half" ? <path d={`M${x} ${y + lite.h} a${lite.w / 2} ${lite.h} 0 0 1 ${lite.w} 0 z`} {...common} /> : lite.shape === "oval" ? <ellipse cx={x + lite.w / 2} cy={y + lite.h / 2} rx={lite.w / 2} ry={lite.h / 2} {...common} /> : <rect x={x} y={y} width={lite.w} height={lite.h} {...common} />}
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

export type DoorDrawingProps = {
  doors: number;
  sidelites: number;
  transom: boolean;
  width: number;
  heightIn: number;
  model?: string;
  doorGlass?: GlassSpec;
  sideliteGlass?: Array<GlassSpec | null>;
  transomGlass?: string;
  slabColour: string;
  frameColour: string;
  lock?: "double_bore" | "multipoint";
  size?: number;
  showDimensions?: boolean;
  heightLabel?: string;
};

export default function DoorDrawing({ doors, sidelites, transom, width, heightIn, model = "", doorGlass, sideliteGlass = [], transomGlass, slabColour, frameColour, lock, size = 360, showDimensions = true, heightLabel }: DoorDrawingProps) {
  const frame = 2;
  const mull = 1.5;
  const sideW = 14;
  const transomH = transom ? 14 : 0;
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
          <rect x={frame + 2} y={frame + 2} width={innerW - 4} height={transomH - 4} fill={transomGlass ? `url(#${id}-t-${transomGlass.includes("decorative") || transomGlass.includes("wrought") ? "deco" : "g"})` : "#e2e8f0"} stroke="#475569" strokeWidth={0.5} />
        </g>
      ) : null}
      {parts.map((part) => {
        if (part.kind === "sidelite") {
          const glass = sideliteGlass[part.index];
          const lites = glass ? glassLites(glass.size, part.w, heightIn, true) : [];
          return (
            <g key={`s${part.index}`}>
              <rect x={part.x} y={doorTop} width={part.w} height={heightIn} fill={slabColour} stroke="#334155" strokeWidth={0.4} />
              {lites.map((lite, i) => <LiteShape key={i} lite={lite} id={`${id}-s`} family={glass?.family} ox={part.x} oy={doorTop} />)}
              {!lites.length ? <rect x={part.x + 3} y={doorTop + 6} width={part.w - 6} height={heightIn - 12} fill="none" stroke={shade(slabColour, -30)} strokeWidth={0.5} /> : null}
            </g>
          );
        }
        const lites = doorGlass ? glassLites(doorGlass.size, part.w, heightIn) : [];
        const panels = panelRects(model, part.w, heightIn, lites);
        const hingeLeft = doors === 2 ? part.index === 0 : true;
        const handleX = hingeLeft ? part.x + part.w - 3.2 : part.x + 3.2;
        const hingeX = hingeLeft ? part.x + 0.2 : part.x + part.w - 1.2;
        return (
          <g key={`d${part.index}`}>
            <rect x={part.x} y={doorTop} width={part.w} height={heightIn} fill={slabColour} stroke="#1e293b" strokeWidth={0.5} />
            {panels.map((panel, i) => (
              <g key={i}>
                <rect x={part.x + panel.x} y={doorTop + panel.y} width={panel.w} height={panel.h} fill={shade(slabColour, -12)} rx={0.5} />
                <rect x={part.x + panel.x + 1.2} y={doorTop + panel.y + 1.2} width={panel.w - 2.4} height={panel.h - 2.4} fill={shade(slabColour, 8)} rx={0.4} />
              </g>
            ))}
            {lites.map((lite, i) => <LiteShape key={i} lite={lite} id={id} family={doorGlass?.family} ox={part.x} oy={doorTop} />)}
            {[0.15, 0.5, 0.85].map((f) => <rect key={f} x={hingeX} y={doorTop + heightIn * f - 2} width={1} height={4} fill="#111827" />)}
            {doors === 2 && part.index === 1 ? null : lock === "multipoint" ? (
              <g>
                <rect x={handleX - 0.6} y={doorTop + heightIn * 0.44} width={1.2} height={9} rx={0.5} fill="#111827" />
                <rect x={hingeLeft ? handleX - 3.6 : handleX - 0.2} y={doorTop + heightIn * 0.44 + 2} width={3.8} height={0.9} rx={0.4} fill="#111827" />
              </g>
            ) : (
              <g>
                <circle cx={handleX} cy={doorTop + heightIn * 0.48} r={1.2} fill="#111827" />
                <circle cx={handleX} cy={doorTop + heightIn * 0.42} r={0.8} fill="#111827" />
              </g>
            )}
            {doors === 2 && part.index === 1 ? <rect x={part.x - 0.6} y={doorTop} width={1.2} height={heightIn} fill={shade(slabColour, -35)} /> : null}
          </g>
        );
      })}
      {/* Sill */}
      <rect x={-1} y={doorTop + heightIn} width={totalW + 2} height={1.5} fill="#111827" />
      {showDimensions ? (
        <g fontSize={3.4} fill="#475569" fontFamily="ui-sans-serif, system-ui" textAnchor="middle">
          <line x1={parts.find((p) => p.kind === "door")!.x} y1={totalH + 4} x2={parts.find((p) => p.kind === "door")!.x + width} y2={totalH + 4} stroke="#94a3b8" strokeWidth={0.3} />
          <text x={parts.find((p) => p.kind === "door")!.x + width / 2} y={totalH + 7.8}>{`${width}" slab`}</text>
          <text x={-5} y={doorTop + heightIn / 2} transform={`rotate(-90 ${-5} ${doorTop + heightIn / 2})`}>{heightLabel || `${heightIn}"`}</text>
        </g>
      ) : null}
    </svg>
  );
}

/** Draw a door from the geometry the server attaches to estimate openings. */
export function DoorGeometryDrawing({ geometry, size = 110, title }: { geometry: DoorDrawingGeometry; size?: number; title?: string }) {
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
        doorGlass={geometry.door_glass || null}
        sideliteGlass={geometry.sidelite_glass || []}
        transomGlass={geometry.transom_glass || undefined}
        slabColour={geometry.slab_colour}
        frameColour={geometry.frame_colour}
        lock={geometry.lock || undefined}
        size={size}
        showDimensions={false}
      />
    </span>
  );
}
