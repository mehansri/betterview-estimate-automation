"use client";

import { PointerEvent as ReactPointerEvent, useId, useRef, useState } from "react";
import type { WindowDrawingGeometry } from "@/lib/api";
import {
  chainDimensions,
  fmtInches,
  LayoutNode,
  ResolvedJoint,
  ResolvedLayout,
  ResolvedSection,
  sectionLabel,
  tryResolveLayout,
} from "@/lib/windowLayout";

/** Exterior capstock colours: frame fill, its edge, and the sash tone. */
const FRAME_COLOURS: Record<string, { fill: string; edge: string; light: string }> = {
  white: { fill: "#f8fafc", edge: "#64748b", light: "#ffffff" },
  black: { fill: "#1f2328", edge: "#0b0d10", light: "#3a4048" },
  "dark bronze": { fill: "#4a3a2c", edge: "#2a2018", light: "#6a5644" },
  charcoal: { fill: "#3b4146", edge: "#23272a", light: "#555c62" },
  sandstone: { fill: "#d4c5a3", edge: "#8f8161", light: "#e6dbc2" },
  sandalwood: { fill: "#c9b48f", edge: "#877454", light: "#dccbaa" },
};

export const FRAME_SWATCHES = FRAME_COLOURS;

const INK = "#334155";
const SELECT = "#2563eb";

type Props = {
  layout?: LayoutNode;
  width?: number | string;
  height?: number | string;
  /** Pre-resolved geometry (estimate snapshots) instead of layout + size. */
  geometry?: WindowDrawingGeometry | null;
  /** Exterior colour name; the frame is drawn in it. */
  colour?: string;
  /** Selected sections (by tree path). */
  selectedPaths?: number[][];
  onSelect?: (path: number[], additive: boolean) => void;
  /** Dragging a mullion: live `move` events, then `end` to commit. */
  onJointDrag?: (joint: ResolvedJoint, pos: number, phase: "move" | "end") => void;
  /** Longest rendered side in px; the other follows the window's proportions. */
  size?: number;
  showDimensions?: boolean;
  /** Division chain dimensions along the bottom and right edges. */
  showDivisions?: boolean;
  showSectionSizes?: boolean;
  /** Section numbers on multi-section units (off for thumbnails). */
  showIndexes?: boolean;
  /** Text shown over the joint being dragged (e.g. "1/3"). */
  dragLabel?: string | null;
  title?: string;
};

function samePath(a: number[] | null | undefined, b: number[]) {
  return Boolean(a) && a!.length === b.length && a!.every((value, i) => value === b[i]);
}

function fromGeometry(geometry: WindowDrawingGeometry): ResolvedLayout {
  return {
    width: geometry.width,
    height: geometry.height,
    lines: [],
    sections: geometry.sections.map((section) => ({
      index: section.index,
      path: [section.index],
      x: section.x,
      y: section.y,
      width: section.width,
      height: section.height,
      node: { op: section.op, ...(section.hinge ? { hinge: section.hinge } : {}) },
    })),
  };
}

const OPERABLE = new Set(["casement", "awning", "single_slider", "double_slider", "single_hung", "double_hung"]);

/** Swing and slide marks, viewed from outside: swing lines meet at the hinge side. */
function OperationMarks({ section, box, u }: { section: ResolvedSection; box: { x: number; y: number; w: number; h: number }; u: number }) {
  const { x, y, w, h } = box;
  const { op, hinge } = section.node;
  const swing = { stroke: INK, strokeWidth: u * 0.28, strokeDasharray: `${u * 1.4} ${u * 0.9}`, fill: "none", opacity: 0.75 };
  const head = Math.min(w, h) * 0.1;
  const arrow = (x1: number, y1: number, x2: number, y2: number) => {
    const a = Math.atan2(y2 - y1, x2 - x1);
    return (
      <g stroke={INK} strokeWidth={u * 0.35} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.8}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} />
        <polyline points={`${x2 - head * Math.cos(a - 0.5)},${y2 - head * Math.sin(a - 0.5)} ${x2},${y2} ${x2 - head * Math.cos(a + 0.5)},${y2 - head * Math.sin(a + 0.5)}`} />
      </g>
    );
  };
  if (op === "casement") {
    return <polyline points={hinge === "right" ? `${x},${y} ${x + w},${y + h / 2} ${x},${y + h}` : `${x + w},${y} ${x},${y + h / 2} ${x + w},${y + h}`} {...swing} />;
  }
  if (op === "awning") return <polyline points={`${x},${y + h} ${x + w / 2},${y} ${x + w},${y + h}`} {...swing} />;
  if (op === "single_slider" || op === "double_slider") {
    const cy = y + h / 2;
    const leftMoves = op === "double_slider" || hinge !== "right";
    const rightMoves = op === "double_slider" || hinge === "right";
    return (
      <g>
        {leftMoves ? arrow(x + w * 0.12, cy, x + w * 0.38, cy) : null}
        {rightMoves ? arrow(x + w * 0.88, cy, x + w * 0.62, cy) : null}
      </g>
    );
  }
  if (op === "single_hung" || op === "double_hung") {
    const cx = x + w / 2;
    return (
      <g>
        {arrow(cx, y + h * 0.88, cx, y + h * 0.62)}
        {op === "double_hung" ? arrow(cx, y + h * 0.12, cx, y + h * 0.38) : null}
      </g>
    );
  }
  return null;
}

function Dimension({ x1, y1, x2, y2, label, u, vertical, font }: { x1: number; y1: number; x2: number; y2: number; label: string; u: number; vertical?: boolean; font: number }) {
  const tick = u * 1.2;
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const tx = vertical ? midX - u * 1.2 : midX;
  const ty = vertical ? midY : midY - u * 1.2;
  return (
    <g stroke="#64748b" strokeWidth={u * 0.22} fill="#475569">
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      {vertical ? (
        <>
          <line x1={x1 - tick} y1={y1} x2={x1 + tick} y2={y1} />
          <line x1={x2 - tick} y1={y2} x2={x2 + tick} y2={y2} />
        </>
      ) : (
        <>
          <line x1={x1} y1={y1 - tick} x2={x1} y2={y1 + tick} />
          <line x1={x2} y1={y2 - tick} x2={x2} y2={y2 + tick} />
        </>
      )}
      <text x={tx} y={ty} fontSize={font} textAnchor="middle" stroke="none" fontWeight={600} transform={vertical ? `rotate(-90 ${tx} ${ty})` : undefined}>
        {label}″
      </text>
    </g>
  );
}

export default function WindowUnitDrawing({
  layout,
  width,
  height,
  geometry,
  colour = "white",
  selectedPaths = [],
  onSelect,
  onJointDrag,
  size = 320,
  showDimensions = true,
  showDivisions = false,
  showSectionSizes = false,
  showIndexes = true,
  dragLabel = null,
  title,
}: Props) {
  const uid = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragging, setDragging] = useState<ResolvedJoint | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const { resolved, error } = geometry ? { resolved: fromGeometry(geometry), error: null } : tryResolveLayout(layout, width, height);
  if (!resolved) {
    return <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-900" style={{ maxWidth: size }}>{error}</div>;
  }

  const W = resolved.width;
  const H = resolved.height;
  const u = Math.max(W, H) / 100;
  const frameColour = FRAME_COLOURS[String(colour || "white").toLowerCase()] || FRAME_COLOURS.white;
  const frame = Math.min(Math.max(Math.min(W, H) * 0.045, 1.4), 2.6);
  const mullion = frame * 0.8;
  const sash = frame * 0.75;
  const font = u * 3.6;
  const chains = showDivisions ? chainDimensions(resolved) : { across: [], down: [] };
  const showAcross = chains.across.length > 1;
  const showDown = chains.down.length > 1;
  const top = showDimensions ? u * 10 : u * 1.5;
  const left = showDimensions ? u * 10 : u * 1.5;
  const bottom = showAcross ? u * 9 : u * 1.5;
  const right = showDown ? u * 9 : u * 1.5;
  const boxW = W + left + right;
  const boxH = H + top + bottom;
  const scale = size / Math.max(boxW, boxH);
  const multi = resolved.sections.length > 1;

  function toSvg(event: ReactPointerEvent) {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(matrix.inverse());
  }

  // A section's opening inside its cell: the outer frame on unit edges, half a
  // mullion on shared edges.
  function cell(section: ResolvedSection) {
    const edge = (touching: boolean) => (touching ? frame : mullion / 2);
    const l = edge(section.x < 0.01);
    const t = edge(section.y < 0.01);
    const r = edge(section.x + section.width > W - 0.01);
    const b = edge(section.y + section.height > H - 0.01);
    return { x: section.x + l, y: section.y + t, w: Math.max(section.width - l - r, 0), h: Math.max(section.height - t - b, 0) };
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`${-left} ${-top} ${boxW} ${boxH}`}
      width={boxW * scale}
      height={boxH * scale}
      role="img"
      aria-label={title || `Window ${fmtInches(W)} by ${fmtInches(H)} inches, viewed from outside`}
      className="max-w-full select-none"
      style={{ height: "auto", touchAction: onJointDrag ? "none" : undefined }}
    >
      <title>{title || `${fmtInches(W)}" × ${fmtInches(H)}" — viewed from outside`}</title>
      <defs>
        <linearGradient id={`glass-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#d6e8fa" />
          <stop offset="55%" stopColor="#eef6fe" />
          <stop offset="100%" stopColor="#c8def4" />
        </linearGradient>
        <pattern id={`frost-${uid}`} width={u * 1.6} height={u * 1.6} patternUnits="userSpaceOnUse">
          <rect width={u * 1.6} height={u * 1.6} fill="#eef2f7" />
          <circle cx={u * 0.4} cy={u * 0.4} r={u * 0.22} fill="#cbd5e1" />
          <circle cx={u * 1.2} cy={u * 1.1} r={u * 0.18} fill="#cbd5e1" />
        </pattern>
        <filter id={`shadow-${uid}`} x="-10%" y="-10%" width="120%" height="125%">
          <feDropShadow dx="0" dy={u * 0.5} stdDeviation={u * 0.7} floodColor="#0f172a" floodOpacity="0.18" />
        </filter>
      </defs>

      <rect x={0} y={0} width={W} height={H} fill={frameColour.fill} stroke={frameColour.edge} strokeWidth={u * 0.3} filter={size > 120 ? `url(#shadow-${uid})` : undefined} />

      {resolved.sections.map((section) => {
        const key = section.path.join(".") || "root";
        const selected = selectedPaths.some((path) => samePath(path, section.path));
        const box = cell(section);
        const operable = OPERABLE.has(section.node.op);
        const glass = operable ? { x: box.x + sash, y: box.y + sash, w: Math.max(box.w - 2 * sash, 0), h: Math.max(box.h - 2 * sash, 0) } : box;
        const frosted = Boolean(section.node.glazing?.frost_tint);
        const slider = section.node.op === "single_slider" || section.node.op === "double_slider";
        const hung = section.node.op === "single_hung" || section.node.op === "double_hung";
        return (
          <g
            key={key}
            onClick={onSelect ? (event) => onSelect(section.path, event.shiftKey || event.metaKey || event.ctrlKey) : undefined}
            onMouseEnter={onSelect ? () => setHovered(key) : undefined}
            onMouseLeave={onSelect ? () => setHovered(null) : undefined}
            style={onSelect ? { cursor: "pointer" } : undefined}
            role={onSelect ? "button" : undefined}
            aria-label={onSelect ? `Section ${section.index}: ${sectionLabel(section.node)}` : undefined}
            aria-pressed={onSelect ? selected : undefined}
            tabIndex={onSelect ? 0 : undefined}
            onKeyDown={onSelect ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(section.path, event.shiftKey); } } : undefined}
          >
            {operable ? <rect x={box.x} y={box.y} width={box.w} height={box.h} fill={frameColour.light} stroke={frameColour.edge} strokeWidth={u * 0.2} /> : null}
            <rect x={glass.x} y={glass.y} width={glass.w} height={glass.h} fill={frosted ? `url(#frost-${uid})` : `url(#glass-${uid})`} stroke={frameColour.edge} strokeWidth={u * 0.18} />
            {!frosted && glass.w > 4 && glass.h > 4 ? (
              <g stroke="#ffffff" strokeOpacity={0.9} strokeLinecap="round">
                <line x1={glass.x + glass.w * 0.12} y1={glass.y + glass.h * 0.3} x2={glass.x + glass.w * 0.3} y2={glass.y + glass.h * 0.12} strokeWidth={u * 0.5} />
                <line x1={glass.x + glass.w * 0.14} y1={glass.y + glass.h * 0.44} x2={glass.x + glass.w * 0.44} y2={glass.y + glass.h * 0.14} strokeWidth={u * 0.3} />
              </g>
            ) : null}
            {slider ? <rect x={box.x + box.w / 2 - sash / 2} y={box.y} width={sash} height={box.h} fill={frameColour.light} stroke={frameColour.edge} strokeWidth={u * 0.2} /> : null}
            {hung ? <rect x={box.x} y={box.y + box.h / 2 - sash / 2} width={box.w} height={sash} fill={frameColour.light} stroke={frameColour.edge} strokeWidth={u * 0.2} /> : null}
            <OperationMarks section={section} box={glass} u={u} />
            {onSelect && multi && (selected || hovered === key) ? (
              <rect x={box.x} y={box.y} width={box.w} height={box.h} fill={SELECT} fillOpacity={selected ? 0.16 : 0.07} stroke={SELECT} strokeWidth={selected ? u * 0.8 : u * 0.35} />
            ) : null}
            {multi && showIndexes ? (
              <g>
                <circle cx={box.x + u * 3.2} cy={box.y + u * 3.2} r={u * 2.2} fill={selected ? SELECT : "#ffffff"} stroke={selected ? SELECT : "#94a3b8"} strokeWidth={u * 0.25} />
                <text x={box.x + u * 3.2} y={box.y + u * 3.2 + font * 0.32} fontSize={font * 0.85} textAnchor="middle" fill={selected ? "#ffffff" : INK} fontWeight={700}>{section.index}</text>
              </g>
            ) : null}
            {showSectionSizes && box.w > u * 14 ? (
              <text x={section.x + section.width / 2} y={box.y + box.h - u * 2} fontSize={font * 0.8} fill={INK} textAnchor="middle" fontWeight={500}>{fmtInches(section.width)} × {fmtInches(section.height)}</text>
            ) : null}
          </g>
        );
      })}

      {onJointDrag
        ? (resolved.joints || []).map((joint) => {
            const vertical = joint.orient === "v";
            const active = Boolean(dragging && samePath(dragging.splitPath, joint.splitPath) && dragging.index === joint.index);
            const mid = (joint.start + joint.end) / 2;
            const grip = u * 7;
            return (
              <g
                key={`${joint.splitPath.join(".")}-${joint.index}`}
                style={{ cursor: vertical ? "col-resize" : "row-resize" }}
                aria-label={`Drag to resize the ${vertical ? "widths" : "heights"}`}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
                  setDragging(joint);
                }}
                onPointerMove={(event) => {
                  if (!active) return;
                  const point = toSvg(event);
                  if (point) onJointDrag(joint, vertical ? point.x : point.y, "move");
                }}
                onPointerUp={(event) => {
                  if (!active) return;
                  const point = toSvg(event);
                  setDragging(null);
                  if (point) onJointDrag(joint, vertical ? point.x : point.y, "end");
                }}
                onClick={(event) => event.stopPropagation()}
              >
                {vertical ? (
                  <>
                    <rect x={joint.pos - u * 2} y={joint.start} width={u * 4} height={joint.end - joint.start} fill="transparent" />
                    <rect x={joint.pos - u * 1.1} y={mid - grip / 2} width={u * 2.2} height={grip} rx={u * 1.1} fill={active ? SELECT : "#ffffff"} stroke={SELECT} strokeWidth={u * 0.35} />
                  </>
                ) : (
                  <>
                    <rect x={joint.start} y={joint.pos - u * 2} width={joint.end - joint.start} height={u * 4} fill="transparent" />
                    <rect x={mid - grip / 2} y={joint.pos - u * 1.1} width={grip} height={u * 2.2} rx={u * 1.1} fill={active ? SELECT : "#ffffff"} stroke={SELECT} strokeWidth={u * 0.35} />
                  </>
                )}
                {active && dragLabel ? (
                  <g>
                    <rect x={(vertical ? joint.pos : mid) - font * 2.2} y={(vertical ? mid : joint.pos) - grip / 2 - font * 1.9} width={font * 4.4} height={font * 1.4} rx={font * 0.3} fill={SELECT} />
                    <text x={vertical ? joint.pos : mid} y={(vertical ? mid : joint.pos) - grip / 2 - font * 0.85} fontSize={font * 0.85} textAnchor="middle" fill="#ffffff" fontWeight={700}>{dragLabel}</text>
                  </g>
                ) : null}
              </g>
            );
          })
        : null}

      {showDimensions ? (
        <g>
          <Dimension x1={0} y1={-top * 0.45} x2={W} y2={-top * 0.45} label={fmtInches(W)} u={u} font={font} />
          <Dimension x1={-left * 0.45} y1={0} x2={-left * 0.45} y2={H} label={fmtInches(H)} u={u} font={font} vertical />
        </g>
      ) : null}
      {showAcross ? (
        <g>
          {chains.across.map((value, i) => {
            const x = chains.across.slice(0, i).reduce((a, b) => a + b, 0);
            return <Dimension key={`a${i}`} x1={x} y1={H + bottom * 0.62} x2={x + value} y2={H + bottom * 0.62} label={fmtInches(value)} u={u} font={font * 0.85} />;
          })}
        </g>
      ) : null}
      {showDown ? (
        <g>
          {chains.down.map((value, i) => {
            const y = chains.down.slice(0, i).reduce((a, b) => a + b, 0);
            return <Dimension key={`d${i}`} x1={W + right * 0.62} y1={y} x2={W + right * 0.62} y2={y + value} label={fmtInches(value)} u={u} font={font * 0.85} vertical />;
          })}
        </g>
      ) : null}
    </svg>
  );
}
