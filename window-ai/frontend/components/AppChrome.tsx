"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, useState } from "react";
import { useViewMode, VIEW_MODE_SHORTCUT } from "@/lib/viewMode";

const salesNav = [
  { href: "/dashboard", label: "Dashboard", internal: true },
  { href: "/projects", label: "Estimates", internal: false },
  { href: "/", label: "Window quote", internal: false },
  { href: "/doors", label: "Doors", internal: false },
];

const adminNav = [
  { href: "/admin/settings", label: "Settings & pricing" },
  { href: "/admin/price-books", label: "Price books" },
  { href: "/admin/reconcile", label: "Supplier cost check" },
  { href: "/admin/estimates", label: "Imported history" },
  { href: "/admin/windows", label: "Historical windows" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/similar", label: "Similar windows" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Internal / customer switch, the rep lock, and unlocking with the manager token. */
function ViewModeControl() {
  const { mode, role, setMode, lockAsRep, unlock } = useViewMode();
  const [unlocking, setUnlocking] = useState(false);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const ok = await unlock(token);
    setBusy(false);
    if (ok) {
      setToken("");
      setUnlocking(false);
    } else {
      setError("That manager token was not accepted.");
    }
  }

  if (role === "rep") {
    return (
      <div className="relative flex items-center gap-2">
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">Rep view · costs hidden</span>
        <button type="button" className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100" onClick={() => setUnlocking((open) => !open)}>Unlock</button>
        {unlocking ? (
          <form onSubmit={submit} className="absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
            <label className="block text-xs font-semibold text-slate-700" htmlFor="unlock-token">Manager token</label>
            <input id="unlock-token" type="password" autoComplete="off" className="input mt-1 w-full" value={token} onChange={(event) => setToken(event.target.value)} autoFocus />
            {error ? <p className="mt-1 text-xs text-rose-700" role="alert">{error}</p> : null}
            <button type="submit" className="mt-2 w-full rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60" disabled={busy || !token.trim()}>{busy ? "Checking…" : "Return to internal view"}</button>
          </form>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-semibold" role="group" aria-label="Pricing view">
        <button type="button" aria-pressed={mode === "internal"} title={`Show costs and margins (${VIEW_MODE_SHORTCUT})`} className={`rounded-md px-2.5 py-1 ${mode === "internal" ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50"}`} onClick={() => setMode("internal")}>Internal</button>
        <button type="button" aria-pressed={mode === "customer"} title={`Hide every cost and margin (${VIEW_MODE_SHORTCUT})`} className={`rounded-md px-2.5 py-1 ${mode === "customer" ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-50"}`} onClick={() => setMode("customer")}>Customer</button>
      </div>
      <button type="button" title="Lock this device in the customer view; the manager token unlocks it" className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800" onClick={lockAsRep}>Rep lock</button>
    </div>
  );
}

/** Staff navigation. Customer-facing estimate links render without it. */
export default function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const { internal, role } = useViewMode();
  if (pathname.startsWith("/estimate/")) return <>{children}</>;
  const adminActive = adminNav.some((item) => isActive(pathname, item.href));
  const visibleSalesNav = salesNav.filter((item) => internal || !item.internal);

  return (
    <div className="min-h-screen">
      <header className="app-chrome border-b border-slate-200 bg-white">
        <div className="app-header-inner mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Better View Solutions</p>
            <h1 className="text-lg font-semibold text-slate-900">Estimating</h1>
          </div>
          <nav className="app-nav flex flex-wrap items-center gap-1 text-sm" aria-label="Main">
            {visibleSalesNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(pathname, item.href) ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 font-medium hover:bg-slate-100 hover:text-slate-900 ${
                  isActive(pathname, item.href) ? "bg-brand-50 text-brand-700" : "text-slate-600"
                }`}
              >
                {item.label}
              </Link>
            ))}
            {internal ? (
              <details className="relative">
                <summary
                  className={`cursor-pointer list-none rounded-lg px-3 py-1.5 font-medium hover:bg-slate-100 hover:text-slate-900 ${
                    adminActive ? "bg-brand-50 text-brand-700" : "text-slate-600"
                  }`}
                >
                  Admin ▾
                </summary>
                <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                  {adminNav.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={isActive(pathname, item.href) ? "page" : undefined}
                      className={`block rounded-lg px-3 py-2 hover:bg-slate-100 ${
                        isActive(pathname, item.href) ? "font-semibold text-brand-700" : "text-slate-700"
                      }`}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </details>
            ) : null}
            <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" aria-hidden />
            <ViewModeControl />
          </nav>
        </div>
        {!internal && role === "admin" ? (
          <div className="border-t border-emerald-200 bg-emerald-50 px-4 py-1.5 text-center text-xs text-emerald-900">
            Customer view: costs, margins and profit are hidden. Press <kbd className="rounded border border-emerald-300 bg-white px-1 font-sans">{VIEW_MODE_SHORTCUT}</kbd> to switch back.
          </div>
        ) : null}
      </header>
      <main className="app-main mx-auto max-w-6xl px-4 py-8">
        {!internal && (adminActive || pathname.startsWith("/dashboard")) ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-900">
            <p className="font-semibold">This page is internal.</p>
            <p className="mt-1">It shows supplier costs and margins, so it is hidden in the customer view. {role === "rep" ? "Ask a manager to unlock this device." : `Switch to the internal view (${VIEW_MODE_SHORTCUT}) to open it.`}</p>
          </div>
        ) : children}
      </main>
    </div>
  );
}
