"use client";

import { SavedTemplate } from "@/lib/api";

/** One compact row: pick a favourite to apply it, save the current options, delete the selected one. */
export default function FavouritesBar<T>({
  favourites,
  selectedId,
  onSelect,
  onSave,
  onDelete,
  busy,
  saveDisabled,
  saveTitle,
  help,
  notice,
  error,
}: {
  favourites: SavedTemplate<T>[];
  selectedId: string;
  onSelect: (id: string) => void;
  onSave: () => void;
  onDelete: () => void;
  busy: boolean;
  saveDisabled?: boolean;
  saveTitle?: string;
  help: string;
  notice?: string | null;
  error?: string | null;
}) {
  return (
    <div>
      <div className="flex items-center gap-2" title={help}>
        <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">Favourite</span>
        <select className="input min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" value={selectedId} onChange={(event) => onSelect(event.target.value)} disabled={busy || !favourites.length} aria-label="Apply a saved favourite">
          <option value="">{favourites.length ? "Apply a saved favourite…" : "None saved yet"}</option>
          {favourites.map((favourite) => <option key={favourite.id} value={favourite.id}>{favourite.name}</option>)}
        </select>
        {selectedId ? (
          <button type="button" className="min-h-[2.5rem] shrink-0 rounded-lg px-2 text-sm text-rose-600 hover:bg-rose-50 disabled:opacity-60" onClick={onDelete} disabled={busy} aria-label="Delete the selected favourite" title="Delete the selected favourite">✕</button>
        ) : null}
        <button type="button" className="min-h-[2.5rem] shrink-0 rounded-lg border border-brand-200 bg-white px-3 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-60" onClick={onSave} disabled={busy || saveDisabled} title={saveTitle || help}>★ Save</button>
      </div>
      {notice ? <p className="mt-1 text-xs text-emerald-700" role="status">{notice}</p> : null}
      {error ? <p className="mt-1 text-xs text-rose-700" role="alert">{error}</p> : null}
    </div>
  );
}
