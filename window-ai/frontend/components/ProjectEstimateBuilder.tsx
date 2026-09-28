"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CustomerEstimate,
  CustomerEstimateDraft,
  CommercialSettings,
  EstimateAdder,
  EstimateTier,
  SavedTemplate,
  TaxRateEntry,
  createCustomerEstimate,
  createTemplate,
  duplicateCustomerEstimate,
  estimatePdfUrl,
  fetchBusinessSettings,
  fetchCustomerEstimate,
  fetchTemplates,
  finalizeCustomerEstimate,
  isLockedStatus,
  priceCustomerEstimate,
  reviseCustomerEstimate,
  updateCustomerEstimate,
} from "@/lib/api";
import EstimateDocument from "@/components/EstimateDocument";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import EstimateLifecycle from "@/components/estimate/EstimateLifecycle";
import JobItemsCard from "@/components/estimate/JobItemsCard";
import OptionTiersCard from "@/components/estimate/OptionTiersCard";
import PhotosCard from "@/components/estimate/PhotosCard";
import ProfitPanel from "@/components/estimate/ProfitPanel";
import { estimateToDraft, newEstimateLineId } from "@/lib/quoteHandoff";
import { useViewMode } from "@/lib/viewMode";

/** Better View CRM origin; "Send to CRM" is hidden when unset. */
const CRM_URL = (process.env.NEXT_PUBLIC_CRM_URL || "").trim().replace(/\/+$/, "");

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
    // New projects start on the sliding-margin preset (sales_config default).
    commercial: { preset_id: "sliding", negotiated_discount_percent: 0, agreed_customer_total: null, presentation_mode: "internal" },
    province: "ON",
    adders: [],
    tiers: [],
    selected_tier: null,
    follow_up_on: null,
    pricing: null,
    pricing_hash: null,
    created_at: "",
    updated_at: "",
    finalized_at: null,
  };
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`project-field ${className}`}><span>{label}</span>{children}</label>;
}

type EstimatePackage = Pick<CustomerEstimateDraft, "windows" | "doors" | "adders" | "tiers"> & { preset_id?: string };

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
  fixedTotal: number;
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
  const salesPricing = windowQuote && typeof windowQuote.sales_pricing === "object" && windowQuote.sales_pricing ? windowQuote.sales_pricing as Record<string, unknown> : {};
  const doorQuote = pricing.door_quote && typeof pricing.door_quote === "object" ? pricing.door_quote : {};
  const doorTotals = typeof doorQuote.totals === "object" && doorQuote.totals ? doorQuote.totals as Record<string, unknown> : {};
  const doorSales = typeof doorQuote.sales_pricing === "object" && doorQuote.sales_pricing ? doorQuote.sales_pricing as Record<string, unknown> : {};
  const hstRate = numberValue(pricing.tax_rate, 0.13);
  // An agreed total never discounts doors or job items: the server prices them
  // at their undiscounted amount, so the preview adds back any door discount.
  const doorDiscount = numberValue(doorSales.negotiated_discount_percent) > 0 ? numberValue(doorSales.merchandise_discount_amount) : 0;
  const fixedSubtotal = numberValue(doorTotals.sell) + doorDiscount + numberValue(pricing.sections.adders?.subtotal);
  const fixedTotal = fixedSubtotal * (1 + hstRate);
  const baseMerchandise = numberValue(salesPricing.base_merchandise_sell);
  const protectedInstall = numberValue(salesPricing.protected_install_sell);
  const baseTotal = numberValue(pricing.totals.base_total, (baseMerchandise + protectedInstall + fixedSubtotal) * (1 + hstRate));
  const floorWindowSubtotal = numberValue(salesPricing.minimum_floor_sell, baseMerchandise + protectedInstall);
  const minimumFloorTotal = numberValue(pricing.totals.minimum_floor_total, (floorWindowSubtotal + fixedSubtotal) * (1 + hstRate));
  const maxDiscountPercent = numberValue(salesPricing.maximum_allowed_discount_percent);
  const authorizedWindowSubtotal = baseMerchandise * Math.max(0, 1 - maxDiscountPercent / 100) + protectedInstall;
  const minimumAuthorizedTotal = (authorizedWindowSubtotal + fixedSubtotal) * (1 + hstRate);
  const minimumNonDiscountableTotal = (protectedInstall + fixedSubtotal) * (1 + hstRate);

  if (baseMerchandise <= 0) return null;
  return { baseTotal, minimumFloorTotal, minimumAuthorizedTotal, minimumNonDiscountableTotal, baseMerchandise, protectedInstall, fixedTotal, hstRate, maxDiscountPercent };
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
  const [taxRates, setTaxRates] = useState<Record<string, TaxRateEntry>>({});
  const [packages, setPackages] = useState<SavedTemplate<EstimatePackage>[]>([]);
  // Internal cost and margin follow the app-wide internal / customer view.
  const { internal: showInternal } = useViewMode();
  const pricingFingerprint = useMemo(
    () => JSON.stringify({
      windows: estimate.windows,
      doors: estimate.doors,
      commercial: estimate.commercial,
      adders: estimate.adders,
      tiers: estimate.tiers,
      selected_tier: estimate.selected_tier,
      province: estimate.province,
    }),
    [estimate.windows, estimate.doors, estimate.commercial, estimate.adders, estimate.tiers, estimate.selected_tier, estimate.province],
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

  useEffect(() => {
    fetchBusinessSettings()
      .then((settings) => {
        setTaxRates(settings.tax.rates);
        if (!estimateId) setEstimate((current) => ({ ...current, province: settings.tax.default_province }));
      })
      .catch(() => setTaxRates({}));
    fetchTemplates<EstimatePackage>("estimate").then(setPackages).catch(() => setPackages([]));
  }, [estimateId]);

  const editable = !isLockedStatus(estimate.status);
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
    const targetWindowTotal = target - agreedBasis.fixedTotal;
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
    return estimateToDraft(value);
  }

  /** Scope changes that affect price (job items, tiers, province) also reprice. */
  function scopeChanged(patch: Partial<CustomerEstimate>) {
    productChanged((current) => ({ ...current, ...patch }));
  }

  async function saveAsPackage() {
    const name = window.prompt("Name this package (e.g. Whole-house casement package)");
    if (!name?.trim()) return;
    try {
      const saved = await createTemplate<EstimatePackage>(name.trim(), "estimate", {
        windows: estimate.windows,
        doors: estimate.doors,
        adders: estimate.adders,
        tiers: estimate.tiers,
        preset_id: estimate.commercial.preset_id,
      });
      setPackages((current) => [...current, saved].sort((a, b) => a.name.localeCompare(b.name)));
      setMessage(`Saved package "${saved.name}".`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the package.");
    }
  }

  function startFromPackage(packageId: string) {
    const chosen = packages.find((item) => item.id === packageId);
    if (!chosen) return;
    const { windows = [], doors = [], adders = [], tiers = [], preset_id } = chosen.payload;
    productChanged((current) => ({
      ...current,
      windows: windows.map((line) => ({ ...line, id: newEstimateLineId("window") })),
      doors: doors.map((opening) => ({ ...opening, id: newEstimateLineId("door") })),
      adders: adders.map((adder) => ({ ...adder, id: newEstimateLineId("adder") })),
      tiers,
      selected_tier: null,
      commercial: { ...current.commercial, preset_id: preset_id || current.commercial.preset_id },
    }));
    setMessage(`Started from "${chosen.name}". Review the locations and sizes for this home.`);
  }

  /** Opens the CRM's import page, where the customer is added (or matched) and the estimate imported. */
  async function sendToCrm() {
    if (!CRM_URL || !estimate.id) return;
    if (!estimate.customer_name.trim()) {
      setError("Add the customer's name before sending this estimate to the CRM.");
      return;
    }
    // Open the tab inside the click so popup blockers allow it.
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    setBusy(true); setError(null); setMessage(null);
    try {
      const saved = editable ? await saveCurrent() : estimate;
      const url = `${CRM_URL}/estimates/import?source=estimator&project=${encodeURIComponent(saved.id)}`;
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (reason) {
      tab?.close();
      setError(reason instanceof Error ? reason.message : "Could not save the estimate before sending it.");
    } finally { setBusy(false); }
  }

  async function reviseProject() {
    if (!estimate.id) return;
    setBusy(true); setError(null);
    try {
      const revision = await reviseCustomerEstimate(estimate.id);
      window.location.href = `/projects/${revision.id}`;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create a revision.");
      setBusy(false);
    }
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
      setError(`This total is below the protected installation, door, and job-item amount of ${money(agreedOffer.minimumNonDiscountableTotal)}. Increase the customer total or change the scope.`);
      return;
    }
    if (agreedOffer.underAuthorizedFloor && (!managerReason.trim() || !managerToken.trim())) {
      // Nothing is saved until a manager approves; saving the offer now would
      // leave the estimate with settings the server refuses to price.
      setMessage(null);
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

  // The CRM imports the saved pricing snapshot, so only offer it once the
  // project is priced (or finalized) and has no unsaved product changes.

  if (loading) return <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading estimate…</p>;

  return (
    <div className="project-estimate-shell">
      <div className="project-toolbar no-print">
        <div><p className="eyebrow">Project estimate</p><h2>{estimate.estimate_number || "New Better View estimate"}{(estimate.revision_number || 1) > 1 ? <span className="status-pill ml-2 align-middle">Rev {estimate.revision_number}</span> : null}{estimate.deleted_at ? <span className="status-pill status-lost ml-2 align-middle">In trash</span> : null}{estimate.crm_opportunity_id ? <span className="status-pill ml-2 align-middle" title="Started from a CRM opportunity; it imports back to the same opportunity">Linked to CRM</span> : null}</h2><p className="text-muted">{!editable ? "Finalized customer document — create a revision to change it" : autoPricing ? "Updating the live price…" : "Window and door prices update automatically as selections change."}</p></div>
        <div className="project-actions">
          {!editable ? <><a className="button secondary" href={estimatePdfUrl(estimate.id)} target="_blank" rel="noreferrer">Download PDF</a><button className="button secondary" type="button" onClick={() => window.print()}>Print</button></> : <><button className="button secondary" type="button" onClick={saveDraft} disabled={busy || autoPricing}>Save draft</button>{error && needsReprice ? <button className="button secondary" type="button" onClick={priceProject} disabled={busy || autoPricing || (!estimate.windows.length && !estimate.doors.length)}>{autoPricing ? "Updating…" : "Retry pricing"}</button> : null}<button className="button primary" type="button" title={missingLocationLabels.length ? `Add a location to ${missingLocationLabels.join(", ")}` : undefined} onClick={finalizeProject} disabled={busy || autoPricing || !estimate.id || estimate.status !== "priced" || needsReprice || Boolean(estimate.pricing?.review_required) || missingLocationLabels.length > 0}>{busy || autoPricing ? "Working…" : "Finalize estimate"}</button></>}{CRM_URL && estimate.id ? <button className="button secondary" type="button" title={!estimate.pricing || needsReprice ? "Price the estimate before sending it to the CRM" : estimate.crm_opportunity_id ? "Import this estimate into the linked CRM opportunity" : "Add this customer to the CRM with this estimate"} onClick={sendToCrm} disabled={busy || autoPricing || !estimate.pricing || needsReprice}>Send to CRM</button> : null}
        </div>
      </div>

      {message ? <p className="project-message no-print">{message}</p> : null}
      {error ? <p className="project-error no-print">{error}</p> : null}

      <div className="project-workspace">
        <section className="project-editor no-print">
          {estimate.id ? <EstimateLifecycle estimate={estimate} onChanged={(next) => setEstimate(next)} onRevise={reviseProject} onDuplicate={duplicateProject} busy={busy || autoPricing} /> : null}

          <div className="editor-card"><div className="card-heading"><div><p className="eyebrow">Customer details</p><h3>Who is this estimate for?</h3></div><span className={`status-pill status-${estimate.status}`}>{estimate.status}</span></div><div className="editor-grid">
            <Field label="Customer name *"><input className="project-input" value={estimate.customer_name} onChange={(event) => updateMetadata({ customer_name: event.target.value })} disabled={!editable} /></Field>
            <Field label="Company (optional)"><input className="project-input" value={estimate.company_name} onChange={(event) => updateMetadata({ company_name: event.target.value })} disabled={!editable} placeholder="Business or organization name" /></Field>
            <Field label="Email"><input className="project-input" type="email" value={estimate.email} onChange={(event) => updateMetadata({ email: event.target.value })} disabled={!editable} /></Field>
            <Field label="Phone"><input className="project-input" value={estimate.phone} onChange={(event) => updateMetadata({ phone: event.target.value })} disabled={!editable} /></Field>
            <Field label="Project name"><input className="project-input" value={estimate.project_name} onChange={(event) => updateMetadata({ project_name: event.target.value })} disabled={!editable} /></Field>
            <Field label="Salesperson"><input className="project-input" value={estimate.salesperson} onChange={(event) => updateMetadata({ salesperson: event.target.value })} disabled={!editable} /></Field>
            <Field label="Estimate date"><input className="project-input" type="date" value={estimate.estimate_date} onChange={(event) => updateMetadata({ estimate_date: event.target.value })} disabled={!editable} /></Field>
            <Field label="Valid until"><input className="project-input" type="date" value={estimate.valid_until} onChange={(event) => updateMetadata({ valid_until: event.target.value })} disabled={!editable} /></Field>
            <Field label="Province (sales tax)"><select className="project-input" value={estimate.province || "ON"} onChange={(event) => scopeChanged({ province: event.target.value })} disabled={!editable}>
              {Object.keys(taxRates).length ? Object.entries(taxRates).map(([code, entry]) => <option key={code} value={code}>{entry.name} — {entry.components.map((component) => `${component.label} ${component.rate}%`).join(" + ")}</option>) : <option value={estimate.province || "ON"}>{estimate.province || "ON"}</option>}
            </select></Field>
            <Field label="Project address" className="field-span-2"><AddressAutocomplete className="project-input" multiline rows={2} value={estimate.project_address} onChange={(value) => updateMetadata({ project_address: value })} disabled={!editable} placeholder="Start typing a Canadian address" /></Field>
            <Field label="Description" className="field-span-2"><textarea className="project-input" rows={3} value={estimate.description} onChange={(event) => updateMetadata({ description: event.target.value })} disabled={!editable} placeholder="Describe the work included in the estimate." /></Field>
            <Field label="Notes" className="field-span-2"><textarea className="project-input" rows={2} value={estimate.notes} onChange={(event) => updateMetadata({ notes: event.target.value })} disabled={!editable} /></Field>
            <Field label="Terms" className="field-span-2"><textarea className="project-input" rows={3} value={estimate.terms} onChange={(event) => updateMetadata({ terms: event.target.value })} disabled={!editable} /></Field>
          </div></div>

          <div className="editor-card">
            <div className="card-heading"><div><p className="eyebrow">Sales price</p><h3>Agreed customer total</h3></div><span className="status-pill">{estimate.commercial.agreed_customer_total != null ? "Offer set" : "List / preset"}</span></div>
            <p className="project-help">Enter the customer’s total including tax. The difference becomes a window merchandise discount; installation, doors, and job items keep their price.</p>
            {!estimate.pricing ? <p className="review-box">Price the estimate first. Once the current estimate is priced, enter the total the customer agreed to and apply it.</p> : null}
            {estimate.pricing && !agreedBasis ? <p className="review-box">An agreed total can be converted into a discount when the estimate contains windows. Door-only estimates keep their catalog price.</p> : null}
            <div className="editor-grid">
              <Field label="Customer agreed total (incl. tax)"><input className="project-input" type="number" min={0} step={0.01} value={agreedTotalText} onChange={(event) => setAgreedTotalText(event.target.value)} disabled={!editable || !estimate.pricing || busy} placeholder="e.g. 12500.00" /></Field>
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
            {agreedOffer?.belowHardMinimum ? <div className="review-box"><strong>The agreed total is too low to price safely.</strong><p>It would reduce the merchandise below zero after protecting installation, doors, and job items.</p></div> : null}
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
                {estimate.pricing && estimate.windows.length ? <strong className="product-hub-total">{money(estimate.pricing.sections.windows.total)} <span>including tax</span></strong> : null}
                <div className="product-hub-actions">
                  {estimate.id && editable ? <Link className="button secondary" href={`/projects/${estimate.id}/measure`}>Measure sheet</Link> : null}
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
                {estimate.pricing && estimate.doors.length ? <strong className="product-hub-total">{money(estimate.pricing.sections.doors.total)} <span>including tax</span></strong> : null}
                <div className="product-hub-actions">
                  {estimate.doors.length ? <button type="button" className="button secondary" onClick={() => openDoorWorkspace("edit")} disabled={busy || autoPricing || !editable}>{busy ? "Saving project…" : "Edit existing"}</button> : null}
                  <button type="button" className="button primary" onClick={() => estimate.id ? openDoorWorkspace("add") : startQuote("/doors")} disabled={busy || autoPricing || !editable}>{busy ? "Saving project…" : estimate.doors.length ? "Add more doors" : "Save & add doors"}</button>
                </div>
              </div>
            </article>
          </div>

          {editable && !estimate.windows.length && !estimate.doors.length && packages.length ? (
            <div className="editor-card">
              <div className="card-heading"><div><p className="eyebrow">Packages</p><h3>Start from a saved package</h3></div></div>
              <select className="project-input" defaultValue="" onChange={(event) => { if (event.target.value) startFromPackage(event.target.value); }}>
                <option value="">Choose a package…</option>
                {packages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
          ) : null}

          <JobItemsCard estimate={estimate} editable={editable} onChange={(adders: EstimateAdder[]) => scopeChanged({ adders })} />
          <OptionTiersCard estimate={estimate} editable={editable} internal={showInternal} onChange={(tiers: EstimateTier[], selected_tier: string | null) => scopeChanged({ tiers, selected_tier })} />
          {estimate.pricing?.profitability ? (
            showInternal ? <ProfitPanel pricing={estimate.pricing} /> : null
          ) : null}
          {estimate.id ? <PhotosCard estimate={estimate} /> : null}
          {estimate.windows.length || estimate.doors.length ? (
            <div className="project-actions"><button type="button" className="button secondary" onClick={saveAsPackage} disabled={busy}>Save products as a reusable package</button></div>
          ) : null}

          {estimate.pricing?.review_required ? <div className="review-box"><strong>Review required before finalization</strong>{estimate.pricing.warnings.map((warning, index) => <p key={`${warning.code}-${index}`}>{warning.message}</p>)}</div> : null}
          {missingLocationLabels.length ? <div className="review-box"><strong>Locations required before finalization</strong><p>Add a location to every window and door. Missing: {missingLocationLabels.join(", ")}.</p></div> : null}
        </section>
        <section className="project-preview"><EstimateDocument estimate={estimate} editable={editable} onChange={updateMetadata} /></section>
      </div>
    </div>
  );
}
