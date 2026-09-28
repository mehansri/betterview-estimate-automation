"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

type Point = { x: number; y: number };

/**
 * Canvas signature pad driven by pointer events (mouse, touch and pen).
 * Reports the signature as a PNG data URL through `onChange`, or null when empty.
 */
export default function SignaturePad({
  onChange,
  disabled = false,
  height = 180,
  label = "Signature",
  id,
}: {
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
  height?: number;
  label?: string;
  id?: string;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<Point[][]>([]);
  const activePointerRef = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const context = useCallback(() => canvasRef.current?.getContext("2d") ?? null, []);

  const applyStyle = useCallback((ctx: CanvasRenderingContext2D) => {
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.25;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
    ctx.fillStyle = "#0f172a";
  }, []);

  const drawStroke = useCallback((ctx: CanvasRenderingContext2D, stroke: Point[]) => {
    if (stroke.length === 0) return;
    if (stroke.length === 1) {
      ctx.beginPath();
      ctx.arc(stroke[0].x, stroke[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(stroke[0].x, stroke[0].y);
    for (let i = 1; i < stroke.length - 1; i += 1) {
      const midX = (stroke[i].x + stroke[i + 1].x) / 2;
      const midY = (stroke[i].y + stroke[i + 1].y) / 2;
      ctx.quadraticCurveTo(stroke[i].x, stroke[i].y, midX, midY);
    }
    const last = stroke[stroke.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = context();
    if (!canvas || !ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    applyStyle(ctx);
    strokesRef.current.forEach((stroke) => drawStroke(ctx, stroke));
  }, [applyStyle, context, drawStroke]);

  /** Match the backing store to the CSS size × devicePixelRatio, keeping existing strokes. */
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const dpr = window.devicePixelRatio || 1;
    const width = wrapper.clientWidth;
    const targetW = Math.max(1, Math.round(width * dpr));
    const targetH = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    redraw();
  }, [height, redraw]);

  useEffect(() => {
    resize();
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => resize());
      observer.observe(wrapper);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  const emit = useCallback(() => {
    const canvas = canvasRef.current;
    const hasInk = strokesRef.current.some((stroke) => stroke.length > 0);
    setIsEmpty(!hasInk);
    onChangeRef.current(hasInk && canvas ? canvas.toDataURL("image/png") : null);
  }, []);

  const pointFor = (event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (activePointerRef.current !== null) return;
    event.preventDefault();
    activePointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    strokesRef.current.push([pointFor(event)]);
    redraw();
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointerRef.current !== event.pointerId) return;
    event.preventDefault();
    const stroke = strokesRef.current[strokesRef.current.length - 1];
    if (!stroke) return;
    const native = event.nativeEvent;
    const coalesced = typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [];
    if (coalesced.length > 0) {
      const rect = event.currentTarget.getBoundingClientRect();
      coalesced.forEach((e) => stroke.push({ x: e.clientX - rect.left, y: e.clientY - rect.top }));
    } else {
      stroke.push(pointFor(event));
    }
    redraw();
  };

  const finishStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointerRef.current !== event.pointerId) return;
    activePointerRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    emit();
  };

  const clear = () => {
    strokesRef.current = [];
    activePointerRef.current = null;
    redraw();
    emit();
  };

  return (
    <div className="space-y-2">
      <div
        ref={wrapperRef}
        className={`relative w-full overflow-hidden rounded-xl border-2 border-dashed bg-white ${
          disabled ? "border-slate-200 opacity-60" : "border-slate-300 focus-within:border-brand-500"
        }`}
      >
        <canvas
          id={id}
          ref={canvasRef}
          role="img"
          aria-label={isEmpty ? `${label} pad — draw your signature here` : `${label} captured`}
          className={`block w-full select-none ${disabled ? "cursor-not-allowed" : "cursor-crosshair"}`}
          style={{ touchAction: "none", height }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          onLostPointerCapture={finishStroke}
        />
        <div className="pointer-events-none absolute inset-x-5 bottom-10 border-b border-slate-300" aria-hidden="true" />
        {isEmpty ? (
          <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-sm text-slate-400" aria-hidden="true">
            Sign here with your finger, stylus or mouse
          </p>
        ) : null}
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={clear}
          disabled={disabled || isEmpty}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Clear signature
        </button>
      </div>
    </div>
  );
}
