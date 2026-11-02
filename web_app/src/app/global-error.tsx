"use client";

import "./globals.css";
import { useEffect, useState } from "react";
import { AppErrorScreen } from "@/components/app-error-screen";

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
      <body className="m-0 bg-cream text-ink">
        {showActions ? (
          <AppErrorScreen
            fullPage
            title="Что-то пошло не так"
            reason={typeof navigator !== "undefined" && !navigator.onLine
              ? "Нет связи. Проверь интернет и нажми «Повторить»."
              : "Приложение не открылось из-за ошибки. Попробуй ещё раз."}
            onRetry={() => reset()}
          />
        ) : (
          <main className="grid min-h-dvh place-items-center px-5 py-10">
            <img src="/brand/guitar-avatar.png" width={72} height={72} alt="Maestro" className="h-[72px] w-[72px] rounded-2xl" />
          </main>
        )}
      </body>
    </html>
  );
}
