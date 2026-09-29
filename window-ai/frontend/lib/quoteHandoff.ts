import type {
  CommercialSettings,
  CustomerDoorOpening,
  CustomerEstimate,
  CustomerEstimateDraft,
  CustomerWindowLine,
} from "@/lib/api";

function dateValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function newEstimateLineId(prefix = "line") {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function buildCustomerEstimateDraft({
  windows,
  doors,
  commercial,
}: {
  windows?: CustomerWindowLine[];
  doors?: CustomerDoorOpening[];
  commercial: CommercialSettings;
}): CustomerEstimateDraft {
  const estimateDate = new Date();
  const validUntil = new Date(estimateDate);
  validUntil.setDate(validUntil.getDate() + 30);

  return {
    customer_name: "",
    company_name: "",
    email: "",
    phone: "",
    project_name: "",
    project_address: "",
    salesperson: "",
    estimate_date: dateValue(estimateDate),
    valid_until: dateValue(validUntil),
    description: "",
    notes: "",
    terms: "This estimate is based on the information available at the time of quoting. Final measurements, site conditions, product availability, and installation details will be confirmed before ordering.",
    windows: windows || [],
    doors: doors || [],
    commercial,
    province: "ON",
    adders: [],
    tiers: [],
    selected_tier: null,
    follow_up_on: null,
  };
}

/** Every editable field of a saved estimate, for a full-record save (PUT). */
export function estimateToDraft(estimate: CustomerEstimate, patch: Partial<CustomerEstimateDraft> = {}): CustomerEstimateDraft {
  return {
    customer_name: estimate.customer_name,
    company_name: estimate.company_name,
    email: estimate.email,
    phone: estimate.phone,
    project_name: estimate.project_name,
    project_address: estimate.project_address,
    salesperson: estimate.salesperson,
    estimate_date: estimate.estimate_date,
    valid_until: estimate.valid_until,
    description: estimate.description,
    notes: estimate.notes,
    terms: estimate.terms,
    windows: estimate.windows,
    doors: estimate.doors,
    commercial: estimate.commercial,
    province: estimate.province || "ON",
    adders: estimate.adders || [],
    tiers: estimate.tiers || [],
    selected_tier: estimate.selected_tier ?? null,
    follow_up_on: estimate.follow_up_on ?? null,
    is_preliminary: estimate.is_preliminary ?? false,
    home_model_id: estimate.home_model_id ?? null,
    ...patch,
  };
}
