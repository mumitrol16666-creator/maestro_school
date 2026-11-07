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
import { toast } from "@/components/toast";
import { errorToastText } from "@/lib/error-text";
import { usePlatform } from "@/lib/platform";
import { IosInstallSteps, OpenInSafariNote } from "@/components/pwa-install-card";

export function PushNotificationsCard({
  audience = "default",
  confirm = "inline",
}: {
  audience?: "default" | "parent";
  /** "toast" is for the student app, where the shell shows the toast; elsewhere the text stays in the card. */
  confirm?: "inline" | "toast";
}) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [serverReady, setServerReady] = useState(false);
  const [deviceReady, setDeviceReady] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const platform = usePlatform();
  // «toast» is the student app: it talks to the student as «ты» and has the install card just above,
  // so here only a link to it is needed. The parent and admin screens say «вы» and carry the steps.
  const viaToast = confirm === "toast";
  function tell(text: string, toastText: string) {
    if (viaToast) toast.success(toastText);
    else setMessage(text);
  }
  function fail(text: string, reason?: unknown, toastFallback?: string) {
    if (viaToast) toast.error(errorToastText(reason, toastFallback ?? text));
    else setError(reason instanceof Error ? reason.message : text);
  }

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
      tell("Готово — будем сообщать о важных изменениях.", "Уведомления включены");
    } catch (reason) {
      fail("Не удалось включить уведомления", reason, "Не получилось включить уведомления. Попробуй ещё раз");
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
      tell("Уведомления отключены", "Уведомления выключены");
    } catch (reason) {
      fail("Не удалось отключить уведомления", reason, "Не получилось выключить уведомления. Попробуй ещё раз");
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
        if (viaToast) toast.error("Сейчас уведомления недоступны. Попробуй позже");
        else setError("Сейчас уведомления недоступны. Попробуйте позже.");
      } else if (result.sent === 0) {
        if (viaToast) toast.error("Сначала включи уведомления");
        else setError("Сначала нажмите «Включить уведомления».");
      } else {
        tell("Отправили пробное сообщение — проверьте экран телефона.", "Пробное уведомление отправлено");
      }
    } catch (reason) {
      fail("Не удалось отправить пробное сообщение", reason, "Не получилось отправить пробное уведомление. Попробуй ещё раз");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-[30px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
        <div className="flex items-center gap-3 text-sm text-stone-500">
          <LoaderCircle size={16} className="animate-spin" />
          Загружаем настройки…
        </div>
      </div>
    );
  }

  if (!deviceReady) {
    return (
      <div className="rounded-[30px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-ink text-gold-ink">
            <Bell size={20} />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.17em] text-gold-ink">Уведомления</p>
            <h3 className="font-display mt-2 text-3xl">На этом устройстве</h3>
            {platform?.os === "ios" ? (
              <>
                <p className="mt-3 text-sm leading-6 text-stone-500">
                  {platform.ipad ? "На iPad" : "На iPhone"} уведомления работают в приложении с экрана «Домой» (iOS 16.4 и новее).
                </p>
                {platform.installed ? (
                  <p className="mt-3 text-sm leading-6 text-stone-500">
                    {viaToast ? "Обнови iOS до 16.4 или новее." : "Обновите iOS до 16.4 или новее."}
                  </p>
                ) : viaToast ? (
                  <a href="#pwa-install-card" className="mt-3 inline-flex min-h-11 items-center text-sm font-bold text-gold-ink underline">
                    Как установить приложение — в карточке выше
                  </a>
                ) : platform.iosSafari ? (
                  <IosInstallSteps tone="vy" ipad={platform.ipad} />
                ) : (
                  <OpenInSafariNote tone="vy" />
                )}
              </>
            ) : (
              <p className="mt-3 text-sm leading-6 text-stone-500">
                {viaToast ? "Чтобы получать сообщения об уроках и заданиях, открой" : "Чтобы получать сообщения об уроках и заданиях, откройте"} Maestro в браузере <strong>Chrome на телефоне Android</strong>.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!serverReady) {
    return (
      <div className="rounded-[30px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-ink text-gold-ink">
            <BellOff size={20} />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.17em] text-gold-ink">Уведомления</p>
            <h3 className="font-display mt-2 text-3xl">Уведомления внутри кабинета</h3>
            <p className="mt-3 text-sm leading-6 text-stone-500">
              Новые события уже появляются по значку колокольчика. Уведомления на экран телефона пока недоступны.
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
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-ink text-gold-ink">
          {enabled ? <Bell size={20} /> : <BellOff size={20} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.17em] text-gold-ink">Уведомления</p>
          <h3 className="font-display mt-2 text-3xl">О важных событиях</h3>
          <p className="mt-3 text-sm leading-6 text-stone-500">
            {audience === "parent"
              ? "Сообщим только о важных событиях по привязанным ученикам."
              : "Сообщим об изменениях по урокам, отчётам и домашним заданиям."}
          </p>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-stone-500">
            {audience === "parent" ? (
              <>
                <li>✓ Напоминания перед уроком с преподавателем</li>
                <li>✓ Переносы, отмены и пропуски</li>
                <li>✓ Итог урока и проверка ДЗ</li>
                <li>✓ Низкий остаток занятий или сумма к оплате</li>
                <li>× Без курсов, тестов, рейтингов и переписок</li>
              </>
            ) : (
              <>
                <li>✓ Напоминания перед началом урока</li>
                <li>✓ Отчёт по уроку принят</li>
                <li>✓ Домашнее задание принято</li>
                <li>✓ Нужна доработка задания</li>
                <li>✓ Переносы, отмены и новые сообщения</li>
              </>
            )}
          </ul>

          {enabled ? (
            <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <CheckCircle2 size={16} />
              Уведомления включены
            </div>
          ) : permission === "denied" ? (
            <p className="mt-4 text-sm leading-6 text-amber-800">
              {platform?.os === "ios"
                ? `Уведомления запрещены. ${viaToast ? "Разреши" : "Разрешите"} их для Maestro: «Настройки» → «Уведомления» → Maestro.`
                : `Уведомления запрещены в настройках браузера. ${viaToast ? "Разреши" : "Разрешите"} их для сайта Maestro — обычно это в меню ⋮ → «Настройки сайта» → «Уведомления».`}
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
