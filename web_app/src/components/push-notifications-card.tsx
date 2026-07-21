"use client";

import { Bell, BellOff, CheckCircle2, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import {
  getNotificationPermission,
  getPushServerStatus,
  isPushSupportedOnDevice,
  sendTestPushNotification,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
} from "@/lib/push-notifications";

export function PushNotificationsCard() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [serverReady, setServerReady] = useState(false);
  const [deviceReady, setDeviceReady] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        setPermission(getNotificationPermission());
        setDeviceReady(isPushSupportedOnDevice());
        const status = await getPushServerStatus();
        setServerReady(status.ready);
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
      setMessage("Готово — будем сообщать о важных изменениях.");
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
        setError("Сейчас уведомления недоступны. Попробуйте позже.");
      } else if (result.sent === 0) {
        setError("Сначала нажмите «Включить уведомления».");
      } else {
        setMessage("Отправили пробное сообщение — проверьте экран телефона.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось отправить пробное сообщение");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-[30px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
        <div className="flex items-center gap-3 text-sm text-stone-500">
          <LoaderCircle size={16} className="animate-spin" />
          Загружаем настройки...
        </div>
      </div>
    );
  }

  if (!deviceReady) {
    return (
      <div className="rounded-[30px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-ink text-gold">
            <Bell size={20} />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.17em] text-gold">Уведомления</p>
            <h3 className="font-display mt-2 text-3xl">На этом устройстве</h3>
            <p className="mt-3 text-sm leading-6 text-stone-500">
              Чтобы получать сообщения об уроках и заданиях, откройте Maestro в браузере <strong>Chrome на телефоне Android</strong>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!serverReady) {
    return (
      <div className="rounded-[30px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-ink text-gold">
            <BellOff size={20} />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.17em] text-gold">Уведомления</p>
            <h3 className="font-display mt-2 text-3xl">Скоро будут доступны</h3>
            <p className="mt-3 text-sm leading-6 text-stone-500">
              Мы подключаем уведомления на сервере. Зайдите в профиль чуть позже и включите их здесь.
            </p>
          </div>
        </div>
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
          <p className="text-xs font-bold uppercase tracking-[0.17em] text-gold">Уведомления</p>
          <h3 className="font-display mt-2 text-3xl">О важных событиях</h3>
          <p className="mt-3 text-sm leading-6 text-stone-500">
            Сообщим об изменениях по урокам, отчётам и домашним заданиям.
          </p>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-stone-500">
            <li>✓ Отчёт по уроку принят</li>
            <li>✓ Домашнее задание принято</li>
            <li>✓ Нужна доработка задания</li>
            <li>✓ Переносы, отмены и новые сообщения</li>
          </ul>

          {enabled ? (
            <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <CheckCircle2 size={16} />
              Уведомления включены
            </div>
          ) : permission === "denied" ? (
            <p className="mt-4 text-sm leading-6 text-amber-800">
              Уведомления запрещены в настройках браузера. Разрешите их для сайта Maestro — обычно это в меню ⋮ → «Настройки сайта» → «Уведомления».
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
