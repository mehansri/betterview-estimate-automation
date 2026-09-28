"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useViewMode } from "@/lib/viewMode";
import {
  CustomerEstimate,
  CustomerEstimateSummary,
  EstimateEvent,
  FollowUpDraft,
  SendEstimateResult,
  customerPortalUrl,
  draftFollowUpEmail,
  estimatePdfUrl,
  fetchEstimateEvents,
  fetchEstimateRevisions,
  isLockedStatus,
  markEstimateLost,
  reopenEstimate,
  sendCustomerEstimate,
  setEstimateFollowUp,
} from "@/lib/api";

const STATUS_COPY: Record<string, string> = {
  draft: "Draft — not priced yet",
  priced: "Priced — finalize to send it to the customer",
  finalized: "Finalized — ready to send",
  sent: "Sent — waiting for the customer to open it",
  viewed: "Viewed by the customer",
  accepted: "Accepted by the customer",
  lost: "Marked lost",
};

const EVENT_LABELS: Record<string, string> = {
  created: "Estimate created",
  finalized: "Finalized",
  sent: "Sent to customer",
  viewed: "Customer opened the estimate",
  accepted: "Customer accepted",
  lost: "Marked lost",
  reopened: "Reopened",
  revised: "Revision created",
  override: "Manager floor override",
  follow_up: "Follow-up updated",
  deleted: "Moved to trash",
  restored: "Restored from trash",
};

function money(value: unknown) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(Number(value) || 0);
}

function when(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
}

function eventDetail(event: EstimateEvent, internal = true): string {
  const detail = event.detail || {};
  switch (event.kind) {
    case "sent":
      return detail.delivered ? `Emailed to ${detail.to}` : detail.to ? `Link prepared for ${detail.to}` : "Link prepared";
    case "accepted":
      return [detail.name, detail.tier, detail.total != null ? money(detail.total) : ""].filter(Boolean).join(" · ");
    case "lost":
      return String(detail.reason || "");
    case "override":
      return [detail.reason, detail.total != null ? money(detail.total) : "", internal && detail.margin_percent != null ? `${detail.margin_percent}% margin` : ""]
        .filter(Boolean).join(" · ");
    case "follow_up":
      return detail.follow_up_on ? `Due ${detail.follow_up_on}${detail.note ? ` — ${detail.note}` : ""}` : "Cleared";
    case "finalized":
      return detail.total != null ? money(detail.total) : "";
    case "created":
      return detail.revision_number ? `Revision ${detail.revision_number}` : detail.duplicated_from ? "Duplicated" : "";
    default:
      return "";
  }
}

export default function EstimateLifecycle({
  estimate,
  onChanged,
  onRevise,
  onDuplicate,
  busy,
}: {
  estimate: CustomerEstimate;
  onChanged: (estimate: CustomerEstimate) => void;
  onRevise: () => void;
  onDuplicate: () => void;
  busy: boolean;
}) {
  const { internal } = useViewMode();
  const [events, setEvents] = useState<EstimateEvent[]>([]);
  const [revisions, setRevisions] = useState<CustomerEstimateSummary[]>([]);
  const [sendOpen, setSendOpen] = useState(false);
  const [to, setTo] = useState(estimate.email || "");
  const [cc, setCc] = useState("");
  const [message, setMessage] = useState("");
  const [sendResult, setSendResult] = useState<SendEstimateResult | null>(null);
  const [lostReason, setLostReason] = useState("");
  const [lostOpen, setLostOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [followUp, setFollowUp] = useState<FollowUpDraft | null>(null);
  const locked = isLockedStatus(estimate.status);
  const link = estimate.public_token ? customerPortalUrl(estimate.public_token) : null;
  const open = ["finalized", "sent", "viewed"].includes(estimate.status);

  useEffect(() => {
    if (!estimate.id) return;
    fetchEstimateEvents(estimate.id).then(setEvents).catch(() => setEvents([]));
    fetchEstimateRevisions(estimate.id).then(setRevisions).catch(() => setRevisions([]));
  }, [estimate.id, estimate.status, estimate.updated_at]);

  useEffect(() => setTo(estimate.email || ""), [estimate.email]);

  async function run<T>(action: () => Promise<T>, after: (value: T) => void) {
    setWorking(true);
    setError(null);
    try {
      after(await action());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong.");
    } finally {
      setWorking(false);
    }
  }

  function send() {
    run(() => sendCustomerEstimate(estimate.id, { to, cc, message }), (result) => {
      setSendResult(result);
      onChanged(result.estimate);
    });
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy the customer link", link);
    }
  }

  const mailto = sendResult && !sendResult.delivered
    ? `mailto:${encodeURIComponent(to)}?${new URLSearchParams({ ...(cc ? { cc } : {}), subject: sendResult.subject, body: sendResult.body }).toString().replace(/\+/g, "%20")}`
    : null;

  return (
    <div className="editor-card">
      <div className="card-heading">
        <div><p className="eyebrow">Sales progress</p><h3>{STATUS_COPY[estimate.status] || estimate.status}</h3></div>
        <span className={`status-pill status-${estimate.status}`}>{estimate.status}</span>
      </div>

      {estimate.status === "accepted" && estimate.acceptance ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <strong>Accepted by {estimate.acceptance.name}</strong> on {when(estimate.acceptance.accepted_at)}
          {estimate.acceptance.tier_name ? <> · option <strong>{estimate.acceptance.tier_name}</strong></> : null}
          {estimate.acceptance.total != null ? <> · {money(estimate.acceptance.total)}</> : null}
          {estimate.acceptance.deposit ? <> · deposit due {money(estimate.acceptance.deposit)}</> : null}
        </div>
      ) : null}
      {estimate.status === "lost" ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">Lost: {estimate.lost_reason || "no reason recorded"}</div>
      ) : null}

      {locked ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {open ? <button type="button" className="button primary" onClick={() => { setSendOpen((value) => !value); setSendResult(null); }} disabled={working || busy}>{estimate.sent_at ? "Resend to customer" : "Send to customer"}</button> : null}
          {link ? <button type="button" className="button secondary" onClick={copyLink}>{copied ? "Link copied" : "Copy customer link"}</button> : null}
          {link ? <a className="button secondary" href={link} target="_blank" rel="noreferrer">Preview customer page</a> : null}
          <a className="button secondary" href={estimatePdfUrl(estimate.id)} target="_blank" rel="noreferrer">Download PDF</a>
          {open ? <button type="button" className="button secondary" onClick={() => setLostOpen((value) => !value)} disabled={working}>Mark lost</button> : null}
          {estimate.status === "lost" ? <button type="button" className="button secondary" onClick={() => run(() => reopenEstimate(estimate.id), onChanged)} disabled={working}>Reopen</button> : null}
          {estimate.status !== "accepted" ? <button type="button" className="button secondary" onClick={onRevise} disabled={working || busy}>Create revision</button> : null}
          <button type="button" className="button secondary" onClick={onDuplicate} disabled={working || busy}>Duplicate as new estimate</button>
        </div>
      ) : (
        <p className="project-help">Finalize the priced estimate to send it: the customer gets a link to review options, sign, and accept online, plus a PDF.</p>
      )}

      {sendOpen ? (
        <div className="mt-3 rounded-lg border border-slate-200 p-3">
          <div className="editor-grid">
            <label className="project-field"><span>Customer email</span><input className="project-input" type="email" value={to} onChange={(event) => setTo(event.target.value)} placeholder="customer@example.com" /></label>
            <label className="project-field"><span>CC (optional)</span><input className="project-input" type="email" value={cc} onChange={(event) => setCc(event.target.value)} /></label>
            <label className="project-field field-span-2"><span>Personal message (optional)</span><textarea className="project-input" rows={3} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Thanks for having us out today…" /></label>
          </div>
          <div className="project-actions mt-2"><button type="button" className="button primary" onClick={send} disabled={working || !to.trim()}>{working ? "Sending…" : "Send estimate"}</button></div>
          {sendResult ? (
            sendResult.delivered ? (
              <p className="mt-2 text-sm text-emerald-700">Emailed to {to} with the PDF attached. A follow-up reminder has been scheduled.</p>
            ) : (
              <div className="mt-2 text-sm text-slate-700">
                <p>Email sending is not set up on the server, so nothing was emailed. The estimate is marked sent — share the link yourself:</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className="button secondary" onClick={copyLink}>{copied ? "Link copied" : "Copy link"}</button>
                  {mailto ? <a className="button secondary" href={mailto}>Open in my email app</a> : null}
                </div>
              </div>
            )
          ) : null}
        </div>
      ) : null}

      {lostOpen ? (
        <div className="mt-3 rounded-lg border border-slate-200 p-3">
          <label className="project-field"><span>Why was it lost?</span>
            <select className="project-input" value={lostReason} onChange={(event) => setLostReason(event.target.value)}>
              <option value="">Choose a reason…</option>
              {["Price", "Went with a competitor", "Project postponed", "Financing", "No response", "Scope changed", "Other"].map((reason) => <option key={reason}>{reason}</option>)}
            </select>
          </label>
          <div className="project-actions mt-2"><button type="button" className="button primary" disabled={!lostReason || working} onClick={() => run(() => markEstimateLost(estimate.id, lostReason), (value) => { onChanged(value); setLostOpen(false); })}>Mark lost</button></div>
        </div>
      ) : null}

      {open || estimate.follow_up_on ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="project-field"><span>Follow up on</span>
            <input className="project-input" type="date" value={estimate.follow_up_on || ""} onChange={(event) => run(() => setEstimateFollowUp(estimate.id, event.target.value || null), onChanged)} disabled={working} />
          </label>
          {estimate.follow_up_on ? <button type="button" className="button secondary" onClick={() => run(() => setEstimateFollowUp(estimate.id, null, "Done"), onChanged)} disabled={working}>Mark follow-up done</button> : null}
        </div>
      ) : null}

      {open ? (
        <div className="mt-3">
          <button type="button" className="button secondary" onClick={() => run(() => draftFollowUpEmail(estimate.id), setFollowUp)} disabled={working}>
            {working && !followUp ? "Drafting…" : followUp ? "Redraft follow-up email" : "Draft a follow-up email"}
          </button>
          {followUp ? (
            <div className="mt-2 rounded-lg border border-slate-200 p-3">
              <p className="text-xs text-slate-500">{followUp.source === "claude" ? "Drafted with AI from this estimate. Review before sending." : "Template draft. Edit before sending."}</p>
              <label className="project-field mt-2"><span>Subject</span><input className="project-input" value={followUp.subject} onChange={(event) => setFollowUp({ ...followUp, subject: event.target.value })} /></label>
              <label className="project-field mt-2"><span>Message</span><textarea className="project-input" rows={9} value={followUp.body} onChange={(event) => setFollowUp({ ...followUp, body: event.target.value })} /></label>
              <div className="mt-2 flex flex-wrap gap-2">
                <a className="button primary" href={`mailto:${encodeURIComponent(followUp.to)}?subject=${encodeURIComponent(followUp.subject)}&body=${encodeURIComponent(followUp.body)}`}>Open in my email app</a>
                <button type="button" className="button secondary" onClick={() => navigator.clipboard?.writeText(`${followUp.subject}\n\n${followUp.body}`)}>Copy text</button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="project-error mt-2">{error}</p> : null}

      {revisions.length > 1 ? (
        <div className="mt-4">
          <p className="eyebrow">Revisions</p>
          <ul className="mt-1 space-y-1 text-sm">
            {revisions.map((revision) => (
              <li key={revision.id} className="flex flex-wrap justify-between gap-2">
                {revision.id === estimate.id
                  ? <strong>Rev {revision.revision_number} (this one)</strong>
                  : <Link className="font-semibold text-brand-700 hover:underline" href={`/projects/${revision.id}`}>Rev {revision.revision_number}</Link>}
                <span className="text-slate-500">{revision.estimate_number || "draft"} · {revision.status}{revision.total != null ? ` · ${money(revision.total)}` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {events.length ? (
        <div className="mt-4">
          <p className="eyebrow">Activity</p>
          <ol className="mt-1 space-y-1 text-sm">
            {events.slice(0, 12).map((event) => (
              <li key={event.id} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 pb-1">
                <span><strong className="font-medium">{EVENT_LABELS[event.kind] || event.kind}</strong>{eventDetail(event, internal) ? <span className="text-slate-600"> — {eventDetail(event, internal)}</span> : null}</span>
                <span className="text-xs text-slate-500">{when(event.created_at)}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
