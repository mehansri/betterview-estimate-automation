"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  acceptPublicEstimate,
  fetchPublicEstimate,
  publicEstimatePdfUrl,
  type FinancingOptions,
  type PublicEstimate,
} from "@/lib/api";
import SignaturePad from "@/components/SignaturePad";
import WindowUnitDrawing from "@/components/WindowUnitDrawing";

type PublicTier = PublicEstimate["tiers"][number];

const moneyFormatter = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });

function money(value: number | null | undefined): string {
  return moneyFormatter.format(Number(value || 0));
}

function dateLabel(value?: string | null): string {
  if (!value) return "—";
  const date = value.length <= 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
}

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

function websiteHref(site: string): string {
  return /^https?:\/\//i.test(site) ? site : `https://${site}`;
}

function lowestMonthly(financing: FinancingOptions | undefined): number | null {
  const options = financing?.options ?? [];
  if (options.length === 0) return null;
  return Math.min(...options.map((option) => option.monthly_payment));
}

function isNotFound(message: string): boolean {
  return /not\s*found|404|unknown|invalid/i.test(message);
}

// ---------------------------------------------------------------- small building blocks

function Card({ children, className = "", id, labelledBy }: { children: ReactNode; className?: string; id?: string; labelledBy?: string }) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8 print:break-inside-avoid print:rounded-none print:border-0 print:p-0 print:shadow-none ${className}`}
    >
      {children}
    </section>
  );
}

function Kicker({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">{children}</p>;
}

function SectionHeading({ id, kicker, title, amount }: { id: string; kicker?: string; title: string; amount?: number }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4 border-b border-slate-200 pb-3">
      <div>
        {kicker ? <Kicker>{kicker}</Kicker> : null}
        <h2 id={id} className="mt-1 text-xl font-semibold text-slate-900">
          {title}
        </h2>
      </div>
      {amount !== undefined ? <p className="text-base font-semibold tabular-nums text-slate-900">{money(amount)}</p> : null}
    </div>
  );
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2";

/** A priced line list: a real table from `sm` up (and in print), stacked cards on phones. */
function LineTable({
  caption,
  rows,
  showLocation,
  showIndex,
}: {
  caption: string;
  showLocation?: boolean;
  showIndex?: boolean;
  rows: Array<{ key: string; title: string; subtitle?: string; visual?: ReactNode; location?: string; qty: number; unit: number; amount: number }>;
}) {
  return (
    <>
      <div className="hidden overflow-x-auto sm:block print:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              {showIndex ? <th scope="col" className="w-10 py-2 pr-3 font-semibold">#</th> : null}
              <th scope="col" className="py-2 pr-3 font-semibold">Description</th>
              {showLocation ? <th scope="col" className="py-2 pr-3 font-semibold">Location</th> : null}
              <th scope="col" className="py-2 pr-3 text-right font-semibold">Qty</th>
              <th scope="col" className="py-2 pr-3 text-right font-semibold">Unit</th>
              <th scope="col" className="py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, index) => (
              <tr key={row.key} className="align-top">
                {showIndex ? <td className="py-3 pr-3 tabular-nums text-slate-500">{index + 1}</td> : null}
                <td className="py-3 pr-3 text-slate-900">
                  {row.visual ? <span className="mb-2 block">{row.visual}</span> : null}
                  <span className="whitespace-pre-line">{row.title}</span>
                  {row.subtitle ? <span className="mt-0.5 block whitespace-pre-line text-xs text-slate-500">{row.subtitle}</span> : null}
                </td>
                {showLocation ? <td className="py-3 pr-3 text-slate-600">{row.location || "—"}</td> : null}
                <td className="py-3 pr-3 text-right tabular-nums text-slate-700">{row.qty}</td>
                <td className="whitespace-nowrap py-3 pr-3 text-right tabular-nums text-slate-700">{money(row.unit)}</td>
                <td className="whitespace-nowrap py-3 text-right font-semibold tabular-nums text-slate-900">{money(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-slate-100 sm:hidden print:hidden" aria-label={caption}>
        {rows.map((row, index) => (
          <li key={row.key} className="py-3">
            {row.visual ? <div className="mb-2">{row.visual}</div> : null}
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 break-words text-sm font-medium text-slate-900">
                {showIndex ? <span className="mr-1.5 text-slate-400">{index + 1}.</span> : null}
                <span className="whitespace-pre-line">{row.title}</span>
              </p>
              <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{money(row.amount)}</p>
            </div>
            {row.subtitle ? <p className="mt-0.5 whitespace-pre-line text-xs text-slate-500">{row.subtitle}</p> : null}
            <p className="mt-1 text-xs text-slate-500">
              {showLocation && row.location ? <span>{row.location} · </span> : null}
              <span className="tabular-nums">
                {row.qty} × {money(row.unit)}
              </span>
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}

function FinancingPanel({ financing, tierName }: { financing: NonNullable<FinancingOptions>; tierName?: string | null }) {
  if (!financing.options?.length) return null;
  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4 sm:p-5">
      <p className="text-sm font-semibold text-slate-900">
        Financing available{tierName ? <span className="font-normal text-slate-600"> for {tierName}</span> : null}
      </p>
      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {financing.options.map((option) => (
          <li key={option.months} className="flex items-baseline justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-brand-100">
            <span className="text-slate-600">{option.months} months</span>
            <span className="font-semibold tabular-nums text-slate-900">
              {money(option.monthly_payment)}
              <span className="font-normal text-slate-500">/mo</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-slate-600">APR {Number(financing.apr_percent || 0).toLocaleString("en-CA", { maximumFractionDigits: 2 })}%</p>
      {financing.disclaimer ? <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-slate-500">{financing.disclaimer}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------- page states

function PortalShell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-slate-50 print:bg-white">{children}</div>;
}

function LoadingState() {
  return (
    <PortalShell>
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6" role="status" aria-live="polite">
        <span className="sr-only">Loading your estimate…</span>
        <div className="animate-pulse space-y-6" aria-hidden="true">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="h-10 w-44 rounded bg-slate-200" />
            <div className="mt-6 h-4 w-2/3 rounded bg-slate-100" />
            <div className="mt-3 h-4 w-1/2 rounded bg-slate-100" />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="h-5 w-32 rounded bg-slate-200" />
            <div className="mt-5 space-y-3">
              <div className="h-4 rounded bg-slate-100" />
              <div className="h-4 rounded bg-slate-100" />
              <div className="h-4 w-5/6 rounded bg-slate-100" />
            </div>
          </div>
        </div>
        <p className="mt-6 text-center text-sm text-slate-500">Loading your estimate…</p>
      </div>
    </PortalShell>
  );
}

function ErrorState({ notFound, message, onRetry }: { notFound: boolean; message: string; onRetry: () => void }) {
  return (
    <PortalShell>
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
        <img src="/branding/better-view-solutions.png" alt="Better View Solutions" className="h-12 w-auto" />
        <div className="mt-8 w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-xl font-semibold text-slate-900">
            {notFound ? "We couldn't find this estimate" : "We couldn't load your estimate"}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            {notFound
              ? "The link may be incomplete or no longer active. Please check the link in your email, or contact your Better View Solutions representative for a new one."
              : "Something went wrong while loading this page. Please check your connection and try again."}
          </p>
          {!notFound && message ? <p className="mt-3 text-xs text-slate-400">{message}</p> : null}
          {!notFound ? (
            <button type="button" onClick={onRetry} className={`${buttonBase} mt-6 bg-brand-600 text-white hover:bg-brand-700`}>
              Try again
            </button>
          ) : null}
        </div>
      </main>
    </PortalShell>
  );
}

// ---------------------------------------------------------------- main component

export default function CustomerPortal({ token }: { token: string }) {
  const [estimate, setEstimate] = useState<PublicEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [chosenTierId, setChosenTierId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [justAccepted, setJustAccepted] = useState(false);

  const topRef = useRef<HTMLDivElement | null>(null);
  const uid = useId();
  const ids = {
    name: `${uid}-name`,
    signature: `${uid}-signature`,
    terms: `${uid}-terms`,
    hint: `${uid}-hint`,
    error: `${uid}-error`,
    options: `${uid}-options`,
  };

  const syncTierSelection = useCallback((data: PublicEstimate) => {
    const tiers = data.tiers ?? [];
    const preselected = tiers.find((tier) => tier.selected)?.id ?? (tiers.some((tier) => tier.id === data.selected_tier) ? data.selected_tier : null);
    setChosenTierId(preselected ?? null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetchPublicEstimate(token)
      .then((data) => {
        if (cancelled) return;
        setEstimate(data);
        syncTierSelection(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey, syncTierSelection]);

  const tiers: PublicTier[] = useMemo(() => estimate?.tiers ?? [], [estimate]);
  const chosenTier = useMemo(() => tiers.find((tier) => tier.id === chosenTierId) ?? null, [tiers, chosenTierId]);

  if (loading && !estimate) return <LoadingState />;
  if (!estimate) {
    const message = loadError ?? "";
    return <ErrorState notFound={isNotFound(message)} message={message} onRetry={() => setReloadKey((key) => key + 1)} />;
  }

  const company = estimate.company ?? { name: "", phone: "", email: "", address: "", website: "" };
  const companyName = company.name || "Better View Solutions Inc.";
  const sections = estimate.sections;
  const windowLines = sections?.windows?.lines ?? [];
  const doorOpenings = sections?.doors?.openings ?? [];
  const adderLines = sections?.adders?.lines ?? [];
  const totals = estimate.totals;
  const discount = Number(totals?.discount || 0);
  const taxLines =
    totals?.tax_lines && totals.tax_lines.length > 0
      ? totals.tax_lines.map((line) => ({ label: line.label, amount: line.amount }))
      : [{ label: "HST", amount: totals?.hst ?? 0 }];

  const hasTiers = tiers.length > 0;
  const financing = (chosenTier?.financing ?? estimate.financing) || null;
  const summaryTotal = chosenTier?.total ?? totals?.total ?? 0;
  const summaryDeposit = chosenTier ? chosenTier.deposit ?? estimate.deposit ?? 0 : estimate.deposit ?? 0;
  const isAccepted = estimate.status === "accepted";
  const isLost = estimate.status === "lost";
  const canAccept = estimate.can_accept && !isAccepted && !isLost;

  const trimmedName = name.trim();
  const missing: string[] = [];
  if (hasTiers && !chosenTier) missing.push("choose an option");
  if (trimmedName.length < 2) missing.push("enter your full name");
  if (!signature) missing.push("sign");
  if (!agreed) missing.push("tick the acceptance box");
  const ready = missing.length === 0;

  const handleAccept = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready || submitting || !signature) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const updated = await acceptPublicEstimate(token, {
        name: trimmedName,
        signature,
        tier_id: hasTiers ? chosenTier?.id ?? null : null,
        accepted_terms: true,
      });
      setEstimate(updated);
      syncTierSelection(updated);
      setJustAccepted(true);
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      topRef.current?.focus({ preventScroll: true });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "We couldn't record your acceptance. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const contactLinks = (
    <>
      {company.phone ? (
        <a href={telHref(company.phone)} className="font-semibold underline decoration-1 underline-offset-2 hover:no-underline">
          {company.phone}
        </a>
      ) : null}
      {company.phone && company.email ? " or " : null}
      {company.email ? (
        <a href={`mailto:${company.email}`} className="font-semibold underline decoration-1 underline-offset-2 hover:no-underline">
          {company.email}
        </a>
      ) : null}
    </>
  );

  const hasContact = Boolean(company.phone || company.email);

  return (
    <PortalShell>
      <main className={`mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 sm:py-10 print:max-w-none print:space-y-5 print:p-0 ${canAccept ? "pb-28 sm:pb-10" : ""}`}>
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-end gap-2 print:hidden">
          <a
            href={publicEstimatePdfUrl(token)}
            target="_blank"
            rel="noopener noreferrer"
            className={`${buttonBase} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
              <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
            </svg>
            Download PDF
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          <button
            type="button"
            onClick={() => window.print()}
            className={`${buttonBase} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path
                fillRule="evenodd"
                d="M5 2.75C5 1.784 5.784 1 6.75 1h6.5c.966 0 1.75.784 1.75 1.75v3.552c.377.046.752.097 1.126.153A2.212 2.212 0 0 1 18 8.653v4.097A2.25 2.25 0 0 1 15.75 15h-.241l.305 1.984A1.75 1.75 0 0 1 14.084 19H5.915a1.75 1.75 0 0 1-1.73-2.016L4.492 15H4.25A2.25 2.25 0 0 1 2 12.75V8.653c0-1.082.775-2.034 1.874-2.198.374-.056.75-.107 1.127-.153L5 6.25v-3.5Zm8.5 3.397a41.533 41.533 0 0 0-7 0V2.75a.25.25 0 0 1 .25-.25h6.5a.25.25 0 0 1 .25.25v3.397ZM6.608 12.5a.25.25 0 0 0-.247.212l-.693 4.5a.25.25 0 0 0 .247.288h8.17a.25.25 0 0 0 .246-.288l-.692-4.5a.25.25 0 0 0-.247-.212H6.608Z"
                clipRule="evenodd"
              />
            </svg>
            Print
          </button>
        </div>

        {/* Status banners */}
        <div ref={topRef} tabIndex={-1} className="space-y-3 focus:outline-none" aria-live="polite">
          {estimate.superseded_by ? (
            <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 print:hidden">
              <p className="font-semibold">A newer version of this estimate is available</p>
              <p className="mt-1">
                Your estimate has been updated since this version was sent.{" "}
                <a
                  href={`/estimate/${encodeURIComponent(estimate.superseded_by)}`}
                  className="font-semibold text-amber-900 underline decoration-1 underline-offset-2 hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
                >
                  View the latest estimate →
                </a>
              </p>
            </div>
          ) : null}

          {isAccepted ? (
            <div role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900 sm:p-5">
              <div className="flex items-start gap-3">
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
                    clipRule="evenodd"
                  />
                </svg>
                <div className="min-w-0">
                  <p className="font-semibold">{justAccepted ? "Thank you — your estimate has been accepted" : "This estimate has been accepted"}</p>
                  {estimate.accepted ? (
                    <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                      <div className="flex gap-1.5"><dt className="text-emerald-800">Accepted by:</dt><dd className="font-medium">{estimate.accepted.name}</dd></div>
                      <div className="flex gap-1.5"><dt className="text-emerald-800">Date:</dt><dd className="font-medium">{dateLabel(estimate.accepted.accepted_at)}</dd></div>
                      {estimate.accepted.tier_name ? (
                        <div className="flex gap-1.5"><dt className="text-emerald-800">Option:</dt><dd className="font-medium">{estimate.accepted.tier_name}</dd></div>
                      ) : null}
                      {estimate.accepted.total != null ? (
                        <div className="flex gap-1.5"><dt className="text-emerald-800">Total:</dt><dd className="font-medium tabular-nums">{money(estimate.accepted.total)}</dd></div>
                      ) : null}
                      {Number(estimate.accepted.deposit || 0) > 0 ? (
                        <div className="flex gap-1.5"><dt className="text-emerald-800">Deposit due:</dt><dd className="font-medium tabular-nums">{money(estimate.accepted.deposit)}</dd></div>
                      ) : null}
                    </dl>
                  ) : null}
                  <p className="mt-2 text-sm text-emerald-800">
                    {justAccepted ? "We've received your signature and will be in touch shortly to schedule the next steps." : "Our team will be in touch about next steps."}
                    {hasContact ? <> Questions? Reach us at {contactLinks}.</> : null}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {isLost ? (
            <div role="status" className="rounded-xl border border-slate-300 bg-slate-100 p-4 text-sm text-slate-800">
              <p className="font-semibold">This estimate is closed</p>
              <p className="mt-1">It can no longer be accepted online.{hasContact ? <> If you'd like to revisit your project, contact us at {contactLinks}.</> : null}</p>
            </div>
          ) : null}

          {estimate.expired && !isAccepted && !isLost ? (
            <div role="status" className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">
              <p className="font-semibold">This estimate expired on {dateLabel(estimate.valid_until)}</p>
              <p className="mt-1">
                Pricing may have changed.{" "}
                {hasContact ? <>Please contact us at {contactLinks} for an updated estimate.</> : "Please contact us for an updated estimate."}
              </p>
            </div>
          ) : null}
        </div>

        {/* Document header */}
        <Card>
          <header className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <img src="/branding/better-view-solutions.png" alt={companyName} className="h-12 w-auto sm:h-14" />
              <address className="mt-4 space-y-0.5 text-sm not-italic text-slate-600">
                <p className="font-semibold text-slate-900">{companyName}</p>
                {company.address ? <p className="whitespace-pre-line">{company.address}</p> : null}
                {company.phone ? (
                  <p>
                    <a href={telHref(company.phone)} className="rounded hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                      {company.phone}
                    </a>
                  </p>
                ) : null}
                {company.email ? (
                  <p>
                    <a href={`mailto:${company.email}`} className="break-all rounded hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                      {company.email}
                    </a>
                  </p>
                ) : null}
                {company.website ? (
                  <p>
                    <a href={websiteHref(company.website)} target="_blank" rel="noopener noreferrer" className="rounded hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                      {company.website.replace(/^https?:\/\//i, "")}
                    </a>
                  </p>
                ) : null}
              </address>
            </div>
            <div className="sm:text-right">
              <Kicker>{isAccepted ? "Accepted estimate" : "Estimate"}</Kicker>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                {estimate.estimate_number || "Estimate"}
              </h1>
              {estimate.revision_number > 1 ? (
                <p className="mt-1 inline-block rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">
                  Revision {estimate.revision_number}
                </p>
              ) : null}
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-1 sm:gap-y-1">
                <div className="sm:flex sm:justify-end sm:gap-2">
                  <dt className="text-slate-500">Estimate date</dt>
                  <dd className="font-medium text-slate-900">{dateLabel(estimate.estimate_date)}</dd>
                </div>
                <div className="sm:flex sm:justify-end sm:gap-2">
                  <dt className="text-slate-500">Valid until</dt>
                  <dd className={`font-medium ${estimate.expired && !isAccepted ? "text-rose-700" : "text-slate-900"}`}>
                    {dateLabel(estimate.valid_until)}
                    {estimate.expired && !isAccepted ? " (expired)" : ""}
                  </dd>
                </div>
              </dl>
            </div>
          </header>

          {/* Prepared for / project */}
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200 print:bg-white">
              <Kicker>Prepared for</Kicker>
              <p className="mt-2 text-base font-semibold text-slate-900">{estimate.customer_name || "—"}</p>
              {estimate.company_name ? <p className="text-sm text-slate-700">{estimate.company_name}</p> : null}
              {estimate.project_address ? <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{estimate.project_address}</p> : null}
            </div>
            <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200 print:bg-white">
              <Kicker>Project</Kicker>
              <p className="mt-2 text-base font-semibold text-slate-900">{estimate.project_name || "—"}</p>
              {estimate.salesperson ? (
                <p className="text-sm text-slate-600">
                  Your representative: <span className="font-medium text-slate-800">{estimate.salesperson}</span>
                </p>
              ) : null}
            </div>
          </div>

          {estimate.description ? (
            <div className="mt-6">
              <Kicker>Project description</Kicker>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">{estimate.description}</p>
            </div>
          ) : null}
        </Card>

        {/* Scope: windows */}
        {windowLines.length > 0 ? (
          <Card labelledBy={`${uid}-windows`}>
            <SectionHeading id={`${uid}-windows`} kicker="Scope of work" title="Windows" amount={sections.windows.subtotal} />
            <LineTable
              caption="Windows"
              showIndex
              showLocation
              rows={windowLines.map((line, index) => ({
                key: line.id,
                title: line.description,
                subtitle: line.energy || undefined,
                visual: line.drawing ? <WindowUnitDrawing geometry={line.drawing} size={96} showDimensions={false} showIndexes={false} title={`Window ${index + 1}, viewed from outside`} /> : undefined,
                location: line.location,
                qty: line.qty,
                unit: line.unit_price,
                amount: line.line_total,
              }))}
            />
          </Card>
        ) : null}

        {/* Scope: doors */}
        {doorOpenings.length > 0 ? (
          <Card labelledBy={`${uid}-doors`}>
            <SectionHeading id={`${uid}-doors`} kicker="Scope of work" title="Doors" amount={sections.doors.subtotal} />
            <div className="space-y-6">
              {doorOpenings.map((opening, openingIndex) => {
                const details = [opening.location, opening.material, opening.finish_label].filter(Boolean).join(" · ");
                return (
                  <div key={opening.id} className="print:break-inside-avoid">
                    <div className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200 print:bg-white">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-slate-900">
                          Item {openingIndex + 1} · {opening.label}
                        </h3>
                        {details ? <p className="mt-0.5 text-xs text-slate-600">{details}</p> : null}
                      </div>
                      <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{money(opening.subtotal)}</p>
                    </div>
                    <div className="mt-1 px-1">
                      <LineTable
                        caption={`Door item ${openingIndex + 1}: ${opening.label}`}
                        rows={(opening.items ?? []).map((item, index) => ({
                          key: `${opening.id}-${index}`,
                          title: item.description,
                          qty: item.qty,
                          unit: item.unit_price,
                          amount: item.line_total,
                        }))}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ) : null}

        {/* Scope: additional work */}
        {adderLines.length > 0 ? (
          <Card labelledBy={`${uid}-adders`}>
            <SectionHeading id={`${uid}-adders`} kicker="Scope of work" title="Additional work" amount={sections.adders?.subtotal} />
            <LineTable
              caption="Additional work"
              rows={adderLines.map((line) => ({
                key: line.id,
                title: line.name,
                subtitle: line.note || undefined,
                qty: line.qty,
                unit: line.unit_price,
                amount: line.line_total,
              }))}
            />
          </Card>
        ) : null}

        {/* Totals */}
        <Card labelledBy={`${uid}-totals`}>
          <h2 id={`${uid}-totals`} className="sr-only">
            Estimate totals
          </h2>
          <dl className="ml-auto max-w-sm space-y-2 text-sm">
            {discount > 0 ? (
              <>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-600">Original subtotal</dt>
                  <dd className="tabular-nums text-slate-900">{money(totals.base_subtotal)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-emerald-700">Offer discount</dt>
                  <dd className="tabular-nums font-medium text-emerald-700">−{money(discount)}</dd>
                </div>
              </>
            ) : null}
            <div className="flex justify-between gap-4">
              <dt className="text-slate-600">Subtotal</dt>
              <dd className="tabular-nums text-slate-900">{money(totals?.subtotal)}</dd>
            </div>
            {taxLines.map((line, index) => (
              <div key={`${line.label}-${index}`} className="flex justify-between gap-4">
                <dt className="text-slate-600">{line.label}</dt>
                <dd className="tabular-nums text-slate-900">{money(line.amount)}</dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-4 border-t border-slate-200 pt-3">
              <dt className="text-base font-bold text-slate-900">Total</dt>
              <dd className="text-xl font-bold tabular-nums text-slate-900">{money(totals?.total)}</dd>
            </div>
            {!hasTiers && Number(estimate.deposit || 0) > 0 ? (
              <div className="flex justify-between gap-4 pt-1">
                <dt className="text-slate-600">Deposit due on acceptance</dt>
                <dd className="tabular-nums font-medium text-slate-900">{money(estimate.deposit)}</dd>
              </div>
            ) : null}
          </dl>
          {hasTiers ? (
            <p className="mt-4 text-right text-xs text-slate-500">Totals shown for the scope above. See the options below for package pricing.</p>
          ) : null}
        </Card>

        {/* Options (Good / Better / Best) */}
        {hasTiers ? (
          <Card labelledBy={ids.options}>
            <fieldset>
              <legend className="sr-only">Choose an option</legend>
              <SectionHeading id={ids.options} kicker={canAccept ? "Choose your option" : "Options"} title="Your options" />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {tiers.map((tier) => {
                  const checked = tier.id === chosenTierId;
                  const monthly = lowestMonthly(tier.financing);
                  return (
                    <label
                      key={tier.id}
                      className={`relative flex cursor-pointer flex-col rounded-xl border-2 bg-white p-4 transition focus-within:ring-2 focus-within:ring-brand-500 focus-within:ring-offset-2 ${
                        checked ? "border-brand-600 bg-brand-50/50 shadow-sm" : "border-slate-200 hover:border-slate-300"
                      } ${!canAccept ? "cursor-default" : ""} ${chosenTierId && !checked ? "print:hidden" : ""}`}
                    >
                      <input
                        type="radio"
                        name={`${uid}-tier`}
                        value={tier.id}
                        checked={checked}
                        disabled={!canAccept}
                        onChange={() => {
                          setChosenTierId(tier.id);
                          setSubmitError(null);
                        }}
                        className="sr-only"
                      />
                      <span className="flex items-start justify-between gap-2">
                        <span className="text-base font-semibold text-slate-900">{tier.name}</span>
                        <span
                          aria-hidden="true"
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                            checked ? "border-brand-600 bg-brand-600" : "border-slate-300 bg-white"
                          }`}
                        >
                          {checked ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
                        </span>
                      </span>
                      {tier.description ? <span className="mt-1 whitespace-pre-line text-sm text-slate-600">{tier.description}</span> : null}
                      <span className="mt-auto pt-4">
                        <span className="block text-2xl font-bold tabular-nums text-slate-900">{tier.total != null ? money(tier.total) : "—"}</span>
                        <span className="block text-xs text-slate-500">incl. tax</span>
                        {monthly != null ? (
                          <span className="mt-1 block text-sm font-medium text-brand-700">or from {money(monthly)}/mo</span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
              {canAccept && !chosenTier ? <p className="mt-3 text-sm text-slate-600">Select the option you'd like to go ahead with.</p> : null}
            </fieldset>
          </Card>
        ) : null}

        {/* Financing & deposit */}
        {financing?.options?.length || (hasTiers && Number(summaryDeposit) > 0) ? (
          <Card labelledBy={`${uid}-financing`}>
            <SectionHeading id={`${uid}-financing`} kicker="Payment" title="Payment options" />
            <div className="space-y-4">
              {hasTiers && Number(summaryDeposit) > 0 ? (
                <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="text-slate-600">
                    Deposit due on acceptance{chosenTier ? <span className="text-slate-500"> ({chosenTier.name})</span> : null}
                  </span>
                  <span className="font-semibold tabular-nums text-slate-900">{money(summaryDeposit)}</span>
                </p>
              ) : null}
              {financing?.options?.length ? <FinancingPanel financing={financing} tierName={chosenTier?.financing ? chosenTier.name : null} /> : null}
            </div>
          </Card>
        ) : null}

        {/* Notes & terms */}
        {estimate.notes || estimate.terms ? (
          <Card>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {estimate.notes ? (
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-brand-700">Notes</h2>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">{estimate.notes}</p>
                </div>
              ) : null}
              {estimate.terms ? (
                <div className={estimate.notes ? "" : "md:col-span-2"}>
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-brand-700">Terms</h2>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">{estimate.terms}</p>
                </div>
              ) : null}
            </div>
          </Card>
        ) : null}

        {/* Acceptance */}
        {canAccept ? (
          <Card id="accept" labelledBy={`${uid}-accept`} className="scroll-mt-6 border-brand-100 ring-1 ring-brand-100 print:hidden">
            <SectionHeading id={`${uid}-accept`} kicker="Ready to go ahead?" title="Accept this estimate" />
            <div className="mb-6 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <dl className="space-y-1.5 text-sm">
                {hasTiers ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-600">Option</dt>
                    <dd className="font-medium text-slate-900">{chosenTier ? chosenTier.name : <span className="text-slate-500">Not selected yet</span>}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-600">Total (incl. tax)</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">{hasTiers && !chosenTier ? "—" : money(summaryTotal)}</dd>
                </div>
                {Number(summaryDeposit) > 0 && (!hasTiers || chosenTier) ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-600">Deposit due on acceptance</dt>
                    <dd className="font-semibold tabular-nums text-slate-900">{money(summaryDeposit)}</dd>
                  </div>
                ) : null}
              </dl>
            </div>

            <form onSubmit={handleAccept} noValidate className="space-y-5">
              <div>
                <label htmlFor={ids.name} className="block text-sm font-medium text-slate-800">
                  Full name
                </label>
                <input
                  id={ids.name}
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={submitting}
                  required
                  minLength={2}
                  className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-slate-100"
                  placeholder="Your full name"
                />
              </div>

              <div>
                <p id={`${ids.signature}-label`} className="block text-sm font-medium text-slate-800">
                  Signature
                </p>
                <div className="mt-1.5" aria-labelledby={`${ids.signature}-label`} role="group">
                  <SignaturePad id={ids.signature} onChange={setSignature} disabled={submitting} />
                </div>
              </div>

              <div className="flex items-start gap-3">
                <input
                  id={ids.terms}
                  type="checkbox"
                  checked={agreed}
                  onChange={(event) => setAgreed(event.target.checked)}
                  disabled={submitting}
                  required
                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
                />
                <label htmlFor={ids.terms} className="text-sm leading-relaxed text-slate-700">
                  I accept this estimate and its terms
                  {hasTiers && chosenTier ? <span className="text-slate-500"> ({chosenTier.name}, {money(summaryTotal)})</span> : null}
                </label>
              </div>

              {submitError ? (
                <div id={ids.error} role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
                  {submitError}
                </div>
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p id={ids.hint} className="text-xs text-slate-500" aria-live="polite">
                  {ready ? "Your signature and name will be recorded with today's date." : `To accept, please ${missing.join(", ")}.`}
                </p>
                <button
                  type="submit"
                  disabled={!ready || submitting}
                  aria-describedby={`${ids.hint}${submitError ? ` ${ids.error}` : ""}`}
                  className={`${buttonBase} w-full bg-brand-600 px-6 py-3 text-base text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 sm:w-auto`}
                >
                  {submitting ? (
                    <>
                      <svg aria-hidden="true" className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                        <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                      Submitting…
                    </>
                  ) : (
                    "Accept estimate"
                  )}
                </button>
              </div>
            </form>
          </Card>
        ) : null}

        <footer className="pb-4 pt-2 text-center text-xs text-slate-500">
          <p className="font-medium text-slate-600">{companyName}</p>
          <p className="mt-1">
            {[company.phone, company.email, company.website].filter(Boolean).join(" · ")}
          </p>
        </footer>
      </main>

      {/* Sticky mobile call-to-action */}
      {canAccept ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(15,23,42,0.06)] backdrop-blur sm:hidden print:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs text-slate-500">{hasTiers ? (chosenTier ? chosenTier.name : "Choose an option") : "Total (incl. tax)"}</p>
              <p className="text-lg font-bold tabular-nums text-slate-900">{hasTiers && !chosenTier ? "—" : money(summaryTotal)}</p>
            </div>
            <a href="#accept" className={`${buttonBase} shrink-0 bg-brand-600 text-white hover:bg-brand-700`}>
              Review &amp; accept
            </a>
          </div>
        </div>
      ) : null}
    </PortalShell>
  );
}
