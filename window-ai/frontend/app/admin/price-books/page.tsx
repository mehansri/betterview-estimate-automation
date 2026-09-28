"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  PriceBookListing,
  PriceBookVersion,
  currentPriceBookUrl,
  fetchPriceBooks,
  importPriceBook,
  publishPriceBook,
  revertPriceBook,
} from "@/lib/api";

const INPUT =
  "input block w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm " +
  "focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50 disabled:text-slate-500";

const PRIMARY_BUTTON =
  "rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60";

const SECONDARY_BUTTON =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

const PUBLISH_WARNING =
  "Publishing changes prices on every new quote, and estimates already priced with the old book will need repricing before they can be finalized.";

// Price-book values are raw numbers from the supplier file (mostly dollar amounts,
// but not always), so they are shown as plain numbers rather than currency.
const numberFormat = new Intl.NumberFormat("en-CA", { maximumFractionDigits: 2 });

type Status = { kind: "ok" | "error"; text: string } | null;

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
}

function formatChange(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function changeTone(value: number | null | undefined) {
  if (!value) return "text-slate-600";
  return value > 0 ? "text-rose-700" : "text-emerald-700";
}

function datasetLabel(dataset: string) {
  const [group, name] = dataset.split("/");
  const groupLabel = group === "windowcity" ? "Windows (Window City)" : group === "doors" ? "Doors" : group;
  return name ? `${groupLabel} · ${name.replace(/_/g, " ")}` : dataset;
}

function StatusMessage({ status }: { status: Status }) {
  return (
    <div aria-live="polite" role="status">
      {status ? (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            status.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
          }`}
        >
          {status.text}
        </p>
      ) : null}
    </div>
  );
}

function Card({ title, description, children, id }: { title: string; description?: ReactNode; children: ReactNode; id: string }) {
  return (
    <section aria-labelledby={`${id}-title`} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h3 id={`${id}-title`} className="text-base font-semibold text-slate-900">{title}</h3>
      {description ? <div className="mt-1 text-sm leading-6 text-slate-500">{description}</div> : null}
      <div className="mt-4 min-w-0">{children}</div>
    </section>
  );
}

function Stat({ label, value, tone = "text-slate-900" }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

/** The comparison of an imported version against the data currently in effect. */
function DiffSummary({ summary }: { summary: PriceBookVersion["summary"] }) {
  if (!summary) {
    return <p className="text-sm text-slate-500">No comparison is available for this version.</p>;
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Values compared" value={numberFormat.format(summary.values_compared)} />
        <Stat label="Changed" value={numberFormat.format(summary.changed)} tone={summary.changed ? "text-amber-700" : "text-slate-900"} />
        <Stat label="Added" value={numberFormat.format(summary.added)} />
        <Stat label="Removed" value={numberFormat.format(summary.removed)} tone={summary.removed ? "text-rose-700" : "text-slate-900"} />
        <Stat label="Average change" value={formatChange(summary.average_change_percent)} tone={changeTone(summary.average_change_percent)} />
      </div>

      {summary.largest_changes.length ? (
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">
            Largest changes{" "}
            <span className="font-normal text-slate-500">
              (<span className="text-rose-700">▲ increases</span> · <span className="text-emerald-700">▼ decreases</span>)
            </span>
          </p>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-3 py-2">Path</th>
                  <th scope="col" className="px-3 py-2 text-right">Old</th>
                  <th scope="col" className="px-3 py-2 text-right">New</th>
                  <th scope="col" className="px-3 py-2 text-right">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.largest_changes.map((change, index) => {
                  const up = change.new > change.old;
                  const tone = change.new === change.old ? "text-slate-600" : up ? "text-rose-700" : "text-emerald-700";
                  return (
                    <tr key={`${change.path}-${index}`}>
                      <td className="max-w-[28rem] break-all px-3 py-2 font-mono text-xs text-slate-700">{change.path}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-slate-600">{numberFormat.format(change.old)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-medium text-slate-900">{numberFormat.format(change.new)}</td>
                      <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold ${tone}`}>
                        {change.new === change.old ? "" : up ? "▲ " : "▼ "}
                        {change.percent === null ? "n/a" : formatChange(change.percent)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500">No values changed compared with the data currently in effect.</p>
      )}
    </div>
  );
}

function ActiveBadge() {
  return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">Active</span>;
}

function ChangeSummaryText({ summary }: { summary: PriceBookVersion["summary"] }) {
  if (!summary) return <span className="text-slate-400">—</span>;
  return (
    <span className="whitespace-nowrap">
      {summary.changed} changed
      {summary.added ? ` · +${summary.added}` : ""}
      {summary.removed ? ` · −${summary.removed}` : ""}
      <span className={`ml-1 font-semibold ${changeTone(summary.average_change_percent)}`}>
        ({formatChange(summary.average_change_percent)} avg)
      </span>
    </span>
  );
}

export default function PriceBooksPage() {
  const [listing, setListing] = useState<PriceBookListing | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [token, setToken] = useState("");

  const [dataset, setDataset] = useState("");
  const [label, setLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [imported, setImported] = useState<PriceBookVersion | null>(null);
  const [importStatus, setImportStatus] = useState<Status>(null);
  const [datasetStatus, setDatasetStatus] = useState<Status>(null);
  const [versionsStatus, setVersionsStatus] = useState<Status>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const next = await fetchPriceBooks();
      setListing(next);
      setDataset((current) => current || next.datasets[0]?.dataset || "");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load price books.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const versions = useMemo(
    () =>
      [...(listing?.versions ?? [])].sort(
        (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
      ),
    [listing]
  );

  function requireToken(setStatus: (status: Status) => void) {
    if (!token.trim()) {
      setStatus({ kind: "error", text: "Enter the manager token first." });
      return null;
    }
    return token.trim();
  }

  async function onImport(event: FormEvent) {
    event.preventDefault();
    setImportStatus(null);
    if (!dataset) return setImportStatus({ kind: "error", text: "Choose which dataset this file replaces." });
    if (!file) return setImportStatus({ kind: "error", text: "Choose a JSON file to import." });
    const adminToken = requireToken(setImportStatus);
    if (!adminToken) return;
    setBusy("import");
    try {
      const version = await importPriceBook(dataset, label.trim(), file, adminToken);
      setImported(version);
      setImportStatus({ kind: "ok", text: `Imported “${version.label}”. Review the changes below, then publish when ready.` });
      setLabel("");
      setFile(null);
      setFileInputKey((key) => key + 1);
      await load();
    } catch (err) {
      setImportStatus({ kind: "error", text: err instanceof Error ? err.message : "Import failed." });
    } finally {
      setBusy(null);
    }
  }

  async function onPublish(version: PriceBookVersion, setStatus: (status: Status) => void) {
    const adminToken = requireToken(setStatus);
    if (!adminToken) return;
    if (!window.confirm(`Publish “${version.label}” for ${version.dataset}?\n\n${PUBLISH_WARNING}`)) return;
    setBusy(`publish:${version.id}`);
    setStatus(null);
    try {
      const next = await publishPriceBook(version.id, adminToken);
      setListing(next);
      setImported((current) => (current && current.id === version.id ? { ...current, active: true } : current));
      setStatus({ kind: "ok", text: `Published “${version.label}”. New quotes now use it.` });
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof Error ? err.message : "Publish failed." });
    } finally {
      setBusy(null);
    }
  }

  async function onRevert(name: string) {
    const adminToken = requireToken(setDatasetStatus);
    if (!adminToken) return;
    if (!window.confirm(`Revert ${name} to the bundled file?\n\nNew quotes will use the bundled prices again; already-priced drafts will need repricing.`)) return;
    setBusy(`revert:${name}`);
    setDatasetStatus(null);
    try {
      setListing(await revertPriceBook(name, adminToken));
      setImported((current) => (current && current.dataset === name ? { ...current, active: false } : current));
      setDatasetStatus({ kind: "ok", text: `${name} now uses the bundled file.` });
    } catch (err) {
      setDatasetStatus({ kind: "error", text: err instanceof Error ? err.message : "Revert failed." });
    } finally {
      setBusy(null);
    }
  }

  const versionById = useMemo(() => new Map(versions.map((version) => [version.id, version])), [versions]);
  const importedCurrent = imported ? versionById.get(imported.id) ?? imported : null;

  return (
    <div className="space-y-8">
      <div className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Manager controls</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Price books</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          To update supplier prices, download the current JSON for a dataset, edit the prices, and import it here as a new
          version. Review the changes it would make, then publish it so every new quote uses it. You can revert to the
          bundled file at any time.
        </p>
      </div>

      <section aria-labelledby="token-title" className="rounded-2xl border border-brand-100 bg-brand-50 p-4 sm:p-6">
        <h3 id="token-title" className="text-base font-semibold text-slate-900">Manager token</h3>
        <p className="mt-1 text-sm text-slate-600">Needed to import, publish or revert. Downloading is open to everyone.</p>
        <label className="mt-4 block max-w-sm text-sm">
          <span className="mb-1 block font-medium text-slate-700">Pricing admin token</span>
          <input className={INPUT} type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Manager token" />
        </label>
      </section>

      {loadError ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{loadError}</p> : null}
      {!listing && !loadError ? <p className="text-sm text-slate-500">Loading price books…</p> : null}

      {listing ? (
        <>
          <Card id="datasets" title="Datasets" description="Each dataset is a bundled JSON file. A published import overrides the file until you revert.">
            <ul className="grid gap-3 md:grid-cols-2">
              {listing.datasets.map((entry) => {
                const activeVersion = entry.active_version ? versionById.get(entry.active_version) : undefined;
                return (
                  <li key={entry.dataset} className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 p-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">{datasetLabel(entry.dataset)}</p>
                        {entry.active_version ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Imported version active</span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Bundled file</span>
                        )}
                      </div>
                      <p className="mt-1 break-all font-mono text-xs text-slate-500">{entry.dataset}</p>
                      <p className="mt-0.5 break-all text-xs text-slate-500">File: {entry.file}</p>
                      {activeVersion ? (
                        <p className="mt-1 text-xs text-slate-600">
                          Using “{activeVersion.label}”, published {formatDate(activeVersion.published_at)}
                        </p>
                      ) : null}
                    </div>
                    <div className="mt-auto flex flex-wrap gap-2">
                      <a
                        href={currentPriceBookUrl(entry.dataset)}
                        download={`${entry.dataset.replace(/\//g, "-")}.json`}
                        className={SECONDARY_BUTTON}
                      >
                        Download current JSON
                      </a>
                      {entry.active_version ? (
                        <button
                          type="button"
                          onClick={() => onRevert(entry.dataset)}
                          disabled={busy !== null}
                          className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {busy === `revert:${entry.dataset}` ? "Reverting…" : "Revert to bundled file"}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            <StatusMessage status={datasetStatus} />
          </Card>

          <Card id="import" title="Import a new version" description="Upload an edited JSON file. Nothing changes for quotes until you publish it.">
            <form onSubmit={onImport} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.2fr_auto] lg:items-end">
              <label className="block min-w-0 text-sm">
                <span className="mb-1 block font-medium text-slate-700">Dataset</span>
                <select className={INPUT} value={dataset} onChange={(e) => setDataset(e.target.value)}>
                  {listing.datasets.map((entry) => (
                    <option key={entry.dataset} value={entry.dataset}>{datasetLabel(entry.dataset)}</option>
                  ))}
                </select>
              </label>
              <label className="block min-w-0 text-sm">
                <span className="mb-1 block font-medium text-slate-700">Label</span>
                <input className={INPUT} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Window City 2026 price increase" />
              </label>
              <label className="block min-w-0 text-sm">
                <span className="mb-1 block font-medium text-slate-700">JSON file</span>
                <input
                  key={fileInputKey}
                  type="file"
                  accept=".json,application/json"
                  className="block w-full min-w-0 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <button type="submit" disabled={busy !== null} className={PRIMARY_BUTTON}>
                {busy === "import" ? "Importing…" : "Import and compare"}
              </button>
            </form>
            <StatusMessage status={importStatus} />

            {importedCurrent ? (
              <div className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-slate-900">{importedCurrent.label}</p>
                  <span className="text-xs text-slate-500">{importedCurrent.dataset}</span>
                  {importedCurrent.active ? <ActiveBadge /> : null}
                </div>
                <DiffSummary summary={importedCurrent.summary} />
                {!importedCurrent.active ? (
                  <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm leading-6 text-amber-900">
                      <strong>Before publishing:</strong> {PUBLISH_WARNING}
                    </p>
                    <button
                      type="button"
                      onClick={() => onPublish(importedCurrent, setImportStatus)}
                      disabled={busy !== null}
                      className={`${PRIMARY_BUTTON} shrink-0`}
                    >
                      {busy === `publish:${importedCurrent.id}` ? "Publishing…" : "Publish this version"}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </Card>

          <Card id="versions" title="All versions" description="Newest first. Publishing an older version makes it the active one for its dataset.">
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-3 py-3">Label</th>
                    <th scope="col" className="px-3 py-3">Dataset</th>
                    <th scope="col" className="px-3 py-3">Created</th>
                    <th scope="col" className="px-3 py-3">Published</th>
                    <th scope="col" className="px-3 py-3">Changes</th>
                    <th scope="col" className="px-3 py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {versions.map((version) => (
                    <VersionRow
                      key={version.id}
                      version={version}
                      expanded={expanded === version.id}
                      onToggle={() => setExpanded((current) => (current === version.id ? null : version.id))}
                      busy={busy}
                      onPublish={() => onPublish(version, setVersionsStatus)}
                    />
                  ))}
                  {!versions.length ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        No imported versions yet. Every quote uses the bundled files.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <StatusMessage status={versionsStatus} />
          </Card>
        </>
      ) : null}
    </div>
  );
}

function VersionRow({
  version,
  expanded,
  onToggle,
  busy,
  onPublish,
}: {
  version: PriceBookVersion;
  expanded: boolean;
  onToggle: () => void;
  busy: string | null;
  onPublish: () => void;
}) {
  const detailsId = `version-details-${version.id}`;
  return (
    <>
      <tr className={version.active ? "bg-emerald-50/40" : undefined}>
        <td className="px-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-900">{version.label}</span>
            {version.active ? <ActiveBadge /> : null}
          </div>
        </td>
        <td className="px-3 py-3 font-mono text-xs text-slate-600">{version.dataset}</td>
        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatDate(version.created_at)}</td>
        <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatDate(version.published_at)}</td>
        <td className="px-3 py-3 text-slate-700">
          <ChangeSummaryText summary={version.summary} />
        </td>
        <td className="whitespace-nowrap px-3 py-3 text-right">
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              aria-controls={detailsId}
              className="text-xs font-semibold text-brand-700 hover:underline"
            >
              {expanded ? "Hide changes" : "View changes"}
            </button>
            {!version.active ? (
              <button
                type="button"
                onClick={onPublish}
                disabled={busy !== null}
                className="text-xs font-semibold text-brand-700 hover:underline disabled:opacity-50"
              >
                {busy === `publish:${version.id}` ? "Publishing…" : version.published_at ? "Re-publish" : "Publish"}
              </button>
            ) : null}
          </div>
        </td>
      </tr>
      {expanded ? (
        <tr id={detailsId}>
          <td colSpan={6} className="bg-slate-50 px-3 py-4">
            <DiffSummary summary={version.summary} />
          </td>
        </tr>
      ) : null}
    </>
  );
}
