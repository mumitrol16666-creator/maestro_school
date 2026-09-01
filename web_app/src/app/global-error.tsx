"use client";

import { Home, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

const RECOVERY_KEY = "maestro_global_error_recovery_at";
const RECOVERY_QUERY = "_maestro_recover";
const RECOVERY_COOLDOWN_MS = 15_000;

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [showActions, setShowActions] = useState(false);

  useEffect(() => {
    const now = Date.now();
    const previousRecovery = Number(window.sessionStorage.getItem(RECOVERY_KEY) ?? 0);
    const recoveredRecently = Number.isFinite(previousRecovery) && now - previousRecovery < RECOVERY_COOLDOWN_MS;

    if (recoveredRecently) {
      if (window.location.pathname !== "/dashboard") {
        window.location.replace("/dashboard");
        return;
      }
      setShowActions(true);
      return;
    }

    window.sessionStorage.setItem(RECOVERY_KEY, String(now));
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set(RECOVERY_QUERY, String(now));
    window.location.replace(nextUrl.toString());
  }, []);

  return (
    <html lang="ru">
      <body className="m-0 bg-[#f7f4ed] text-[#171714]">
        <main className="grid min-h-dvh place-items-center px-5 py-10">
          {showActions ? (
            <section className="w-full max-w-sm text-center">
              <p className="font-display text-2xl text-ink">Maestro</p>
              <h1 className="font-display mt-7 text-4xl leading-tight text-ink">Продолжить обучение</h1>
              <div className="mt-7 grid gap-2 sm:grid-cols-2">
                <a
                  href="/dashboard"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-ink px-5 text-sm font-bold text-white"
                >
                  <Home size={16} aria-hidden="true" /> На главную
                </a>
                <button
                  type="button"
                  onClick={() => reset()}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-5 text-sm font-bold text-stone-700"
                >
                  <RotateCcw size={16} aria-hidden="true" /> Повторить
                </button>
              </div>
            </section>
          ) : (
            <p className="font-display text-3xl text-ink">Maestro</p>
          )}
        </main>
      </body>
    </html>
  );
}
