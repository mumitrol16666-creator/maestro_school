"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";

type RefreshAppButtonProps = {
  compact?: boolean;
  onBeforeRefresh?: () => void;
};

export function RefreshAppButton({ compact = false, onBeforeRefresh }: RefreshAppButtonProps) {
  const [refreshing, setRefreshing] = useState(false);

  async function refreshApp() {
    if (refreshing) return;
    setRefreshing(true);
    onBeforeRefresh?.();

    try {
      if ("caches" in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
      }

      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.update()));
      }
    } finally {
      const url = new URL(window.location.href);
      url.searchParams.set("_refresh", Date.now().toString());
      window.location.replace(url.toString());
    }
  }

  return (
    <button
      type="button"
      role={compact ? "menuitem" : undefined}
      onClick={() => void refreshApp()}
      disabled={refreshing}
      aria-label="Обновить"
      title="Обновить"
      className={compact
        ? "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-100 disabled:opacity-60"
        : "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-xs font-bold text-stone-600 transition hover:border-gold/30 hover:bg-amber-50 hover:text-amber-900 disabled:opacity-60 sm:rounded-full sm:px-4"}
    >
      <RefreshCw size={compact ? 16 : 14} className={refreshing ? "animate-spin" : ""} />
      <span className={compact ? "" : "hidden sm:inline"}>{refreshing ? "Обновляем…" : "Обновить"}</span>
    </button>
  );
}
