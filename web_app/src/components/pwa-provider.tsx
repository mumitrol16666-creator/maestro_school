"use client";

import { Download, Smartphone, X } from "lucide-react";
import { useEffect, useState } from "react";
import { APP_CACHE_VERSION, SERVICE_WORKER_URL } from "@/lib/pwa-version";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "maestro_pwa_install_dismissed";

export function PwaProvider() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    if (standalone) {
      setInstalled(true);
    }

    let onControllerChange: (() => void) | null = null;
    if ("serviceWorker" in navigator) {
      const hadController = Boolean(navigator.serviceWorker.controller);
      const reloadKey = `maestro_sw_reloaded_${APP_CACHE_VERSION}`;
      onControllerChange = () => {
        if (!hadController || sessionStorage.getItem(reloadKey)) return;
        sessionStorage.setItem(reloadKey, "1");
        window.location.reload();
      };
      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
      navigator.serviceWorker
        .register(SERVICE_WORKER_URL, { scope: "/", updateViaCache: "none" })
        .then((registration) => registration.update())
        .catch(() => undefined);
    }

    function onBeforeInstall(event: Event) {
      event.preventDefault();
      if (localStorage.getItem(DISMISS_KEY)) return;
      setInstallEvent(event as BeforeInstallPromptEvent);
      setVisible(true);
    }

    function onInstalled() {
      setInstalled(true);
      setVisible(false);
      setInstallEvent(null);
    }

    if (!standalone) {
      window.addEventListener("beforeinstallprompt", onBeforeInstall);
      window.addEventListener("appinstalled", onInstalled);
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      if (onControllerChange) {
        navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      }
    };
  }, []);

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    setVisible(false);
    setInstallEvent(null);
    if (choice.outcome === "dismissed") localStorage.setItem(DISMISS_KEY, "1");
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  if (installed || !visible) return null;

  return (
    <div className="fixed inset-x-4 bottom-[calc(6.5rem+env(safe-area-inset-bottom,0px))] z-[60] mx-auto max-w-lg rounded-[22px] border border-stone-200 bg-paper p-4 shadow-soft lg:inset-x-auto lg:bottom-6 lg:right-6">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ink text-gold">
          <Smartphone size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">Добавить Maestro на главный экран</p>
          <p className="mt-1 text-xs leading-5 text-stone-500">
            Быстрый доступ с телефона — как обычное приложение.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void install()}
              className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-xs font-bold text-white"
            >
              <Download size={14} />
              Установить
            </button>
            <button type="button" onClick={dismiss} className="rounded-full border border-stone-200 px-4 py-2 text-xs font-bold text-stone-600">
              Позже
            </button>
          </div>
        </div>
        <button type="button" onClick={dismiss} aria-label="Закрыть" className="text-stone-400">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

export function usePwaInstall() {
  const [canInstall, setCanInstall] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
      return;
    }

    function onBeforeInstall(event: Event) {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setCanInstall(true);
    }

    function onInstalled() {
      setInstalled(true);
      setCanInstall(false);
      setInstallEvent(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!installEvent) return false;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") return true;
    return false;
  }

  return { canInstall, installed, install };
}
