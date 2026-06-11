"use client";

import { CheckCircle2, Download, Smartphone } from "lucide-react";
import { usePwaInstall } from "./pwa-provider";

export function PwaInstallCard() {
  const { canInstall, installed, install } = usePwaInstall();

  if (installed) {
    return (
      <div className="rounded-[30px] border border-emerald-200 bg-emerald-50 p-6 shadow-soft sm:p-8">
        <div className="flex items-center gap-3 text-emerald-800">
          <CheckCircle2 size={20} />
          <p className="text-sm font-bold">Приложение Maestro установлено на этом устройстве</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[30px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-ink text-gold">
          <Smartphone size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.17em] text-gold">Мобильное приложение</p>
          <h3 className="font-display mt-2 text-3xl">Установить на Android</h3>
          <p className="mt-3 text-sm leading-6 text-stone-500">
            Maestro можно добавить на главный экран — будет открываться как приложение, без адресной строки браузера.
          </p>
          {canInstall ? (
            <button
              type="button"
              onClick={() => void install()}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-bold text-white"
            >
              <Download size={16} />
              Установить приложение
            </button>
          ) : (
            <ol className="mt-5 list-decimal space-y-2 pl-5 text-sm leading-6 text-stone-600">
              <li>Откройте сайт в <strong>Chrome</strong> на Android</li>
              <li>Меню ⋮ → <strong>«Установить приложение»</strong> или <strong>«Добавить на главный экран»</strong></li>
              <li>Подтвердите установку — иконка Maestro появится на экране</li>
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
