"use client";

import { BellRing, LoaderCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  getNotificationPermission,
  getPushServerStatus,
  isPushSupportedOnDevice,
  subscribeToPushNotifications,
} from "@/lib/push-notifications";

const DISMISS_FOR_MS = 24 * 60 * 60 * 1000;

function dismissalKey(userId: string) {
  return `maestro:push-prompt-dismissed:${userId}`;
}

export function PushNotificationPrompt({
  userId,
  audience,
}: {
  userId: string;
  audience: "student" | "teacher";
}) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      if (!isPushSupportedOnDevice()) return;
      const permission = getNotificationPermission();
      if (permission === "denied" || permission === "unsupported") return;

      const server = await getPushServerStatus();
      if (!active || !server.ready) return;

      if (permission === "granted") {
        // Re-register an existing browser subscription on the server after
        // cache clearing, app reinstall or account change.
        await subscribeToPushNotifications().catch(() => undefined);
        return;
      }

      const dismissedAt = Number(window.localStorage.getItem(dismissalKey(userId)) || 0);
      if (Date.now() - dismissedAt >= DISMISS_FOR_MS) {
        setVisible(true);
      }
    })();

    return () => {
      active = false;
    };
  }, [userId]);

  function dismiss() {
    window.localStorage.setItem(dismissalKey(userId), String(Date.now()));
    setVisible(false);
  }

  async function enableNotifications() {
    setBusy(true);
    setError(null);
    try {
      await subscribeToPushNotifications();
      setEnabled(true);
      window.localStorage.removeItem(dismissalKey(userId));
      window.setTimeout(() => setVisible(false), 1600);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось включить уведомления");
    } finally {
      setBusy(false);
    }
  }

  if (!visible) return null;

  const teacher = audience === "teacher";

  return (
    <aside
      className="fixed inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))] z-[70] mx-auto max-w-md rounded-[24px] border border-gold/35 bg-ink p-4 text-white shadow-[0_24px_70px_rgba(0,0,0,0.34)] sm:inset-x-auto sm:bottom-6 sm:right-6 sm:mx-0 sm:p-5 lg:bottom-8 lg:right-8"
      aria-live="polite"
    >
      <button
        type="button"
        onClick={dismiss}
        className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white/60 transition hover:bg-white/20 hover:text-white"
        aria-label="Напомнить позже"
      >
        <X size={16} />
      </button>

      <div className="flex items-start gap-3 pr-8">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gold text-ink">
          <BellRing size={20} />
        </span>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gold">Уведомления на телефон</p>
          <h2 className="mt-1 text-lg font-black">
            {enabled ? "Уведомления включены" : teacher ? "Не пропускайте начало урока" : "Не пропускайте занятия"}
          </h2>
        </div>
      </div>

      {!enabled ? (
        <>
          <p className="mt-3 text-sm leading-5 text-white/65">
            {teacher
              ? "Напомним за 30 и 5 минут — сразу со ссылкой на карточку урока."
              : "Напомним за 24 часа и за 2 часа — с датой, временем и преподавателем."}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void enableNotifications()}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-gold px-4 py-3 text-sm font-black text-ink transition hover:brightness-105 disabled:opacity-60"
          >
            {busy ? <LoaderCircle size={17} className="animate-spin" /> : <BellRing size={17} />}
            Включить уведомления
          </button>
        </>
      ) : (
        <p className="mt-3 text-sm font-semibold text-emerald-300">
          Готово. Напоминания будут приходить даже при закрытом приложении.
        </p>
      )}

      {error ? <p className="mt-3 text-xs font-semibold leading-5 text-red-300">{error}</p> : null}
    </aside>
  );
}
