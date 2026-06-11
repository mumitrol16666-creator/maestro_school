"use client";

import { Bell, BellOff, CheckCircle2, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import {
  getNotificationPermission,
  isPushAvailable,
  sendTestPushNotification,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
} from "@/lib/push-notifications";

export function PushNotificationsCard() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        setPermission(getNotificationPermission());
        setAvailable(await isPushAvailable());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function enable() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await subscribeToPushNotifications();
      setPermission(getNotificationPermission());
      setMessage("Уведомления включены");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось включить уведомления");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await unsubscribeFromPushNotifications();
      setPermission(getNotificationPermission());
      setMessage("Уведомления отключены");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось отключить уведомления");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setError(null);
    try {
      const result = await sendTestPushNotification();
      if (result.skipped) {
        setError("Сервер ещё не настроил push-уведомления");
      } else if (result.sent === 0) {
        setError("Подписка не найдена — сначала включите уведомления");
      } else {
        setMessage("Тестовое уведомление отправлено");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось отправить тест");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-[30px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
        <div className="flex items-center gap-3 text-sm text-stone-500">
          <LoaderCircle size={16} className="animate-spin" />
          Проверяем поддержку уведомлений...
        </div>
      </div>
    );
  }

  if (!available) {
    return (
      <div className="rounded-[30px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.17em] text-gold">Уведомления</p>
        <p className="mt-3 text-sm leading-6 text-stone-500">
          Push пока недоступны: нужен HTTPS, установленное PWA-приложение или Chrome на Android, и настройка VAPID-ключей на сервере.
        </p>
      </div>
    );
  }

  const enabled = permission === "granted";

  return (
    <div className="rounded-[30px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-ink text-gold">
          {enabled ? <Bell size={20} /> : <BellOff size={20} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.17em] text-gold">Push-уведомления</p>
          <h3 className="font-display mt-2 text-3xl">Оставаться в курсе</h3>
          <p className="mt-3 text-sm leading-6 text-stone-500">
            Получайте сообщения, когда преподаватель проверил домашнее задание — принято или нужна доработка.
          </p>

          {enabled ? (
            <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <CheckCircle2 size={16} />
              Уведомления включены
            </div>
          ) : permission === "denied" ? (
            <p className="mt-4 text-sm leading-6 text-amber-800">
              Уведомления заблокированы в браузере. Откройте настройки сайта в Chrome → Разрешения → Уведомления → Разрешить.
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            {!enabled && permission !== "denied" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void enable()}
                className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
              >
                {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Bell size={16} />}
                Включить уведомления
              </button>
            )}
            {enabled && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void test()}
                  className="inline-flex items-center gap-2 rounded-full border border-stone-200 px-5 py-3 text-sm font-bold"
                >
                  Проверить
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void disable()}
                  className="inline-flex items-center gap-2 rounded-full border border-stone-200 px-5 py-3 text-sm font-bold text-stone-600"
                >
                  Отключить
                </button>
              </>
            )}
          </div>

          {message && <p className="mt-4 text-sm font-semibold text-emerald-700">{message}</p>}
          {error && <p className="mt-4 text-sm font-semibold text-red-700">{error}</p>}
        </div>
      </div>
    </div>
  );
}
