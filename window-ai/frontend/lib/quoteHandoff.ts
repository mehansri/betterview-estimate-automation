import type {
  CommercialSettings,
  CustomerDoorOpening,
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
  };
}
