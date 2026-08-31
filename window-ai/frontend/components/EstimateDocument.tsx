"use client";

import type { CSSProperties } from "react";
import type { CustomerEstimate, CustomerEstimatePricing } from "@/lib/api";
import AddressAutocomplete from "@/components/AddressAutocomplete";

const BRAND = {
  blue: "#248fd0",
  navy: "#08243a",
  muted: "#5f7384",
  line: "#d8e7f2",
  soft: "#f2f9fe",
};

function money(value: number | undefined | null, currency = "CAD") {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function dateLabel(value?: string | null) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
}

function Editable({
  value,
  editable,
  onChange,
  placeholder,
  className = "",
}: {
  value: string;
  editable: boolean;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  if (!editable) return <span className={className}>{value || "—"}</span>;
  return (
    <input
      className={`estimate-editable ${className}`}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function EditableArea({
  value,
  editable,
  onChange,
  placeholder,
  className = "",
}: {
  value: string;
  editable: boolean;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  if (!editable) return <p className={`whitespace-pre-line ${className}`}>{value || "—"}</p>;
  return (
    <textarea
      className={`estimate-editable estimate-textarea ${className}`}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      rows={3}
    />
  );
}

export default function EstimateDocument({
  estimate,
  editable,
  onChange,
}: {
  estimate: CustomerEstimate;
  editable: boolean;
  onChange: (patch: Partial<CustomerEstimate>) => void;
}) {
  const pricing = estimate.pricing as CustomerEstimatePricing | null | undefined;
  const sections = pricing?.sections;
  const totals = pricing?.totals;

  return (
    <article className="estimate-document" style={{ "--estimate-blue": BRAND.blue, "--estimate-navy": BRAND.navy, "--estimate-muted": BRAND.muted, "--estimate-line": BRAND.line, "--estimate-soft": BRAND.soft } as CSSProperties}>
      <header className="estimate-header">
        <div className="estimate-brand-block">
          <img src="/branding/better-view-solutions.png" alt="Better View Solutions" className="estimate-logo" />
          <div className="estimate-brand-copy">
            <p className="estimate-company-name">Better View Solutions Inc.</p>
          </div>
        </div>
        <div className="estimate-title-block">
          <p className="estimate-kicker">Customer document</p>
          <h1>Finalized Estimate</h1>
          <p className="estimate-number">{estimate.estimate_number || "Draft estimate"}</p>
        </div>
      </header>

      <div className="estimate-contact-bar">
        <span>647-326-0613</span>
        <span>info@betterview.ca</span>
        <span>1 Greensboro Dr, Suite 308 · Etobicoke, ON M9W 1C8</span>
      </div>

      <section className="estimate-meta-grid">
        <div className="estimate-panel">
          <p className="estimate-section-label">Prepared for</p>
          <div className="estimate-field-large">
            <Editable value={estimate.customer_name} editable={editable} onChange={(value) => onChange({ customer_name: value })} placeholder="Customer name" />
          </div>
          <Editable value={estimate.company_name} editable={editable} onChange={(value) => onChange({ company_name: value })} placeholder="Company name (optional)" />
          <Editable value={estimate.email} editable={editable} onChange={(value) => onChange({ email: value })} placeholder="Email address" />
          <Editable value={estimate.phone} editable={editable} onChange={(value) => onChange({ phone: value })} placeholder="Phone number" />
          {editable ? (
            <AddressAutocomplete
              className="estimate-editable estimate-textarea"
              multiline
              rows={3}
              value={estimate.project_address}
              onChange={(value) => onChange({ project_address: value })}
              placeholder="Project address"
            />
          ) : <p className="whitespace-pre-line">{estimate.project_address || "â€”"}</p>}
        </div>
        <div className="estimate-panel estimate-project-panel">
          <div className="estimate-detail-row"><span>Project</span><Editable value={estimate.project_name} editable={editable} onChange={(value) => onChange({ project_name: value })} placeholder="Project name" /></div>
          <div className="estimate-detail-row"><span>Estimate date</span><Editable value={estimate.estimate_date} editable={editable} onChange={(value) => onChange({ estimate_date: value })} /></div>
          <div className="estimate-detail-row"><span>Valid until</span><Editable value={estimate.valid_until} editable={editable} onChange={(value) => onChange({ valid_until: value })} /></div>
          <div className="estimate-detail-row"><span>Salesperson</span><Editable value={estimate.salesperson} editable={editable} onChange={(value) => onChange({ salesperson: value })} placeholder="Salesperson" /></div>
        </div>
      </section>

      <section className="estimate-copy-block">
        <p className="estimate-section-label">Project description</p>
        <EditableArea value={estimate.description} editable={editable} onChange={(value) => onChange({ description: value })} placeholder="Add a short description of the work included in this estimate." />
      </section>

      {sections?.windows?.lines?.length ? (
        <section className="estimate-product-section">
          <div className="estimate-section-heading"><div><p className="estimate-section-label">Scope of work</p><h2>Windows</h2></div><span>{money(sections.windows.subtotal)}</span></div>
          <table className="estimate-table"><thead><tr><th>#</th><th>Description</th><th>Location</th><th className="text-right">Qty</th><th className="text-right">Unit</th><th className="text-right">Amount</th></tr></thead><tbody>
            {sections.windows.lines.map((line, index) => <tr key={line.id}><td>{index + 1}</td><td>{line.description}</td><td>{line.location || "—"}</td><td className="text-right">{line.qty}</td><td className="text-right">{money(line.unit_price)}</td><td className="text-right font-semibold">{money(line.line_total)}</td></tr>)}
          </tbody></table>
        </section>
      ) : null}

      {sections?.doors?.openings?.length ? (
        <section className="estimate-product-section">
          <div className="estimate-section-heading"><div><p className="estimate-section-label">Scope of work</p><h2>Doors</h2></div><span>{money(sections.doors.subtotal)}</span></div>
          {sections.doors.openings.map((opening, openingIndex) => (
            <div className="estimate-door-opening" key={opening.id}>
              <div className="estimate-door-heading"><div><h3>{`Item ${openingIndex + 1} · ${opening.label}`}</h3><p>{opening.location || ""}{opening.location && opening.material ? " · " : ""}{opening.material} · {opening.finish_label}</p></div><strong>{money(opening.subtotal)}</strong></div>
              <table className="estimate-table estimate-table-compact"><tbody>{opening.items.map((item, index) => <tr key={`${opening.id}-${index}`}><td>{item.description}</td><td className="text-right">{item.qty}</td><td className="text-right">{money(item.unit_price)}</td><td className="text-right font-semibold">{money(item.line_total)}</td></tr>)}</tbody></table>
            </div>
          ))}
        </section>
      ) : null}

      {!sections ? <div className="estimate-empty-state">Price the project to populate the customer-facing estimate.</div> : null}

      <section className="estimate-totals-block">
        {(totals?.base_subtotal || 0) > (totals?.subtotal || 0) + 0.01 ? <div className="estimate-total-line"><span>Original subtotal</span><strong>{money(totals?.base_subtotal)}</strong></div> : null}
        {(totals?.discount || 0) > 0 ? <div className="estimate-total-line"><span>Offer discount</span><strong>−{money(totals?.discount)}</strong></div> : null}
        <div className="estimate-total-line"><span>Subtotal</span><strong>{money(totals?.subtotal)}</strong></div>
        <div className="estimate-total-line"><span>HST</span><strong>{money(totals?.hst)}</strong></div>
        <div className="estimate-total-line estimate-grand-total"><span>Total</span><strong>{money(totals?.total)}</strong></div>
      </section>

      <section className="estimate-copy-grid">
        <div><p className="estimate-section-label">Notes</p><EditableArea value={estimate.notes} editable={editable} onChange={(value) => onChange({ notes: value })} placeholder="Optional project notes" /></div>
        <div><p className="estimate-section-label">Terms</p><EditableArea value={estimate.terms} editable={editable} onChange={(value) => onChange({ terms: value })} placeholder="Estimate terms" /></div>
      </section>

      <footer className="estimate-footer">
        <span>Better View Solutions Inc.</span>
        <span>647-326-0613 · info@betterview.ca</span>
        <span>betterview.ca</span>
      </footer>
    </article>
  );
}
