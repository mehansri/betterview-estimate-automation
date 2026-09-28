"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  appendCustomerEstimateLines,
  CustomerEstimate,
  CustomerWindowLine,
  fetchBusinessSettings,
  fetchCustomerEstimate,
  fetchQuoteCatalog,
  isLockedStatus,
  priceCustomerEstimate,
  QuoteCatalog,
  QuoteLineInput,
  uploadEstimatePhoto,
} from "@/lib/api";
import { newEstimateLineId } from "@/lib/quoteHandoff";
import { describeWindowSpec } from "@/lib/productDescriptions";
import { groupWindowStyles, windowStyleLabel } from "@/lib/styleOptions";
import { LayoutPreset, OPERATION_LABELS, sectionSizeProblem, tryResolveLayout } from "@/lib/windowLayout";
import LocationInput from "@/components/LocationInput";
import { CUSTOM_JAMB, DEFAULT_JAMB_DEPTH, INTERIOR_COLOURS, jambAccessory, withColourRules } from "@/lib/productOptions";

const COLOURS = ["white", "black", "dark bronze", "charcoal", "sandstone"];
const GAS = ["argon", "50/50", "krypton"];
const STORAGE_PREFIX = "bv-measure-sheet:";
const MAX_PHOTO_EDGE = 1600;
const FIELD_ORDER = ["location", "style", "width", "height", "qty"] as const;

type RowField = (typeof FIELD_ORDER)[number];

type SheetDefaults = {
  colour_ext: string;
  colour_int: string;
  loe180: boolean;
  i89: boolean;
  gas: string;
  triple: boolean;
  brickmould: boolean;
  wood_jamb: boolean;
  jamb_depth: string;
  jamb_custom: number | "";
  roughOpening: boolean;
};

type RowPhoto = { dataUrl: string; name: string };

type MeasureRow = {
  key: string;
  location: string;
  style: string;
  width: string;
  height: string;
  qty: string;
  roughOpening: boolean;
  photo: RowPhoto | null;
};

/** Lines already appended to the estimate; photos still waiting to upload. */
type Submission = { lineIds: Record<string, string>; pendingPhotos: string[] };

type SavedSheet = {
  version: 1;
  savedAt: string;
  defaults: SheetDefaults;
  rows: MeasureRow[];
  submission?: Submission | null;
};

type RowAnalysis = {
  blank: boolean;
  width: number | null;
  height: number | null;
  qty: number | null;
  unitWidth: number | null;
  unitHeight: number | null;
  errors: string[];
  missing: string[];
  warnings: string[];
};

const DEFAULT_SHEET: SheetDefaults = {
  colour_ext: "white",
  colour_int: "white",
  loe180: true,
  i89: false,
  gas: "argon",
  triple: false,
  brickmould: false,
  // Every new line item starts with a 5 1/2" primed wood jamb.
  wood_jamb: true,
  jamb_depth: DEFAULT_JAMB_DEPTH,
  jamb_custom: "",
  roughOpening: false,
};

const inputClass =
  "block w-full min-w-0 min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50 disabled:text-slate-500";

// ---------------------------------------------------------------- measurement parsing

const UNICODE_FRACTIONS: Record<string, number> = {
  "½": 1 / 2,
  "¼": 1 / 4,
  "¾": 3 / 4,
  "⅛": 1 / 8,
  "⅜": 3 / 8,
  "⅝": 5 / 8,
  "⅞": 7 / 8,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
};

/**
 * Parse a tape-measure reading in inches: "35", "35.5", "35 1/2", "35-1/2",
 * "1/2", "35½", with an optional trailing `"` or "in". Returns null when the
 * text is not a measurement.
 */
export function parseInches(raw: string): number | null {
  let text = raw.trim().toLowerCase().replace(/\s*(inches|inch|in|")$/, "").trim();
  if (!text) return null;
  let unicode = 0;
  text = text
    .replace(/[½¼¾⅛⅜⅝⅞⅓⅔]/g, (char) => {
      unicode += UNICODE_FRACTIONS[char] || 0;
      return " ";
    })
    .trim();
  if (!text) return unicode || null;

  let value: number | null = null;
  let match: RegExpMatchArray | null;
  if ((match = text.match(/^(\d*\.?\d+)$/))) {
    value = Number(match[1]);
  } else if ((match = text.match(/^(\d+)(?:\s+|\s*-\s*)(\d+)\s*\/\s*(\d+)$/))) {
    const [whole, numerator, denominator] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (!denominator || numerator >= denominator) return null;
    value = whole + numerator / denominator;
  } else if ((match = text.match(/^(\d+)\s*\/\s*(\d+)$/))) {
    const [numerator, denominator] = [Number(match[1]), Number(match[2])];
    if (!denominator) return null;
    value = numerator / denominator;
  }
  if (value === null || !Number.isFinite(value)) return null;
  return value + unicode;
}

function roundInches(value: number) {
  return Math.round(value * 1000) / 1000;
}

function formatInches(value: number | null) {
  return value === null ? "?" : String(roundInches(value));
}

function parseQty(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return null;
  return Number(text);
}

// ---------------------------------------------------------------- size ranges

type CatalogStyle = QuoteCatalog["styles"][number];

function printedSizeRows(style: CatalogStyle | undefined, triple: boolean) {
  return (style?.size_ranges || []).filter((row) => {
    const label = (row.label || "").trim().toLowerCase();
    return row.ranges.length >= 2 && (triple ? label.startsWith("tri") : label.startsWith("double"));
  });
}

function rangePairs(rows: ReturnType<typeof printedSizeRows>) {
  const pairs: Array<{ width: { min: number; max: number }; height: { min: number; max: number } }> = [];
  for (const row of rows) {
    for (let index = 0; index + 1 < row.ranges.length; index += 2) {
      pairs.push({ width: row.ranges[index], height: row.ranges[index + 1] });
    }
  }
  return pairs;
}

function sizeRangeWarning(style: CatalogStyle | undefined, triple: boolean, width: number, height: number): string | null {
  const pairs = rangePairs(printedSizeRows(style, triple));
  if (!style || !pairs.length) return null;
  const fits = pairs.some((pair) =>
    pair.width.min <= width && width <= pair.width.max && pair.height.min <= height && height <= pair.height.max
  );
  if (fits) return null;
  const printed = pairs
    .map((pair) => `W ${pair.width.min}–${pair.width.max} × H ${pair.height.min}–${pair.height.max}`)
    .join("; ");
  return `Unit ${formatInches(width)} × ${formatInches(height)} is outside the printed ${triple ? "triple-pane" : "double-glazed"} sizes for ${style.code} (${printed}).`;
}

// ---------------------------------------------------------------- rows

function isBlankRow(row: MeasureRow) {
  return !row.location.trim() && !row.width.trim() && !row.height.trim() && !row.photo;
}

function newRow(style: string, roughOpening: boolean): MeasureRow {
  return {
    key: newEstimateLineId("row"),
    location: "",
    style,
    width: "",
    height: "",
    qty: "1",
    roughOpening,
    photo: null,
  };
}

/** Mulled layouts offered as a "style": the row becomes a layout-first unit. */
const PRESET_PREFIX = "preset:";

function rowPreset(row: MeasureRow, catalog: QuoteCatalog | null): LayoutPreset | undefined {
  if (!row.style.startsWith(PRESET_PREFIX)) return undefined;
  const id = row.style.slice(PRESET_PREFIX.length);
  return catalog?.layout?.presets.find((preset) => preset.id === id);
}

function analyseRow(
  row: MeasureRow,
  defaults: SheetDefaults,
  catalog: QuoteCatalog | null,
  deduction: number | null,
): RowAnalysis {
  const errors: string[] = [];
  const missing: string[] = [];
  const warnings: string[] = [];
  const blank = isBlankRow(row);

  function dimension(raw: string, label: string) {
    if (!raw.trim()) {
      missing.push(`Enter a ${label.toLowerCase()}.`);
      return null;
    }
    const value = parseInches(raw);
    if (value === null) {
      errors.push(`${label} “${raw.trim()}” isn't a measurement — use 35 1/2 or 35.5.`);
      return null;
    }
    if (value <= 0) {
      errors.push(`${label} must be greater than 0.`);
      return null;
    }
    return value;
  }

  const width = dimension(row.width, "Width");
  const height = dimension(row.height, "Height");
  const qty = parseQty(row.qty);
  if (qty === null || qty < 1) errors.push("Quantity must be a whole number of at least 1.");
  if (!row.location.trim()) missing.push("Add a room / location.");

  const preset = rowPreset(row, catalog);
  const style = catalog?.styles.find((item) => item.code === row.style);
  if (catalog && !style && !preset) errors.push("Choose a window style.");

  let unitWidth = width;
  let unitHeight = height;
  if (row.roughOpening && width !== null && height !== null) {
    if (deduction === null) {
      errors.push("The rough-opening deduction could not be loaded — untick “Rough opening” or reload.");
      unitWidth = null;
      unitHeight = null;
    } else {
      unitWidth = roundInches(width - deduction);
      unitHeight = roundInches(height - deduction);
      if (unitWidth <= 0 || unitHeight <= 0) {
        errors.push("The unit size after the rough-opening deduction must be greater than 0.");
        unitWidth = null;
        unitHeight = null;
      }
    }
  }
  if (unitWidth !== null && unitHeight !== null && preset) {
    // Each section of a mulled layout is checked against its own style.
    const series = catalog?.layout?.series.find((item) => item.id === catalog.layout?.default_series);
    const { resolved, error } = tryResolveLayout(preset.layout, unitWidth, unitHeight);
    if (error) errors.push(error);
    for (const section of resolved?.sections || []) {
      const code = series?.styles[section.node.op];
      const problem = sectionSizeProblem(catalog?.styles.find((item) => item.code === code), section.width, section.height, defaults.triple);
      if (problem) warnings.push(`Section ${section.index} (${OPERATION_LABELS[section.node.op]}): ${problem}.`);
    }
  } else if (unitWidth !== null && unitHeight !== null) {
    const warning = sizeRangeWarning(style, defaults.triple, unitWidth, unitHeight);
    if (warning) warnings.push(warning);
  }

  return {
    blank,
    width,
    height,
    qty,
    unitWidth: unitWidth === null ? null : roundInches(unitWidth),
    unitHeight: unitHeight === null ? null : roundInches(unitHeight),
    errors,
    missing,
    warnings,
  };
}

/** Shaped exactly like QuoteBuilder's `toQuoteLine` for a single window. */
function buildWindowSpec(row: MeasureRow, analysis: RowAnalysis, defaults: SheetDefaults, catalog: QuoteCatalog): QuoteLineInput {
  const accessories: Array<{ kind: string; name: string }> = [];
  if (defaults.brickmould) {
    const name = catalog.accessories.brickmould?.[0]?.name;
    if (name) accessories.push({ kind: "brickmould", name });
  }
  const jamb = jambAccessory(defaults, catalog);
  if (jamb) accessories.push(jamb as unknown as { kind: string; name: string });
  const colours = { colour_ext: defaults.colour_ext, ...(defaults.colour_int !== "white" ? { colour_int: defaults.colour_int } : {}) };
  const glazing = {
    loe180: defaults.loe180,
    i89: defaults.i89,
    gas: defaults.gas,
    triple: defaults.triple,
    tri_pane_lami: false,
    frost_tint: false,
  };
  const preset = rowPreset(row, catalog);
  if (preset && catalog.layout) {
    // Shaped like QuoteBuilder's `toQuoteLine` for a layout-builder unit.
    return {
      type: "unit",
      series: catalog.layout.default_series,
      width: analysis.unitWidth,
      height: analysis.unitHeight,
      qty: analysis.qty,
      ...colours,
      glazing,
      accessories,
      layout: JSON.parse(JSON.stringify(preset.layout)),
      preset: preset.id,
    };
  }
  return {
    type: "window",
    style: row.style,
    width: analysis.unitWidth,
    height: analysis.unitHeight,
    qty: analysis.qty,
    ...colours,
    glazing,
    accessories,
  };
}

// ---------------------------------------------------------------- photos

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the photo."));
    reader.readAsDataURL(blob);
  });
}

/** Downscale to at most MAX_PHOTO_EDGE px on the long edge, re-encoded as JPEG. */
async function downscalePhoto(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Could not open that image."));
      element.src = url;
    });
    const longEdge = Math.max(image.naturalWidth, image.naturalHeight) || 1;
    const scale = Math.min(1, MAX_PHOTO_EDGE / longEdge);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not compress the photo.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not compress the photo."))), "image/jpeg", 0.82)
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

function dataUrlToFile(dataUrl: string, name: string): File {
  const [head, body = ""] = dataUrl.split(",");
  const mime = /data:([^;,]+)/.exec(head)?.[1] || "image/jpeg";
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], name, { type: mime });
}

function photoFileName(row: MeasureRow, index: number) {
  const slug = row.location.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${slug || "window"}-${index + 1}.jpg`;
}

// ---------------------------------------------------------------- storage

function storageKey(estimateId: string) {
  return `${STORAGE_PREFIX}${estimateId}`;
}

function readSavedSheet(estimateId: string): SavedSheet | null {
  try {
    const raw = window.localStorage.getItem(storageKey(estimateId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedSheet>;
    if (parsed?.version !== 1 || !Array.isArray(parsed.rows)) return null;
    const defaults = { ...DEFAULT_SHEET, ...(parsed.defaults || {}) };
    const rows: MeasureRow[] = parsed.rows
      .filter((row): row is MeasureRow => Boolean(row && typeof row === "object"))
      .map((row) => ({
        key: typeof row.key === "string" && row.key ? row.key : newEstimateLineId("row"),
        location: String(row.location ?? ""),
        style: String(row.style ?? ""),
        width: String(row.width ?? ""),
        height: String(row.height ?? ""),
        qty: String(row.qty ?? "1"),
        roughOpening: Boolean(row.roughOpening),
        photo: row.photo && typeof row.photo.dataUrl === "string" ? { dataUrl: row.photo.dataUrl, name: String(row.photo.name || "photo.jpg") } : null,
      }));
    if (!rows.length) return null;
    const submission = parsed.submission && typeof parsed.submission === "object" && parsed.submission.lineIds
      ? { lineIds: parsed.submission.lineIds, pendingPhotos: Array.isArray(parsed.submission.pendingPhotos) ? parsed.submission.pendingPhotos : [] }
      : null;
    return { version: 1, savedAt: String(parsed.savedAt || ""), defaults, rows, submission };
  } catch {
    return null;
  }
}

function clearSavedSheet(estimateId: string) {
  try {
    window.localStorage.removeItem(storageKey(estimateId));
  } catch {
    // storage unavailable — nothing to clear
  }
}

// ---------------------------------------------------------------- UI helpers

function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700">
      <input type="checkbox" className="h-5 w-5 shrink-0" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}

// ---------------------------------------------------------------- component

export default function MeasureSheet({ estimateId }: { estimateId: string }) {
  const router = useRouter();
  const [project, setProject] = useState<CustomerEstimate | null>(null);
  const [catalog, setCatalog] = useState<QuoteCatalog | null>(null);
  const [deduction, setDeduction] = useState<number | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [defaults, setDefaults] = useState<SheetDefaults>(DEFAULT_SHEET);
  const [rows, setRows] = useState<MeasureRow[]>([]);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const [photosNotSaved, setPhotosNotSaved] = useState(false);
  const [storageUnavailable, setStorageUnavailable] = useState(false);

  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState<Record<string, boolean>>({});
  const [photoErrors, setPhotoErrors] = useState<Record<string, string>>({});
  const [lastDeleted, setLastDeleted] = useState<{ row: MeasureRow; index: number } | null>(null);

  const fieldRefs = useRef(new Map<string, HTMLElement>());
  const pendingFocus = useRef<{ rowKey: string; field: RowField } | null>(null);
  const leavingRef = useRef(false);

  // Load the estimate, catalog and measurement settings.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchCustomerEstimate(estimateId), fetchQuoteCatalog()])
      .then(([estimate, catalogPayload]) => {
        if (cancelled) return;
        setProject(estimate);
        setCatalog(catalogPayload);
      })
      .catch((reason) => {
        if (!cancelled) setLoadError(errorMessage(reason, "Could not load this project."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    fetchBusinessSettings()
      .then((settings) => {
        if (cancelled) return;
        const value = Number(settings.measurement?.rough_opening_deduction_in);
        if (Number.isFinite(value) && value >= 0) {
          setDeduction(value);
          setSettingsError(null);
        } else {
          setSettingsError("The rough-opening deduction is not configured.");
        }
      })
      .catch((reason) => {
        if (!cancelled) setSettingsError(errorMessage(reason, "Could not load measurement settings."));
      });
    return () => {
      cancelled = true;
    };
  }, [estimateId]);

  // Restore any unsaved sheet for this estimate.
  useEffect(() => {
    setHydrated(false);
    const saved = readSavedSheet(estimateId);
    if (saved) {
      setDefaults(saved.defaults);
      setRows(saved.rows);
      setSubmission(saved.submission || null);
      setRestoredAt(saved.savedAt || new Date().toISOString());
    } else {
      setDefaults(DEFAULT_SHEET);
      setRows([newRow("", DEFAULT_SHEET.roughOpening)]);
      setSubmission(null);
      setRestoredAt(null);
    }
    setHydrated(true);
  }, [estimateId]);

  // Rows created before the catalog arrived get the first catalog style.
  useEffect(() => {
    const firstStyle = catalog?.styles[0]?.code;
    if (!firstStyle) return;
    setRows((current) =>
      current.some((row) => !row.style) ? current.map((row) => (row.style ? row : { ...row, style: firstStyle })) : current
    );
  }, [catalog, rows]);

  // Autosave every change so a dropped connection or reload never loses work.
  useEffect(() => {
    if (!hydrated || leavingRef.current) return;
    const pristine = !submission && rows.every(isBlankRow);
    try {
      const key = storageKey(estimateId);
      if (pristine) {
        window.localStorage.removeItem(key);
        setPhotosNotSaved(false);
        return;
      }
      const payload: SavedSheet = { version: 1, savedAt: new Date().toISOString(), defaults, rows, submission };
      try {
        window.localStorage.setItem(key, JSON.stringify(payload));
        setPhotosNotSaved(false);
      } catch {
        // Most likely the storage quota: keep the measurements, drop the photos.
        window.localStorage.setItem(key, JSON.stringify({ ...payload, rows: rows.map((row) => ({ ...row, photo: null })) }));
        setPhotosNotSaved(rows.some((row) => row.photo));
      }
      setStorageUnavailable(false);
    } catch {
      setStorageUnavailable(true);
    }
  }, [defaults, estimateId, hydrated, rows, submission]);

  // Focus a field requested by a keyboard action once its row has rendered.
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    const element = fieldRefs.current.get(`${target.rowKey}:${target.field}`);
    if (!element) return;
    pendingFocus.current = null;
    const focusable = element instanceof HTMLInputElement || element instanceof HTMLSelectElement ? element : element.querySelector("input");
    focusable?.focus();
  }, [rows]);

  const analyses = useMemo(
    () => rows.map((row) => analyseRow(row, defaults, catalog, deduction)),
    [catalog, deduction, defaults, rows]
  );
  const styleGroups = useMemo(() => (catalog ? groupWindowStyles(catalog.styles) : []), [catalog]);
  const brickmouldName = catalog?.accessories.brickmould?.[0]?.name || null;
  const measured = analyses.filter((analysis) => !analysis.blank);
  const totalQty = measured.reduce((total, analysis) => total + (analysis.qty || 0), 0);
  const errorRows = analyses.filter((analysis) => !analysis.blank && (analysis.errors.length || analysis.missing.some((item) => !item.startsWith("Add a room"))));
  const warningCount = measured.filter((analysis) => analysis.warnings.length).length;
  const locked = project ? isLockedStatus(project.status) : false;
  const sheetDisabled = busy || Boolean(submission);

  function registerField(rowKey: string, field: RowField) {
    return (element: HTMLElement | null) => {
      const key = `${rowKey}:${field}`;
      if (element) fieldRefs.current.set(key, element);
      else fieldRefs.current.delete(key);
    };
  }

  function focusField(rowKey: string, field: RowField) {
    pendingFocus.current = { rowKey, field };
    const element = fieldRefs.current.get(`${rowKey}:${field}`);
    if (element) {
      pendingFocus.current = null;
      const focusable = element instanceof HTMLInputElement || element instanceof HTMLSelectElement ? element : element.querySelector("input");
      focusable?.focus();
    }
  }

  function updateRow(key: string, patch: Partial<MeasureRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function updateDefaults(patch: Partial<SheetDefaults>) {
    setDefaults((current) => ({ ...current, ...patch }));
    if (patch.roughOpening !== undefined) {
      // Rows that have not been measured yet follow the new sheet default.
      const roughOpening = patch.roughOpening;
      setRows((current) => current.map((row) => (isBlankRow(row) ? { ...row, roughOpening } : row)));
    }
  }

  function addRow(afterKey?: string) {
    const index = afterKey ? rows.findIndex((row) => row.key === afterKey) : rows.length - 1;
    const source = rows[index] || rows[rows.length - 1];
    const created = newRow(source?.style || catalog?.styles[0]?.code || "", defaults.roughOpening);
    setRows((current) => {
      const at = afterKey ? current.findIndex((row) => row.key === afterKey) : current.length - 1;
      const next = [...current];
      next.splice(at + 1, 0, created);
      return next;
    });
    pendingFocus.current = { rowKey: created.key, field: "location" };
  }

  function duplicateRow(key: string) {
    const source = rows.find((row) => row.key === key);
    if (!source) return;
    // A photo belongs to one opening, so it is not copied.
    const copy: MeasureRow = { ...source, key: newEstimateLineId("row"), photo: null };
    setRows((current) => {
      const at = current.findIndex((row) => row.key === key);
      const next = [...current];
      next.splice(at + 1, 0, copy);
      return next;
    });
    pendingFocus.current = { rowKey: copy.key, field: "location" };
  }

  function deleteRow(key: string) {
    const index = rows.findIndex((row) => row.key === key);
    if (index < 0) return;
    const row = rows[index];
    if (!isBlankRow(row)) setLastDeleted({ row, index });
    setRows((current) => {
      const next = current.filter((item) => item.key !== key);
      return next.length ? next : [newRow(row.style, defaults.roughOpening)];
    });
  }

  function undoDelete() {
    if (!lastDeleted) return;
    setRows((current) => {
      const next = current.length === 1 && isBlankRow(current[0]) ? [] : [...current];
      next.splice(Math.min(lastDeleted.index, next.length), 0, lastDeleted.row);
      return next;
    });
    setLastDeleted(null);
  }

  function handleFieldKeyDown(event: KeyboardEvent<HTMLElement>, rowKey: string, field: RowField) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    const fieldIndex = FIELD_ORDER.indexOf(field);
    if (fieldIndex < FIELD_ORDER.length - 1) {
      focusField(rowKey, FIELD_ORDER[fieldIndex + 1]);
      return;
    }
    const rowIndex = rows.findIndex((row) => row.key === rowKey);
    if (rowIndex === rows.length - 1) addRow(rowKey);
    else focusField(rows[rowIndex + 1].key, "location");
  }

  async function choosePhoto(rowKey: string, file: File | undefined) {
    if (!file) return;
    setPhotoBusy((current) => ({ ...current, [rowKey]: true }));
    setPhotoErrors((current) => {
      const next = { ...current };
      delete next[rowKey];
      return next;
    });
    try {
      let blob: Blob;
      try {
        blob = await downscalePhoto(file);
      } catch {
        // Formats the browser cannot decode (e.g. HEIC on desktop) go up as-is.
        blob = file;
      }
      const dataUrl = await blobToDataUrl(blob);
      updateRow(rowKey, { photo: { dataUrl, name: file.name || "photo.jpg" } });
    } catch (reason) {
      setPhotoErrors((current) => ({ ...current, [rowKey]: errorMessage(reason, "Could not use that photo.") }));
    } finally {
      setPhotoBusy((current) => {
        const next = { ...current };
        delete next[rowKey];
        return next;
      });
    }
  }

  function discardRestored() {
    if (!window.confirm("Discard the restored measurements? This cannot be undone.")) return;
    clearSavedSheet(estimateId);
    setRows([newRow(catalog?.styles[0]?.code || "", DEFAULT_SHEET.roughOpening)]);
    setDefaults(DEFAULT_SHEET);
    setSubmission(null);
    setRestoredAt(null);
    setAttempted(false);
    setError(null);
    setLastDeleted(null);
  }

  function leaveForProject() {
    leavingRef.current = true;
    clearSavedSheet(estimateId);
    router.push(`/projects/${estimateId}`);
  }

  async function uploadPhotosAndPrice(current: Submission) {
    setBusy(true);
    setError(null);
    const failed: string[] = [];
    const failures: string[] = [];
    const queue = current.pendingPhotos.filter((key) => rows.some((row) => row.key === key && row.photo) && current.lineIds[key]);
    for (let index = 0; index < queue.length; index += 1) {
      const key = queue[index];
      const rowIndex = rows.findIndex((row) => row.key === key);
      const row = rows[rowIndex];
      if (!row?.photo) continue;
      setProgress(`Uploading photo ${index + 1} of ${queue.length}…`);
      try {
        await uploadEstimatePhoto(estimateId, dataUrlToFile(row.photo.dataUrl, photoFileName(row, rowIndex)), current.lineIds[key], row.location.trim());
      } catch (reason) {
        failed.push(key);
        failures.push(`Row ${rowIndex + 1}${row.location.trim() ? ` (${row.location.trim()})` : ""}: ${errorMessage(reason, "upload failed")}`);
      }
    }
    setSubmission({ ...current, pendingPhotos: failed });

    setProgress("Pricing the estimate…");
    try {
      await priceCustomerEstimate(estimateId);
    } catch {
      // The project page lists pricing review items; the lines are saved.
    }

    if (failed.length) {
      setBusy(false);
      setProgress(null);
      setError(`The windows were added, but ${failed.length} photo${failed.length === 1 ? "" : "s"} did not upload. ${failures.join(" · ")}`);
      return;
    }
    setProgress("Opening the project…");
    leaveForProject();
  }

  async function addToEstimate() {
    if (!catalog || !project || busy || submission || locked) return;
    setAttempted(true);
    setError(null);
    const candidates = rows
      .map((row, index) => ({ row, index, analysis: analyses[index] }))
      .filter((candidate) => !candidate.analysis.blank);
    if (!candidates.length) {
      setError("Measure at least one window first.");
      return;
    }
    const invalid = candidates.filter(
      (candidate) =>
        candidate.analysis.errors.length ||
        candidate.analysis.unitWidth === null ||
        candidate.analysis.unitHeight === null ||
        candidate.analysis.qty === null
    );
    if (invalid.length) {
      setError(`Fix row${invalid.length === 1 ? "" : "s"} ${invalid.map((candidate) => candidate.index + 1).join(", ")} before adding them to the estimate.`);
      focusField(invalid[0].row.key, invalid[0].analysis.width === null ? "width" : invalid[0].analysis.height === null ? "height" : "qty");
      return;
    }
    const withoutLocation = candidates.filter((candidate) => !candidate.row.location.trim());
    if (
      withoutLocation.length &&
      !window.confirm(`${withoutLocation.length} window${withoutLocation.length === 1 ? " has" : "s have"} no room / location (row ${withoutLocation.map((candidate) => candidate.index + 1).join(", ")}). Add anyway?`)
    ) {
      focusField(withoutLocation[0].row.key, "location");
      return;
    }

    const windows: CustomerWindowLine[] = candidates.map(({ row, analysis }) => {
      const spec = buildWindowSpec(row, analysis, defaults, catalog);
      return {
        id: newEstimateLineId("window"),
        location: row.location.trim(),
        description: describeWindowSpec(spec, catalog),
        spec,
      };
    });

    setBusy(true);
    setProgress(`Adding ${windows.length} window line${windows.length === 1 ? "" : "s"} to the estimate…`);
    try {
      await appendCustomerEstimateLines(estimateId, { windows });
    } catch (reason) {
      setBusy(false);
      setProgress(null);
      setError(errorMessage(reason, "Could not add the windows to the estimate."));
      return;
    }
    const next: Submission = {
      lineIds: Object.fromEntries(candidates.map((candidate, index) => [candidate.row.key, windows[index].id])),
      pendingPhotos: candidates.filter((candidate) => candidate.row.photo).map((candidate) => candidate.row.key),
    };
    setSubmission(next);
    await uploadPhotosAndPrice(next);
  }

  // ---------------------------------------------------------------- render

  if (loading) {
    return <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading measure sheet…</p>;
  }
  if (!project) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        <p>{loadError || "This project could not be loaded."}</p>
        <Link href={`/projects/${estimateId}`} className="mt-3 inline-flex min-h-[44px] items-center font-semibold underline">Back to project</Link>
      </div>
    );
  }

  const projectTitle = project.project_name || project.customer_name || "Project";
  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Measure sheet</p>
        <h1 className="truncate text-lg font-semibold text-slate-900">{projectTitle}</h1>
        <p className="text-sm text-slate-500">
          {[project.project_name ? project.customer_name : "", project.project_address, project.estimate_number].filter(Boolean).join(" · ") || "Walk the house and record each opening."}
        </p>
      </div>
      <Link href={`/projects/${project.id}`} className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
        Back to project
      </Link>
    </div>
  );

  if (locked) {
    return (
      <div className="space-y-4">
        {header}
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">This estimate is {project.status} and read-only.</p>
          <p className="mt-1">Create a revision from the project page to add measured windows.</p>
          <Link href={`/projects/${project.id}`} className="mt-3 inline-flex min-h-[44px] items-center font-semibold underline">Open project</Link>
        </div>
      </div>
    );
  }

  if (!catalog) {
    return (
      <div className="space-y-4">
        {header}
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">{loadError || "The window catalog could not be loaded."}</p>
      </div>
    );
  }

  const gridTemplate = "xl:grid-cols-[2rem_minmax(0,1.2fr)_minmax(0,1.5fr)_6rem_6rem_4.5rem_4.5rem_auto]";

  return (
    <div className="space-y-4 pb-28">
      {header}

      {restoredAt ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900" role="status">
          <p>
            <span className="font-semibold">Restored unsaved measurements</span>
            {Number.isFinite(Date.parse(restoredAt)) ? <span> from {new Date(restoredAt).toLocaleString()}</span> : null}.
          </p>
          <div className="flex gap-2">
            <button type="button" className="min-h-[44px] rounded-lg px-3 font-semibold text-sky-800 hover:bg-sky-100" onClick={() => setRestoredAt(null)}>Keep</button>
            <button type="button" className="min-h-[44px] rounded-lg border border-sky-300 bg-white px-3 font-semibold text-rose-700 hover:bg-rose-50" onClick={discardRestored} disabled={busy}>Discard</button>
          </div>
        </div>
      ) : null}

      {storageUnavailable ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">This browser is not saving the sheet locally (private mode or storage blocked). Add the windows to the estimate before leaving this page.</p>
      ) : photosNotSaved ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Measurements are saved on this device, but the photos are too large to keep offline. They will upload when you add the windows — don&apos;t reload before then.</p>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="measure-defaults-heading">
        <h2 id="measure-defaults-heading" className="text-base font-semibold text-slate-900">Options for every window</h2>
        <p className="mt-1 text-sm text-slate-500">Colour, glazing, brickmould and wood jamb apply to all rows. Rows set their own room, style, size and quantity.</p>
        <fieldset disabled={sheetDisabled} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Exterior colour</span>
            <select className={inputClass} value={defaults.colour_ext} onChange={(event) => updateDefaults(withColourRules(defaults, { colour_ext: event.target.value }))}>
              {COLOURS.map((colour) => <option key={colour} value={colour}>{colour}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Interior colour</span>
            <select className={inputClass} value={defaults.colour_int} onChange={(event) => updateDefaults(withColourRules(defaults, { colour_int: event.target.value }))}>
              {INTERIOR_COLOURS.map((colour) => <option key={colour} value={colour}>{colour === "black" ? "black (black in / black out)" : colour}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Gas</span>
            <select className={inputClass} value={defaults.gas} onChange={(event) => updateDefaults({ gas: event.target.value })}>
              {GAS.map((gas) => <option key={gas} value={gas}>{gas}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2 self-end sm:col-span-2 lg:grid-cols-4">
            <Toggle label="LoE 180" checked={defaults.loe180} onChange={(value) => updateDefaults({ loe180: value })} />
            <Toggle label="i89" checked={defaults.i89} onChange={(value) => updateDefaults({ i89: value })} />
            <Toggle label="Triple pane" checked={defaults.triple} onChange={(value) => updateDefaults({ triple: value })} />
            <Toggle label="Brickmould" checked={defaults.brickmould} onChange={(value) => updateDefaults({ brickmould: value })} />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-4 lg:grid-cols-4">
            <Toggle label="Wood jamb (primed up to 6 1/4″)" checked={defaults.wood_jamb} onChange={(value) => updateDefaults({ wood_jamb: value })} />
            {defaults.wood_jamb ? (
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Jamb depth</span>
                <select className={inputClass} value={defaults.jamb_depth} onChange={(event) => updateDefaults({ jamb_depth: event.target.value })}>
                  {(catalog?.wood_jamb?.depths || [{ name: DEFAULT_JAMB_DEPTH }]).map((depth) => <option key={depth.name} value={depth.name}>{depth.name}</option>)}
                  <option value={CUSTOM_JAMB}>Custom depth…</option>
                </select>
              </label>
            ) : null}
            {defaults.wood_jamb && defaults.jamb_depth === CUSTOM_JAMB ? (
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Custom depth (in)</span>
                <input className={inputClass} type="number" min={0.5} max={catalog?.wood_jamb?.custom_max_in || 7.5} step={0.125} value={defaults.jamb_custom} onChange={(event) => updateDefaults({ jamb_custom: event.target.value === "" ? "" : Number(event.target.value) })} />
              </label>
            ) : null}
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <Toggle label="Measuring rough openings (default for new rows)" checked={defaults.roughOpening} onChange={(value) => updateDefaults({ roughOpening: value })} />
            <p className="mt-1 text-xs text-slate-500">
              {deduction !== null
                ? `Rough-opening rows subtract ${formatInches(deduction)} in from each dimension to get the unit size.`
                : settingsError
                  ? `Rough-opening deduction unavailable: ${settingsError}`
                  : "Loading the rough-opening deduction…"}
              {defaults.brickmould ? ` Brickmould: ${brickmouldName || "not in the loaded catalog — it will be skipped"}.` : ""}
            </p>
          </div>
        </fieldset>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4" aria-labelledby="measure-rows-heading">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <h2 id="measure-rows-heading" className="text-base font-semibold text-slate-900">Openings</h2>
          <p className="text-xs text-slate-500">Sizes in inches — <span className="whitespace-nowrap">35 1/2</span> or 35.5. Enter moves to the next field.</p>
        </div>

        <div className={`mt-3 hidden gap-2 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500 xl:grid ${gridTemplate}`} aria-hidden="true">
          <span>#</span><span>Room / location</span><span>Style</span><span>Width</span><span>Height</span><span>RO</span><span>Qty</span><span>Photo · actions</span>
        </div>

        <fieldset disabled={sheetDisabled} className="mt-2 space-y-2">
          <legend className="sr-only">Measured openings</legend>
          {rows.map((row, index) => {
            const analysis = analyses[index];
            const number = index + 1;
            const shownErrors = analysis.blank ? [] : [...analysis.errors, ...(attempted ? analysis.missing : [])];
            const hasSizes = analysis.width !== null && analysis.height !== null;
            const showLocationMissing = !analysis.blank && (attempted || hasSizes);
            return (
              <div key={row.key} className={`rounded-xl border p-3 xl:p-2 ${shownErrors.length ? "border-rose-200 bg-rose-50/40" : analysis.warnings.length ? "border-amber-200 bg-amber-50/40" : "border-slate-200 bg-slate-50/60"}`}>
                <div className={`grid grid-cols-2 items-start gap-2 sm:grid-cols-4 ${gridTemplate}`}>
                  <span className="col-span-2 text-sm font-semibold text-slate-500 sm:col-span-4 xl:col-span-1 xl:pt-3">
                    <span className="xl:hidden">Opening </span>{number}
                  </span>
                  <div
                    className="col-span-2 block text-sm xl:col-span-1"
                    ref={registerField(row.key, "location")}
                    onKeyDown={(event) => handleFieldKeyDown(event, row.key, "location")}
                  >
                    <label className="block">
                      <span className="mb-1 block font-medium text-slate-700 xl:sr-only">Room / location, opening {number}</span>
                      <LocationInput className={inputClass} value={row.location} onChange={(value) => updateRow(row.key, { location: value })} placeholder="Bedroom" required={showLocationMissing} />
                    </label>
                  </div>
                  <label className="col-span-2 block text-sm xl:col-span-1">
                    <span className="mb-1 block font-medium text-slate-700 xl:sr-only">Window style, opening {number}</span>
                    <select
                      ref={registerField(row.key, "style")}
                      className={inputClass}
                      value={row.style}
                      onChange={(event) => updateRow(row.key, { style: event.target.value })}
                      onKeyDown={(event) => handleFieldKeyDown(event, row.key, "style")}
                    >
                      {styleGroups.map((group) => (
                        <optgroup key={group.collection} label={group.label}>
                          {group.styles.map((style) => <option key={style.code} value={style.code}>{windowStyleLabel(style)}</option>)}
                        </optgroup>
                      ))}
                      {catalog?.layout?.presets.some((preset) => preset.panels > 1) ? (
                        <optgroup label="Mulled layouts (edit sections in the window builder)">
                          {catalog.layout.presets.filter((preset) => preset.panels > 1).map((preset) => (
                            <option key={preset.id} value={`${PRESET_PREFIX}${preset.id}`}>{preset.code ? `${preset.code} · ` : ""}{preset.label}</option>
                          ))}
                        </optgroup>
                      ) : null}
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-700 xl:sr-only">{row.roughOpening ? "RO width" : "Width"} (in), opening {number}</span>
                    <input
                      ref={registerField(row.key, "width")}
                      className={inputClass}
                      inputMode="decimal"
                      enterKeyHint="next"
                      autoComplete="off"
                      placeholder="35 1/2"
                      value={row.width}
                      aria-invalid={analysis.errors.some((item) => item.startsWith("Width")) || undefined}
                      onChange={(event) => updateRow(row.key, { width: event.target.value })}
                      onKeyDown={(event) => handleFieldKeyDown(event, row.key, "width")}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-700 xl:sr-only">{row.roughOpening ? "RO height" : "Height"} (in), opening {number}</span>
                    <input
                      ref={registerField(row.key, "height")}
                      className={inputClass}
                      inputMode="decimal"
                      enterKeyHint="next"
                      autoComplete="off"
                      placeholder="59 1/2"
                      value={row.height}
                      aria-invalid={analysis.errors.some((item) => item.startsWith("Height")) || undefined}
                      onChange={(event) => updateRow(row.key, { height: event.target.value })}
                      onKeyDown={(event) => handleFieldKeyDown(event, row.key, "height")}
                    />
                  </label>
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-2 self-end rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 xl:justify-center xl:px-0">
                    <input type="checkbox" className="h-5 w-5" checked={row.roughOpening} onChange={(event) => updateRow(row.key, { roughOpening: event.target.checked })} />
                    <span className="xl:sr-only">Rough opening<span className="sr-only">, opening {number}</span></span>
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-700 xl:sr-only">Qty, opening {number}</span>
                    <input
                      ref={registerField(row.key, "qty")}
                      className={inputClass}
                      inputMode="numeric"
                      enterKeyHint={index === rows.length - 1 ? "enter" : "next"}
                      autoComplete="off"
                      value={row.qty}
                      onChange={(event) => updateRow(row.key, { qty: event.target.value })}
                      onKeyDown={(event) => handleFieldKeyDown(event, row.key, "qty")}
                    />
                  </label>
                  <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-4 xl:col-span-1">
                    {row.photo ? (
                      <div className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={row.photo.dataUrl} alt={`Photo for opening ${number}`} className="h-11 w-11 rounded-lg border border-slate-200 object-cover" />
                        <button
                          type="button"
                          className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-white"
                          aria-label={`Remove photo for opening ${number}`}
                          onClick={() => updateRow(row.key, { photo: null })}
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <label className={`inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 ${photoBusy[row.key] ? "opacity-60" : ""}`}>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="sr-only"
                          disabled={sheetDisabled || photoBusy[row.key]}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            void choosePhoto(row.key, file);
                          }}
                        />
                        {photoBusy[row.key] ? "Processing…" : "Photo"}
                        <span className="sr-only"> for opening {number}</span>
                      </label>
                    )}
                    <button type="button" className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50" aria-label={`Duplicate opening ${number}`} onClick={() => duplicateRow(row.key)}>
                      Copy
                    </button>
                    <button type="button" className="min-h-[44px] rounded-lg border border-rose-200 bg-white px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50" aria-label={`Delete opening ${number}`} onClick={() => deleteRow(row.key)}>
                      Delete
                    </button>
                  </div>
                </div>

                {!analysis.blank && (analysis.width !== null || analysis.height !== null) ? (
                  <p className="mt-2 text-xs text-slate-600 xl:pl-10">
                    {row.roughOpening
                      ? <>RO {formatInches(analysis.width)} × {formatInches(analysis.height)} → <strong className="text-slate-800">unit {formatInches(analysis.unitWidth)} × {formatInches(analysis.unitHeight)}</strong></>
                      : <>Unit <strong className="text-slate-800">{formatInches(analysis.width)} × {formatInches(analysis.height)}</strong> in</>}
                    {analysis.qty && analysis.qty > 1 ? <> · qty {analysis.qty}</> : null}
                  </p>
                ) : null}
                {photoErrors[row.key] ? <p className="mt-1 text-xs text-rose-700 xl:pl-10">{photoErrors[row.key]}</p> : null}
                {shownErrors.length || analysis.warnings.length || (showLocationMissing && !row.location.trim() && !attempted) ? (
                  <ul className="mt-1 space-y-0.5 text-xs xl:pl-10">
                    {shownErrors.map((item) => <li key={item} className="text-rose-700">{item}</li>)}
                    {!attempted && showLocationMissing && !row.location.trim() ? <li className="text-amber-800">No room / location yet.</li> : null}
                    {analysis.warnings.map((item) => <li key={item} className="text-amber-800">Warning: {item}</li>)}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </fieldset>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className="min-h-[44px] rounded-lg border border-brand-500 bg-white px-4 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-60" onClick={() => addRow()} disabled={sheetDisabled}>
            + Add opening
          </button>
          {lastDeleted ? (
            <button type="button" className="min-h-[44px] rounded-lg px-3 text-sm font-semibold text-slate-700 underline" onClick={undoDelete} disabled={sheetDisabled}>
              Undo delete of opening {lastDeleted.index + 1}
            </button>
          ) : null}
        </div>
      </section>

      {submission ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" role="status">
          <p className="font-semibold">These measurements are already on the estimate.</p>
          <p className="mt-1">
            {submission.pendingPhotos.length
              ? `${submission.pendingPhotos.length} photo${submission.pendingPhotos.length === 1 ? " still needs" : "s still need"} to upload.`
              : "Nothing is left to upload."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {submission.pendingPhotos.length ? (
              <button type="button" className="min-h-[44px] rounded-lg bg-brand-600 px-4 font-semibold text-white hover:bg-brand-700 disabled:opacity-60" onClick={() => void uploadPhotosAndPrice(submission)} disabled={busy}>
                Retry photo upload
              </button>
            ) : null}
            <button type="button" className="min-h-[44px] rounded-lg border border-amber-300 bg-white px-4 font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60" onClick={leaveForProject} disabled={busy}>
              {submission.pendingPhotos.length ? "Continue without these photos" : "Open project"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">{error}</p> : null}

      <div className="sticky bottom-0 z-10 -mx-1 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 text-sm text-slate-600" aria-live="polite">
            {progress ? (
              <span className="font-semibold text-brand-700">{progress}</span>
            ) : (
              <>
                <span className="font-semibold text-slate-900">{measured.length} opening{measured.length === 1 ? "" : "s"}</span>
                {totalQty !== measured.length ? <> · {totalQty} windows</> : null}
                {errorRows.length ? <span className="text-rose-700"> · {errorRows.length} to fix</span> : null}
                {warningCount ? <span className="text-amber-800"> · {warningCount} size warning{warningCount === 1 ? "" : "s"}</span> : null}
              </>
            )}
          </div>
          <button
            type="button"
            className="min-h-[48px] w-full rounded-xl bg-brand-600 px-5 text-base font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60 sm:w-auto"
            onClick={() => void addToEstimate()}
            disabled={busy || Boolean(submission) || !measured.length}
          >
            {busy ? "Working…" : totalQty ? `Add ${totalQty} window${totalQty === 1 ? "" : "s"} to estimate` : "Add windows to estimate"}
          </button>
        </div>
      </div>
    </div>
  );
}
