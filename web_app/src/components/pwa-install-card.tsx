"use client";

import { Download, Share, Smartphone } from "lucide-react";
import { usePlatform } from "@/lib/platform";
import { usePwaInstall } from "./pwa-provider";

/** The words for the student («ты») and for the parent or staff («вы»). */
type InstallTone = "ty" | "vy";

/**
 * В-40: on iPhone the app is installed from Safari through «Поделиться → На экран «Домой»».
 * Three steps with the real Share icon; in another iOS browser only the way to Safari is shown.
 */
export function IosInstallSteps({ tone = "ty", ipad = false }: { tone?: InstallTone; ipad?: boolean }) {
  const ty = tone === "ty";
  return (
    <ol className="mt-5 space-y-3 text-sm leading-6 text-stone-600" data-testid="ios-install-steps">
      <li className="flex items-start gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-white">1</span>
        <span>
          {ty ? "Нажми" : "Нажмите"}{" "}
          <strong className="inline-flex items-center gap-1 align-bottom">
            <Share size={16} aria-hidden="true" />«Поделиться»
          </strong>{" "}
          {ipad ? "вверху экрана" : "внизу экрана"}
        </span>
      </li>
      <li className="flex items-start gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-white">2</span>
        <span>{ty ? "Выбери" : "Выберите"} <strong>«На экран „Домой“»</strong></span>
      </li>
      <li className="flex items-start gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-white">3</span>
        <span>{ty ? "Нажми" : "Нажмите"} <strong>«Добавить»</strong></span>
      </li>
    </ol>
  );
}

export function OpenInSafariNote({ tone = "ty" }: { tone?: InstallTone }) {
  return (
    <p className="mt-5 text-sm font-semibold leading-6 text-stone-700" data-testid="ios-open-in-safari">
      {tone === "ty"
        ? "Открой эту страницу в Safari, чтобы установить приложение."
        : "Откройте эту страницу в Safari, чтобы установить приложение."}
    </p>
  );
}

export function PwaInstallCard() {
  const { canInstall, installed, install } = usePwaInstall();
  const platform = usePlatform();

  // Not detected yet, running as the installed app, or installed a moment ago (appinstalled): nothing to offer.
  if (!platform || platform.installed || installed) return null;

  return (
    <div id="pwa-install-card" className="scroll-mt-24 rounded-[30px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8" data-testid="pwa-install-card">
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-ink text-gold-ink">
          <Smartphone size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.17em] text-gold-ink">Установка из браузера</p>
          <h3 className="font-display mt-2 text-3xl">Приложение на телефоне</h3>
          <p className="mt-3 text-sm leading-6 text-stone-500">
            Иконка Maestro на экране телефона — открывается сразу, как обычное приложение.
          </p>
          {platform.os === "ios" ? (
            platform.iosSafari ? <IosInstallSteps ipad={platform.ipad} /> : <OpenInSafariNote />
          ) : canInstall ? (
            <button
              type="button"
              onClick={() => void install()}
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-bold text-white"
            >
              <Download size={16} />
              Установить приложение
            </button>
          ) : (
            <ol className="mt-5 list-decimal space-y-2 pl-5 text-sm leading-6 text-stone-600">
              <li>Открой сайт в браузере <strong>Chrome</strong> на телефоне</li>
              <li>Нажми меню ⋮ вверху справа</li>
              <li>Выбери <strong>«Установить приложение»</strong> или <strong>«Добавить на главный экран»</strong></li>
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
