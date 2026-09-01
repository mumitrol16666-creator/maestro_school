"use client";

import { useEffect } from "react";
import { APP_CACHE_VERSION } from "@/lib/pwa-version";

const RECOVERY_QUERY = "_maestro_refresh";
const GLOBAL_RECOVERY_QUERY = "_maestro_recover";
const RECOVERY_KEY = "maestro_client_runtime_recovery_at";
const RECOVERY_COOLDOWN_MS = 15_000;
const VERSION_CHECK_INTERVAL_MS = 30_000;

function looksLikeStaleClientRuntime(message: string) {
  return /chunkloaderror|loading chunk|dynamically imported module|module script|react client manifest|__webpack_require__|module factory/i.test(message)
    || /cannot read properties of undefined.*reading ['"](?:call|apply)['"]/i.test(message);
}

export function ClientRuntimeRecovery() {
  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.has(RECOVERY_QUERY) || currentUrl.searchParams.has(GLOBAL_RECOVERY_QUERY)) {
      currentUrl.searchParams.delete(RECOVERY_QUERY);
      currentUrl.searchParams.delete(GLOBAL_RECOVERY_QUERY);
      window.history.replaceState(window.history.state, "", currentUrl.toString());
    }

    function recover() {
      const now = Date.now();
      const previousRecovery = Number(window.sessionStorage.getItem(RECOVERY_KEY) ?? 0);
      if (Number.isFinite(previousRecovery) && now - previousRecovery < RECOVERY_COOLDOWN_MS) return;

      window.sessionStorage.setItem(RECOVERY_KEY, String(now));
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set(RECOVERY_QUERY, String(now));
      window.location.replace(nextUrl.toString());
    }

    function onWindowError(event: Event) {
      const target = event.target;
      if (target instanceof HTMLScriptElement && target.src.includes("/_next/static/")) {
        recover();
        return;
      }

      if (event instanceof ErrorEvent) {
        const message = [
          event.message,
          event.filename,
          event.error instanceof Error ? event.error.message : "",
          event.error instanceof Error ? event.error.stack : "",
        ].filter(Boolean).join(" ");
        if (looksLikeStaleClientRuntime(message)) recover();
      }
    }

    function onUnhandledRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;
      const message = reason instanceof Error ? `${reason.name} ${reason.message}` : String(reason ?? "");
      if (looksLikeStaleClientRuntime(message)) recover();
    }

    async function checkApplicationVersion() {
      try {
        const response = await fetch(`/app-version?_=${Date.now()}`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) return;
        const payload = await response.json() as { version?: unknown };
        if (typeof payload.version === "string" && payload.version !== APP_CACHE_VERSION) recover();
      } catch {
        // The current screen remains usable while the local server is restarting.
      }
    }

    function onFocus() {
      void checkApplicationVersion();
    }

    function onVisibilityChange() {
      if (!document.hidden) void checkApplicationVersion();
    }

    window.addEventListener("error", onWindowError, true);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    const versionTimer = window.setInterval(() => void checkApplicationVersion(), VERSION_CHECK_INTERVAL_MS);
    void checkApplicationVersion();
    return () => {
      window.removeEventListener("error", onWindowError, true);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(versionTimer);
    };
  }, []);

  return null;
}
