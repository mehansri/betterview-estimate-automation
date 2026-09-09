"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CustomerDoorOpening,
  CustomerEstimate,
  CustomerEstimateDraft,
  CustomerWindowLine,
  CommercialSettings,
  DoorCatalog,
  DoorOpeningSpec,
  QuoteCatalog,
  QuoteLineInput,
  QuoteLineType,
  createCustomerEstimate,
  duplicateCustomerEstimate,
  fetchCustomerEstimate,
  finalizeCustomerEstimate,
  fetchDoorCatalog,
  fetchQuoteCatalog,
  priceCustomerEstimate,
  updateCustomerEstimate,
} from "@/lib/api";
import EstimateDocument from "@/components/EstimateDocument";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import LocationInput from "@/components/LocationInput";
import { isBetween, isAtLeast, numericInputValue, NumericInputValue } from "@/lib/numericInput";
import { describeDoorLine, describeWindowSpec, descriptionWithProductDetails } from "@/lib/productDescriptions";
import { groupWindowStyles, windowStyleLabel } from "@/lib/styleOptions";
import { getCombinationSuggestion } from "@/lib/windowSuggestions";

type WindowEditor = {
  type: QuoteLineType;
  style: string;
  width: NumericInputValue;
  height: NumericInputValue;
  qty: NumericInputValue;
  colour_ext: string;
  loe180: boolean;
  i89: boolean;
  gas: string;
  triple: boolean;
  tri_pane_lami: boolean;
  frost_tint: boolean;
  brickmould: boolean;
  wood_jamb: boolean;
  sliding_ft: number;
  swing_kind: string;
  head_seat: string;
  lite_count: NumericInputValue;
  location: string;
  description: string;
};

type DoorEditor = {
  material: "fiberglass" | "steel";
  opening_type: DoorOpeningSpec["opening_type"];
  finish: string;
  location: string;
  description: string;
};

const COLORS = ["white", "black", "dark bronze", "charcoal", "sandstone"];
const GAS = ["argon", "50/50", "krypton"];
const OPENING_TYPES: Array<{ value: DoorOpeningSpec["opening_type"]; label: string }> = [
  { value: "single_door", label: "Single door" },
  { value: "single_1_sidelite", label: "Single + 1 sidelite" },
  { value: "single_2_sidelites", label: "Single + 2 sidelites" },
  { value: "double_door", label: "Double door" },
  { value: "double_2_sidelites", label: "Double + 2 sidelites" },
];

function id() {
  return globalThis.crypto?.randomUUID?.() || `line-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function plusDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function money(value: number | undefined | null, currency = "CAD") {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(value || 0);
}

function blankEstimate(): CustomerEstimate {
  return {
    id: "",
    estimate_number: null,
    status: "draft",
    customer_name: "",
    company_name: "",
    email: "",
    phone: "",
    project_name: "",
    project_address: "",
    salesperson: "",
    estimate_date: today(),
    valid_until: plusDays(30),
    description: "",
    notes: "",
    terms: "This estimate is based on the information available at the time of quoting. Final measurements, site conditions, product availability, and installation details will be confirmed before ordering.",
    windows: [],
    doors: [],
    commercial: { preset_id: "standard", negotiated_discount_percent: 0, agreed_customer_total: null, presentation_mode: "internal" },
    pricing: null,
    pricing_hash: null,
    created_at: "",
    updated_at: "",
    finalized_at: null,
  };
}

function blankWindow(catalog?: QuoteCatalog | null): WindowEditor {
  return {
    type: "window",
    style: catalog?.styles[0]?.code || "WC-100",
    width: 30,
    height: 60,
    qty: 1,
    colour_ext: "white",
    loe180: true,
    i89: false,
    gas: "argon",
    triple: false,
    tri_pane_lami: false,
    frost_tint: false,
    brickmould: false,
    wood_jamb: false,
    sliding_ft: catalog?.patio_sliding_sizes[0] || 6,
    swing_kind: catalog?.patio_swing_kinds[0] || "single",
    head_seat: catalog?.baybow.head_seat_sizes[0] || "up to 8ft wide",
    lite_count: 3,
    location: "",
    description: "",
  };
}

function windowLite(editor: WindowEditor, style: string, width = editor.width, catalog?: QuoteCatalog | null): QuoteLineInput {
  const accessories: Array<{ kind: string; name: string }> = [];
  if (editor.brickmould) {
    const name = catalog?.accessories.brickmould?.[0]?.name;
    if (name) accessories.push({ kind: "brickmould", name });
  }
  if (editor.wood_jamb) {
    const name = catalog?.accessories.wood_jamb?.[0]?.name;
    if (name) accessories.push({ kind: "wood_jamb", name });
  }
  return {
    type: "window",
    style,
    width,
    height: editor.height,
    qty: 1,
    colour_ext: editor.colour_ext,
    glazing: {
      loe180: editor.loe180,
      i89: editor.i89,
      gas: editor.gas,
      triple: editor.triple,
      tri_pane_lami: editor.tri_pane_lami,
      frost_tint: editor.frost_tint,
    },
    accessories,
  };
}

function buildWindowSpec(editor: WindowEditor, catalog: QuoteCatalog | null): QuoteLineInput {
  if (editor.type === "window") return { ...windowLite(editor, editor.style, editor.width, catalog), qty: editor.qty };
  if (editor.type === "patio_sliding") {
    return {
      type: "patio_sliding",
      qty: editor.qty,
      nominal_ft: editor.sliding_ft,
      colour_ext: editor.colour_ext,
      glazing: { loe180: editor.loe180, i89: editor.i89, gas: editor.gas, triple: editor.triple, frost_tint: editor.frost_tint },
      assembled: true,
    };
  }
  if (editor.type === "patio_swing") {
    return {
      type: "patio_swing",
      qty: editor.qty,
      kind: editor.swing_kind,
      width: editor.width,
      height: editor.height,
      colour_ext: editor.colour_ext,
      glazing: { loe180: editor.loe180, i89: editor.i89, gas: editor.gas, triple: editor.triple },
    };
  }
  if (editor.type === "combination") {
    return {
      type: "combination",
      qty: editor.qty,
      layout: { cols: 2, rows: 1 },
      lites: [windowLite(editor, editor.style, editor.width, catalog), windowLite(editor, editor.style, editor.width, catalog)],
    };
  }
  const liteCount = editor.lite_count === "" ? 0 : editor.lite_count;
  const liteWidth = editor.width === "" || editor.lite_count === "" ? "" : editor.width / editor.lite_count;
  return {
    type: "bay_bow",
    qty: editor.qty,
    lites: Array.from({ length: liteCount }, (_, index) => windowLite(editor, catalog?.styles[index % Math.max(catalog?.styles.length || 1, 1)]?.code || editor.style, liteWidth, catalog)),
    head_seat: editor.head_seat,
  };
}

function windowLabel(line: CustomerWindowLine) {
  const spec = line.spec;
  if (line.description) return line.description;
  return describeWindowSpec(spec);
}

function partFromRow(row: DoorCatalog["materials"][number]["slabs"][number] | undefined) {
  return {
    series: row?.series || "group_a",
    glass_size: row?.glass_size || undefined,
    panel: row?.panel || undefined,
    height: row?.height || '6\'8"',
    qty: 1,
  };
}

function makeDoorSpec(catalog: DoorCatalog, material: "fiberglass" | "steel", openingType: DoorOpeningSpec["opening_type"], finish?: string): DoorOpeningSpec {
  const data = catalog.materials.find((entry) => entry.key === material) || catalog.materials[0];
  const doorRow = data.slabs.find((row) => row.kind === "slab" && row.component === "door" && row.series === "group_a") || data.slabs.find((row) => row.kind === "slab" && row.component === "door");
  const sideliteRow = data.slabs.find((row) => row.kind === "slab" && row.component === "sidelite" && row.series === "group_a") || data.slabs.find((row) => row.kind === "slab" && row.component === "sidelite");
  const double = openingType === "double_door" || openingType === "double_2_sidelites";
  const sideliteCount = openingType === "single_1_sidelite" ? 1 : openingType === "single_2_sidelites" || openingType === "double_2_sidelites" ? 2 : 0;
  return {
    material,
    finish: finish || data.finishes[0]?.key || undefined,
    opening_type: openingType,
    door: partFromRow(doorRow),
    door2: double ? partFromRow(doorRow) : undefined,
    sidelites: Array.from({ length: sideliteCount }, () => partFromRow(sideliteRow)),
    pull_bars: [],
    options: [],
  };
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`project-field ${className}`}><span>{label}</span>{children}</label>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="project-toggle"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

type AgreedTotalBasis = {
  baseTotal: number;
  minimumFloorTotal: number;
  minimumAuthorizedTotal: number;
  minimumNonDiscountableTotal: number;
  baseMerchandise: number;
  protectedInstall: number;
  doorTotal: number;
  hstRate: number;
  maxDiscountPercent: number;
};

type AgreedTotalOffer = AgreedTotalBasis & {
  target: number;
  discountPercent: number;
  discountAmount: number;
  aboveBase: boolean;
  belowHardMinimum: boolean;
  underAuthorizedFloor: boolean;
  error?: string;
};

function getAgreedTotalBasis(pricing: CustomerEstimate["pricing"]): AgreedTotalBasis | null {
  if (!pricing) return null;

  const windowQuote = pricing.window_quote as unknown as Record<string, unknown> | null | undefined;
  const windowTotals = windowQuote && typeof windowQuote.totals === "object" && windowQuote.totals ? windowQuote.totals as Record<string, unknown> : {};
  const salesPricing = windowQuote && typeof windowQuote.sales_pricing === "object" && windowQuote.sales_pricing ? windowQuote.sales_pricing as Record<string, unknown> : {};
  const quoteConfig = windowQuote && typeof windowQuote.config === "object" && windowQuote.config ? windowQuote.config as Record<string, unknown> : {};
  const doorQuote = pricing.door_quote && typeof pricing.door_quote === "object" ? pricing.door_quote : {};
  const doorTotals = typeof doorQuote.totals === "object" && doorQuote.totals ? doorQuote.totals as Record<string, unknown> : {};
  const hstRate = numberValue(quoteConfig.hst, 0.13);
  const doorSubtotal = numberValue(doorTotals.sell);
  const doorHst = numberValue(doorTotals.hst);
  const doorTotal = numberValue(doorTotals.customer_total, doorSubtotal + doorHst);
  const baseMerchandise = numberValue(salesPricing.base_merchandise_sell);
  const protectedInstall = numberValue(salesPricing.protected_install_sell);
  const baseWindowSubtotal = baseMerchandise + protectedInstall;
  const baseSubtotal = numberValue(pricing.totals.base_subtotal, baseWindowSubtotal + doorSubtotal);
  const baseHst = numberValue(pricing.totals.base_hst, baseWindowSubtotal * hstRate + doorHst);
  const baseTotal = numberValue(pricing.totals.base_total, baseSubtotal + baseHst);
  const floorWindowSubtotal = numberValue(salesPricing.minimum_floor_sell, baseWindowSubtotal);
  const floorSubtotal = numberValue(pricing.totals.minimum_floor_subtotal, floorWindowSubtotal + doorSubtotal);
  const floorHst = (floorWindowSubtotal * hstRate) + doorHst;
  const minimumFloorTotal = numberValue(pricing.totals.minimum_floor_total, floorSubtotal + floorHst);
  const maxDiscountPercent = numberValue(salesPricing.maximum_allowed_discount_percent);
  const authorizedWindowSubtotal = baseMerchandise * Math.max(0, 1 - maxDiscountPercent / 100) + protectedInstall;
  const authorizedSubtotal = authorizedWindowSubtotal + doorSubtotal;
  const minimumAuthorizedTotal = authorizedSubtotal + authorizedWindowSubtotal * hstRate + doorHst;
  const minimumNonDiscountableTotal = protectedInstall + protectedInstall * hstRate + doorTotal;

  if (baseMerchandise <= 0) return null;
  return { baseTotal, minimumFloorTotal, minimumAuthorizedTotal, minimumNonDiscountableTotal, baseMerchandise, protectedInstall, doorTotal, hstRate, maxDiscountPercent };
}

export default function ProjectEstimateBuilder({ estimateId }: { estimateId?: string }) {
  const [estimate, setEstimate] = useState<CustomerEstimate>(blankEstimate);
  const [loading, setLoading] = useState(Boolean(estimateId));
  const [busy, setBusy] = useState(false);
  const [autoPricing, setAutoPricing] = useState(false);
  const [needsReprice, setNeedsReprice] = useState(false);
  const [agreedTotalText, setAgreedTotalText] = useState("");
  const [managerReason, setManagerReason] = useState("");
  const [managerToken, setManagerToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const pricingFingerprint = useMemo(
    () => JSON.stringify({ windows: estimate.windows, doors: estimate.doors, commercial: estimate.commercial }),
    [estimate.windows, estimate.doors, estimate.commercial],
  );
  const pricingFingerprintRef = useRef(pricingFingerprint);
  pricingFingerprintRef.current = pricingFingerprint;

  useEffect(() => {
    if (!estimateId) return;
    fetchCustomerEstimate(estimateId)
      .then((loaded) => {
        setEstimate(loaded);
        setNeedsReprice(false);
        setAgreedTotalText(loaded.commercial.agreed_customer_total == null ? "" : String(loaded.commercial.agreed_customer_total));
        setManagerReason(loaded.commercial.manager_override_reason || "");
        setManagerToken("");
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load this estimate."))
      .finally(() => setLoading(false));
  }, [estimateId]);

  const editable = estimate.status !== "finalized";
  const missingLocationLabels = editable
    ? [
        ...estimate.windows.map((line, index) => (line.location.trim() ? null : `window item ${index + 1}`)),
        ...estimate.doors.map((opening, index) => (opening.location.trim() ? null : `door item ${index + 1}`)),
      ].filter((label): label is string => label !== null)
    : [];
  const agreedBasis = useMemo(() => getAgreedTotalBasis(estimate.pricing), [estimate.pricing]);
  const agreedOffer = useMemo<AgreedTotalOffer | null>(() => {
    if (!agreedBasis || !agreedTotalText.trim()) return null;
    const target = Number(agreedTotalText);
    if (!Number.isFinite(target)) return { ...agreedBasis, target: 0, discountPercent: 0, discountAmount: 0, aboveBase: false, belowHardMinimum: false, underAuthorizedFloor: false, error: "Enter a valid customer total." };
    if (target <= 0) return { ...agreedBasis, target, discountPercent: 0, discountAmount: 0, aboveBase: false, belowHardMinimum: false, underAuthorizedFloor: false, error: "Enter a customer total above $0." };
    const targetWindowTotal = target - agreedBasis.doorTotal;
    const targetWindowSubtotal = targetWindowTotal / (1 + agreedBasis.hstRate);
    const targetMerchandise = targetWindowSubtotal - agreedBasis.protectedInstall;
    const discountPercent = ((agreedBasis.baseMerchandise - targetMerchandise) / agreedBasis.baseMerchandise) * 100;
    const aboveBase = target > agreedBasis.baseTotal + 0.01;
    const belowHardMinimum = target < agreedBasis.minimumNonDiscountableTotal - 0.01;
    const underAuthorizedFloor = target < agreedBasis.minimumAuthorizedTotal - 0.01;
    return {
      ...agreedBasis,
      target,
      discountPercent: Math.max(0, discountPercent),
      discountAmount: Math.max(0, agreedBasis.baseTotal - target),
      aboveBase,
      belowHardMinimum,
      underAuthorizedFloor,
    };
  }, [agreedBasis, agreedTotalText]);
  function updateMetadata(patch: Partial<CustomerEstimate>) {
    if (!editable) return;
    setEstimate((current) => ({ ...current, ...patch }));
    setMessage(null);
  }

  function productChanged(update: (current: CustomerEstimate) => CustomerEstimate) {
    if (!editable) return;
    setEstimate((current) => {
      const next = update(current);
      return {
        ...next,
        commercial: {
          ...next.commercial,
          agreed_customer_total: null,
          negotiated_discount_percent: 0,
          manager_override_reason: null,
        },
      };
    });
    setNeedsReprice(true);
    setManagerReason("");
    setManagerToken("");
    setMessage(null);
  }

  function asDraft(value: CustomerEstimate): CustomerEstimateDraft {
    return {
      customer_name: value.customer_name,
      company_name: value.company_name,
      email: value.email,
      phone: value.phone,
      project_name: value.project_name,
      project_address: value.project_address,
      salesperson: value.salesperson,
      estimate_date: value.estimate_date,
      valid_until: value.valid_until,
      description: value.description,
      notes: value.notes,
      terms: value.terms,
      windows: value.windows,
      doors: value.doors,
      commercial: value.commercial,
    };
  }

  async function saveCurrent(): Promise<CustomerEstimate> {
    const saved = estimate.id ? await updateCustomerEstimate(estimate.id, asDraft(estimate)) : await createCustomerEstimate(asDraft(estimate));
    setEstimate(saved);
    setNeedsReprice(false);
    return saved;
  }

  async function saveDraft() {
    setBusy(true); setError(null); setMessage(null);
    try {
      await saveCurrent();
      setMessage("Draft saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the draft.");
    } finally { setBusy(false); }
  }

  async function openWindowWorkspace(mode: "add" | "edit" = "edit") {
    if (!estimate.id) return;
    if (!editable) {
      window.location.href = `/?projectId=${estimate.id}&editWindows=1`;
      return;
    }
    setBusy(true); setError(null); setMessage(null);
    try {
      const saved = await saveCurrent();
      window.location.href = mode === "edit"
        ? `/?projectId=${saved.id}&editWindows=1`
        : `/?projectId=${saved.id}`;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the project before opening the window quote.");
    } finally { setBusy(false); }
  }

  async function openDoorWorkspace(mode: "add" | "edit" = "edit") {
    if (!estimate.id) return;
    if (!editable) {
      window.location.href = `/doors?projectId=${estimate.id}&editDoors=1`;
      return;
    }
    setBusy(true); setError(null); setMessage(null);
    try {
      const saved = await saveCurrent();
      window.location.href = mode === "edit"
        ? `/doors?projectId=${saved.id}&editDoors=1`
        : `/doors?projectId=${saved.id}`;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the project before opening the door quote.");
    } finally { setBusy(false); }
  }

  async function priceProjectWithCommercial(commercial: CommercialSettings, successMessage = "Project priced successfully.") {
    setBusy(true); setError(null); setMessage(null);
    try {
      const draft = { ...asDraft(estimate), commercial };
      const saved = estimate.id ? await updateCustomerEstimate(estimate.id, draft) : await createCustomerEstimate(draft);
      const priced = await priceCustomerEstimate(saved.id, managerToken.trim() || undefined);
      setEstimate(priced);
      setNeedsReprice(false);
      setMessage(priced.pricing?.review_required ? "Priced with review items. Resolve them before finalization." : successMessage);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not price the project.");
    } finally { setBusy(false); }
  }

  async function priceProject() {
    await priceProjectWithCommercial(estimate.commercial);
  }

  // Product edits are persisted and repriced through FastAPI automatically.
  // Metadata fields remain ordinary draft edits and do not cause unnecessary
  // pricing requests.
  useEffect(() => {
    if (!editable || !needsReprice || (!estimate.windows.length && !estimate.doors.length)) return;
    const expectedFingerprint = pricingFingerprint;
    const snapshot = estimate;
    const timer = window.setTimeout(async () => {
      setAutoPricing(true);
      setError(null);
      try {
        const draft = asDraft(snapshot);
        const saved = snapshot.id
          ? await updateCustomerEstimate(snapshot.id, draft)
          : await createCustomerEstimate(draft);
        const priced = await priceCustomerEstimate(saved.id);
        if (pricingFingerprintRef.current !== expectedFingerprint) return;
        setEstimate(priced);
        setNeedsReprice(false);
        setMessage(priced.pricing?.review_required ? "Live price updated with review items." : "Live price updated.");
      } catch (reason) {
        if (pricingFingerprintRef.current === expectedFingerprint) {
          setError(reason instanceof Error ? reason.message : "Could not update the live project price.");
        }
      } finally {
        if (pricingFingerprintRef.current === expectedFingerprint) setAutoPricing(false);
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [editable, estimate, needsReprice, pricingFingerprint]);

  async function applyAgreedTotal() {
    if (!editable || !estimate.pricing || !agreedOffer) return;
    if (agreedOffer.error) {
      setError(agreedOffer.error);
      return;
    }
    if (agreedOffer.aboveBase) {
      setError(`The agreed total cannot exceed the undiscounted estimate total of ${money(agreedOffer.baseTotal)}.`);
      return;
    }
    if (agreedOffer.belowHardMinimum) {
      setError(`This total is below the protected installation and door amount of ${money(agreedOffer.minimumNonDiscountableTotal)}. Increase the customer total or change the scope.`);
      return;
    }
    if (agreedOffer.underAuthorizedFloor && (!managerReason.trim() || !managerToken.trim())) {
      setEstimate((current) => ({
        ...current,
        commercial: {
          ...current.commercial,
          agreed_customer_total: agreedOffer.target,
          negotiated_discount_percent: agreedOffer.discountPercent,
          manager_override_reason: managerReason.trim() || current.commercial.manager_override_reason || undefined,
        },
      }));
      setNeedsReprice(true);
      setError(`This offer is below the authorized minimum of ${money(agreedOffer.minimumAuthorizedTotal)}. Enter a manager reason and authorization token, then apply it again.`);
      return;
    }
    const commercial: CommercialSettings = {
      ...estimate.commercial,
      agreed_customer_total: agreedOffer.target,
      negotiated_discount_percent: agreedOffer.discountPercent,
      manager_override_reason: agreedOffer.underAuthorizedFloor ? managerReason.trim() : null,
      presentation_mode: "internal",
    };
    await priceProjectWithCommercial(commercial, "Estimate priced at the agreed customer total.");
  }

  async function startQuote(path: "/" | "/doors") {
    setBusy(true); setError(null); setMessage(null);
    try {
      const saved = await saveCurrent();
      window.location.href = `${path}?projectId=${saved.id}`;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create the project.");
      setBusy(false);
    }
  }

  async function finalizeProject() {
    if (!estimate.id) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const finalized = await finalizeCustomerEstimate(estimate.id);
      setEstimate(finalized);
      setMessage("Estimate finalized. It is now read-only.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not finalize the estimate.");
    } finally { setBusy(false); }
  }

  async function duplicateProject() {
    if (!estimate.id) return;
    setBusy(true); setError(null);
    try {
      const duplicate = await duplicateCustomerEstimate(estimate.id);
      window.location.href = `/projects/${duplicate.id}`;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not duplicate the estimate.");
      setBusy(false);
    }
  }

  if (loading) return <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading estimate…</p>;

  return (
    <div className="project-estimate-shell">
      <div className="project-toolbar no-print">
        <div><p className="eyebrow">Project estimate</p><h2>{estimate.estimate_number || "New Better View estimate"}</h2><p className="text-muted">{estimate.status === "finalized" ? "Finalized customer document" : autoPricing ? "Updating the live price…" : "Window and door prices update automatically as selections change."}</p></div>
        <div className="project-actions">
          {estimate.status === "finalized" ? <><button className="button secondary" type="button" onClick={() => window.print()}>Print / Save PDF</button><button className="button primary" type="button" onClick={duplicateProject} disabled={busy}>Duplicate as draft</button></> : <><button className="button secondary" type="button" onClick={saveDraft} disabled={busy || autoPricing}>Save draft</button>{error && needsReprice ? <button className="button secondary" type="button" onClick={priceProject} disabled={busy || autoPricing || (!estimate.windows.length && !estimate.doors.length)}>{autoPricing ? "Updating…" : "Retry pricing"}</button> : null}<button className="button primary" type="button" title={missingLocationLabels.length ? `Add a location to ${missingLocationLabels.join(", ")}` : undefined} onClick={finalizeProject} disabled={busy || autoPricing || !estimate.id || estimate.status !== "priced" || needsReprice || Boolean(estimate.pricing?.review_required) || missingLocationLabels.length > 0}>{busy || autoPricing ? "Working…" : "Finalize estimate"}</button></>}
        </div>
      </div>

      {message ? <p className="project-message no-print">{message}</p> : null}
      {error ? <p className="project-error no-print">{error}</p> : null}

      <div className="project-workspace">
        <section className="project-editor no-print">
          <div className="editor-card"><div className="card-heading"><div><p className="eyebrow">Customer details</p><h3>Who is this estimate for?</h3></div><span className={`status-pill status-${estimate.status}`}>{estimate.status}</span></div><div className="editor-grid">
            <Field label="Customer name *"><input className="project-input" value={estimate.customer_name} onChange={(event) => updateMetadata({ customer_name: event.target.value })} disabled={!editable} /></Field>
            <Field label="Company (optional)"><input className="project-input" value={estimate.company_name} onChange={(event) => updateMetadata({ company_name: event.target.value })} disabled={!editable} placeholder="Business or organization name" /></Field>
            <Field label="Email"><input className="project-input" type="email" value={estimate.email} onChange={(event) => updateMetadata({ email: event.target.value })} disabled={!editable} /></Field>
            <Field label="Phone"><input className="project-input" value={estimate.phone} onChange={(event) => updateMetadata({ phone: event.target.value })} disabled={!editable} /></Field>
            <Field label="Project name"><input className="project-input" value={estimate.project_name} onChange={(event) => updateMetadata({ project_name: event.target.value })} disabled={!editable} /></Field>
            <Field label="Salesperson"><input className="project-input" value={estimate.salesperson} onChange={(event) => updateMetadata({ salesperson: event.target.value })} disabled={!editable} /></Field>
            <Field label="Estimate date"><input className="project-input" type="date" value={estimate.estimate_date} onChange={(event) => updateMetadata({ estimate_date: event.target.value })} disabled={!editable} /></Field>
            <Field label="Valid until"><input className="project-input" type="date" value={estimate.valid_until} onChange={(event) => updateMetadata({ valid_until: event.target.value })} disabled={!editable} /></Field>
            <Field label="Project address" className="field-span-2"><AddressAutocomplete className="project-input" multiline rows={2} value={estimate.project_address} onChange={(value) => updateMetadata({ project_address: value })} disabled={!editable} placeholder="Start typing a Canadian address" /></Field>
            <Field label="Description" className="field-span-2"><textarea className="project-input" rows={3} value={estimate.description} onChange={(event) => updateMetadata({ description: event.target.value })} disabled={!editable} placeholder="Describe the work included in the estimate." /></Field>
            <Field label="Notes" className="field-span-2"><textarea className="project-input" rows={2} value={estimate.notes} onChange={(event) => updateMetadata({ notes: event.target.value })} disabled={!editable} /></Field>
            <Field label="Terms" className="field-span-2"><textarea className="project-input" rows={3} value={estimate.terms} onChange={(event) => updateMetadata({ terms: event.target.value })} disabled={!editable} /></Field>
          </div></div>

          <div className="editor-card">
            <div className="card-heading"><div><p className="eyebrow">Sales price</p><h3>Agreed customer total</h3></div><span className="status-pill">{estimate.commercial.agreed_customer_total != null ? "Offer set" : "List / preset"}</span></div>
            <p className="project-help">Enter the customer’s total including HST. The difference becomes a merchandise discount while installation remains protected. Door pricing stays fixed when the project includes doors.</p>
            {!estimate.pricing ? <p className="review-box">Price the estimate first. Once the current estimate is priced, enter the total the customer agreed to and apply it.</p> : null}
            {estimate.pricing && !agreedBasis ? <p className="review-box">An agreed total can be converted into a discount when the estimate contains windows. Door-only estimates keep their catalog price.</p> : null}
            <div className="editor-grid">
              <Field label="Customer agreed total (incl. HST)"><input className="project-input" type="number" min={0} step={0.01} value={agreedTotalText} onChange={(event) => setAgreedTotalText(event.target.value)} disabled={!editable || !estimate.pricing || busy} placeholder="e.g. 12500.00" /></Field>
              <div className="project-actions"><button type="button" className="button primary" onClick={applyAgreedTotal} disabled={!editable || busy || !estimate.pricing || !agreedOffer}>{busy ? "Working…" : "Apply agreed total & price"}</button></div>
            </div>
            {agreedBasis && agreedOffer && !agreedOffer.error ? <div className="offer-summary">
              <div><span>Undiscounted total</span><strong>{money(agreedOffer.baseTotal)}</strong></div>
              <div><span>Offer discount</span><strong>−{money(agreedOffer.discountAmount)}</strong></div>
              <div><span>Authorized minimum</span><strong>{money(agreedOffer.minimumAuthorizedTotal)}</strong></div>
              <div><span>Price-book floor</span><strong>{money(agreedOffer.minimumFloorTotal)}</strong></div>
              <div><span>Merchandise discount rate</span><strong>{agreedOffer.discountPercent.toFixed(2)}%</strong></div>
            </div> : null}
            {agreedOffer?.aboveBase ? <div className="review-box"><strong>The agreed total is above the undiscounted estimate.</strong><p>Use a sales preset or change the scope if the customer needs a higher total.</p></div> : null}
            {agreedOffer?.belowHardMinimum ? <div className="review-box"><strong>The agreed total is too low to price safely.</strong><p>It would reduce the merchandise below zero after protecting installation and door pricing.</p></div> : null}
            {agreedOffer?.underAuthorizedFloor ? <div className="review-box"><strong>Manager approval required</strong><p>This offer is below the authorized minimum of {money(agreedOffer.minimumAuthorizedTotal)}. Add the reason and authorization token before applying it.</p><div className="editor-grid">
              <Field label="Manager reason"><input className="project-input" value={managerReason} onChange={(event) => setManagerReason(event.target.value)} disabled={!editable || busy} placeholder="Approved promotional offer" /></Field>
              <Field label="Manager authorization token"><input className="project-input" type="password" value={managerToken} onChange={(event) => setManagerToken(event.target.value)} disabled={!editable || busy} placeholder="Required for override" /></Field>
            </div></div> : null}
          </div>

          <div className="product-hub">
            <article className="product-hub-card">
              <div className="product-hub-icon" aria-hidden="true">▦</div>
              <div className="product-hub-copy">
                <div className="product-hub-heading"><div><p className="eyebrow">Windows &amp; patio doors</p><h3>{estimate.windows.length ? `${estimate.windows.length} line${estimate.windows.length === 1 ? "" : "s"} added` : "Add windows"}</h3></div><span className="count-badge">{estimate.windows.length}</span></div>
                <p>Configure styles, sizes, glazing, accessories, and sales pricing in the full Window City builder.</p>
                {estimate.pricing && estimate.windows.length ? <strong className="product-hub-total">{money(estimate.pricing.sections.windows.total)} <span>including HST</span></strong> : null}
                <div className="product-hub-actions">
                  {estimate.windows.length ? <button type="button" className="button secondary" onClick={() => openWindowWorkspace("edit")} disabled={busy || autoPricing || !editable}>{busy ? "Saving project…" : "Edit existing"}</button> : null}
                  <button type="button" className="button primary" onClick={() => estimate.id ? openWindowWorkspace("add") : startQuote("/")} disabled={busy || autoPricing || !editable}>{busy ? "Saving project…" : estimate.windows.length ? "Add more windows" : "Save & add windows"}</button>
                </div>
              </div>
            </article>

            <article className="product-hub-card">
              <div className="product-hub-icon door" aria-hidden="true">▯</div>
              <div className="product-hub-copy">
                <div className="product-hub-heading"><div><p className="eyebrow">Entry doors</p><h3>{estimate.doors.length ? `${estimate.doors.length} opening${estimate.doors.length === 1 ? "" : "s"} added` : "Add doors"}</h3></div><span className="count-badge">{estimate.doors.length}</span></div>
                <p>Configure door systems, glass, sidelites, hardware, finishes, and installation in the Palma builder.</p>
                {estimate.pricing && estimate.doors.length ? <strong className="product-hub-total">{money(estimate.pricing.sections.doors.total)} <span>including HST</span></strong> : null}
                <div className="product-hub-actions">
                  {estimate.doors.length ? <button type="button" className="button secondary" onClick={() => openDoorWorkspace("edit")} disabled={busy || autoPricing || !editable}>{busy ? "Saving project…" : "Edit existing"}</button> : null}
                  <button type="button" className="button primary" onClick={() => estimate.id ? openDoorWorkspace("add") : startQuote("/doors")} disabled={busy || autoPricing || !editable}>{busy ? "Saving project…" : estimate.doors.length ? "Add more doors" : "Save & add doors"}</button>
                </div>
              </div>
            </article>
          </div>

          {estimate.pricing?.review_required ? <div className="review-box"><strong>Review required before finalization</strong>{estimate.pricing.warnings.map((warning, index) => <p key={`${warning.code}-${index}`}>{warning.message}</p>)}</div> : null}
          {missingLocationLabels.length ? <div className="review-box"><strong>Locations required before finalization</strong><p>Add a location to every window and door. Missing: {missingLocationLabels.join(", ")}.</p></div> : null}
        </section>
        <section className="project-preview"><EstimateDocument estimate={estimate} editable={editable} onChange={updateMetadata} /></section>
      </div>
    </div>
  );
}
