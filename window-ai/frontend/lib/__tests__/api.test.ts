import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CustomerEstimate,
  fetchCustomerEstimateList,
  isLockedStatus,
  priceDeterministicQuote,
  sendCustomerEstimate,
} from "@/lib/api";
import { buildCustomerEstimateDraft, estimateToDraft } from "@/lib/quoteHandoff";

function savedEstimate(overrides: Partial<CustomerEstimate> = {}): CustomerEstimate {
  return {
    ...buildCustomerEstimateDraft({ commercial: { preset_id: "standard", negotiated_discount_percent: 0 } }),
    id: "e1",
    status: "priced",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

type FetchArgs = [input: string, init?: RequestInit];

function mockFetch(body: unknown = {}) {
  const fetchMock = vi.fn(async (..._args: FetchArgs) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("estimateToDraft", () => {
  it("keeps job items, tiers, province, and follow-up when a builder saves the project", () => {
    const estimate = savedEstimate({
      province: "QC",
      adders: [{ id: "a1", adder_id: "permit", qty: null }],
      tiers: [{ id: "best", name: "Best", window_overrides: { glazing: { triple: true } } }],
      selected_tier: "best",
      follow_up_on: "2026-02-01",
    });
    const draft = estimateToDraft(estimate, { windows: [] });
    expect(draft.province).toBe("QC");
    expect(draft.adders).toEqual(estimate.adders);
    expect(draft.tiers).toEqual(estimate.tiers);
    expect(draft.selected_tier).toBe("best");
    expect(draft.follow_up_on).toBe("2026-02-01");
    expect(draft.windows).toEqual([]);
    // Server-owned fields are never sent back in a draft.
    expect(draft).not.toHaveProperty("id");
    expect(draft).not.toHaveProperty("status");
    expect(draft).not.toHaveProperty("pricing");
  });

  it("gives new drafts safe defaults for every field", () => {
    const draft = buildCustomerEstimateDraft({ commercial: { preset_id: "standard", negotiated_discount_percent: 0 } });
    expect(draft).toMatchObject({ province: "ON", adders: [], tiers: [], selected_tier: null, follow_up_on: null });
  });
});

describe("statuses", () => {
  it("treats everything from finalized onward as a read-only customer document", () => {
    expect(isLockedStatus("draft")).toBe(false);
    expect(isLockedStatus("priced")).toBe(false);
    for (const status of ["finalized", "sent", "viewed", "accepted", "lost"] as const) {
      expect(isLockedStatus(status)).toBe(true);
    }
  });
});

describe("api requests", () => {
  it("live previews ask the server not to write an audit record", async () => {
    const fetchMock = mockFetch({});
    await priceDeterministicQuote({ lines: [] }, undefined, { record: false });
    await priceDeterministicQuote({ lines: [] });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/quotes/price?record=false");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/quotes/price");
  });

  it("sends the manager token only when one is given", async () => {
    const fetchMock = mockFetch({});
    await priceDeterministicQuote({ lines: [] }, "secret");
    const init = fetchMock.mock.calls[0][1];
    expect((init?.headers as Record<string, string>)["X-Pricing-Admin-Token"]).toBe("secret");
  });

  it("builds the customer link from the portal origin", async () => {
    const fetchMock = mockFetch({ delivered: false, link: "x", subject: "", body: "", estimate: {} });
    await sendCustomerEstimate("e1", { to: "a@example.com", portal_base_url: "https://app.example.com" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/customer-estimates/e1/send");
    expect(JSON.parse(String(init?.body))).toMatchObject({ to: "a@example.com", portal_base_url: "https://app.example.com" });
  });

  it("filters the estimate list by status, search, and trash", async () => {
    const fetchMock = mockFetch([]);
    await fetchCustomerEstimateList({ status: "sent,viewed", q: "Ada", deleted: true });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/customer-estimates?status=sent%2Cviewed&q=Ada&deleted=true");
  });

  it("surfaces the server message when a request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "Finalize the estimate first" }), { status: 409 })));
    await expect(sendCustomerEstimate("e1", { portal_base_url: "" })).rejects.toThrow("Finalize the estimate first");
  });
});
