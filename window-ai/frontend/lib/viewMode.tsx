"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchManagerTokenConfigured, verifyManagerToken } from "@/lib/api";

/**
 * Internal vs customer view, shared by every page.
 *
 * - internal: supplier cost, dealer cost, margin and profit are shown.
 * - customer: the same editing pages, with every cost / margin figure removed
 *   so a rep can configure products in front of the customer.
 *
 * A "rep" role locks the app in the customer view on this device; leaving it
 * needs the manager token. This is a presentation safeguard for screen sharing
 * and handing the tablet to a rep -- it is not access control: the pricing API
 * still returns internal figures to any caller.
 *
 * Without a manager token on the API (PRICING_ADMIN_TOKEN) nothing could ever
 * unlock the device, so the lock is not offered and a device locked earlier is
 * released to the customer view.
 */
export type ViewMode = "internal" | "customer";
export type ViewRole = "admin" | "rep";

type ViewModeState = {
  mode: ViewMode;
  role: ViewRole;
  internal: boolean;
  setMode: (mode: ViewMode) => void;
  toggle: () => void;
  lockAsRep: () => void;
  unlock: (managerToken: string) => Promise<boolean>;
  /** False when the API has no manager token, so the rep lock could not be undone. */
  canLock: boolean;
};

const STORAGE_KEY = "bv-view-mode";
export const VIEW_MODE_SHORTCUT = "Alt+Shift+C";

const ViewModeContext = createContext<ViewModeState | null>(null);

function readStored(): { mode: ViewMode; role: ViewRole } {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { mode: "internal", role: "admin" };
    const parsed = JSON.parse(raw) as { mode?: string; role?: string };
    const role: ViewRole = parsed.role === "rep" ? "rep" : "admin";
    const mode: ViewMode = role === "rep" || parsed.mode === "customer" ? "customer" : "internal";
    return { mode, role };
  } catch {
    return { mode: "internal", role: "admin" };
  }
}

function store(value: { mode: ViewMode; role: ViewRole }) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Private windows or blocked storage: the mode still works for this page.
  }
}

export function ViewModeProvider({ children }: { children: ReactNode }) {
  // Start customer-safe: a rep-locked device must never flash costs before
  // the saved mode is read on the client.
  const [state, setState] = useState<{ mode: ViewMode; role: ViewRole }>({ mode: "customer", role: "admin" });
  // Unknown (API unreachable) keeps the lock available, as before.
  const [tokenConfigured, setTokenConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    setState(readStored());
    let cancelled = false;
    fetchManagerTokenConfigured().then((configured) => {
      if (cancelled) return;
      setTokenConfigured(configured);
      if (configured === false && readStored().role === "rep") {
        // No token can unlock it: release to the customer view, costs still hidden.
        const released = { mode: "customer" as const, role: "admin" as const };
        setState(released);
        store(released);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.viewMode = state.mode;
  }, [state.mode]);

  const update = useCallback((next: { mode: ViewMode; role: ViewRole }) => {
    setState(next);
    store(next);
  }, []);

  const setMode = useCallback((mode: ViewMode) => {
    setState((current) => {
      if (current.role === "rep") return current;
      const next = { ...current, mode };
      store(next);
      return next;
    });
  }, []);

  const toggle = useCallback(() => {
    setState((current) => {
      if (current.role === "rep") return current;
      const next = { ...current, mode: current.mode === "internal" ? "customer" as const : "internal" as const };
      store(next);
      return next;
    });
  }, []);

  const lockAsRep = useCallback(() => {
    if (tokenConfigured === false) return;
    update({ mode: "customer", role: "rep" });
  }, [tokenConfigured, update]);

  const unlock = useCallback(async (managerToken: string) => {
    if (!managerToken.trim()) return false;
    const ok = await verifyManagerToken(managerToken.trim()).catch(() => false);
    if (ok) update({ mode: "internal", role: "admin" });
    return ok;
  }, [update]);

  // Quick hide for screen sharing: Alt+Shift+C flips internal / customer.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && event.code === "KeyC") {
        event.preventDefault();
        toggle();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const value = useMemo<ViewModeState>(() => ({
    ...state,
    internal: state.mode === "internal",
    setMode,
    toggle,
    lockAsRep,
    unlock,
    canLock: tokenConfigured !== false,
  }), [lockAsRep, setMode, state, tokenConfigured, toggle, unlock]);

  return <ViewModeContext.Provider value={value}>{children}</ViewModeContext.Provider>;
}

/** Outside the provider (tests, the customer portal) everything is customer-safe. */
const CUSTOMER_ONLY: ViewModeState = {
  mode: "customer",
  role: "rep",
  internal: false,
  setMode: () => undefined,
  toggle: () => undefined,
  lockAsRep: () => undefined,
  unlock: async () => false,
  canLock: false,
};

export function useViewMode(): ViewModeState {
  return useContext(ViewModeContext) ?? CUSTOMER_ONLY;
}

/** Renders its children only in the internal view: wrap every cost, margin and profit figure. */
export function InternalOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const { internal } = useViewMode();
  return <>{internal ? children : fallback}</>;
}
