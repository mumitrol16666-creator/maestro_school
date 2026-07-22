"use client";

import { Bell, BookOpenCheck, CalendarClock, CheckCircle2, ChevronRight, ClipboardCheck, Coins, MessagesSquare, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import { notificationsApi, type UserNotification } from "@/lib/notifications-api";

function seenKey(userId: string, notificationId: string) {
  return `maestro_notification_alert:${userId}:${notificationId}`;
}

type NotificationAudience = "student" | "teacher" | "staff";

export function NotificationCenter({
  userId,
  unreadCount,
  reloadUnread,
  audience,
}: {
  userId: string;
  unreadCount: number | null;
  reloadUnread: () => Promise<void>;
  audience: NotificationAudience;
}) {
  const router = useRouter();
  const [items, setItems] = useState<UserNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const notifications = await notificationsApi.list(20);
      setItems(notifications);
      const newestUnread = notifications.find((item) => !item.readAt);
      if (
        newestUnread
        && !window.sessionStorage.getItem(seenKey(userId, newestUnread.id))
      ) {
        window.sessionStorage.setItem(seenKey(userId, newestUnread.id), "1");
        setOpen(true);
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (unreadCount == null) return;
    void load();
  }, [load, unreadCount]);

  async function openItem(item: UserNotification) {
    if (!item.readAt) {
      await notificationsApi.markRead(item.id).catch(() => undefined);
      await reloadUnread();
    }
    setOpen(false);
    if (item.url) router.push(item.url);
  }

  async function markAllRead() {
    await notificationsApi.markAllRead();
    setItems((current) => current.map((item) => (
      item.readAt ? item : { ...item, readAt: new Date().toISOString() }
    )));
    await reloadUnread();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          void load();
        }}
        aria-label="Уведомления"
        className="relative grid h-10 w-10 place-items-center rounded-xl border border-stone-200 bg-white text-stone-600 transition hover:border-gold/30 hover:text-ink sm:rounded-full"
      >
        <Bell size={16} />
        {unreadCount != null && unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-gold px-1 text-[9px] font-black leading-none text-ink">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open && typeof document !== "undefined" ? createPortal((
        <div className="fixed inset-0 z-[90] grid min-h-[100dvh] place-items-center bg-stone-950/45 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="teacher-notifications-title"
            className="w-full max-w-xl overflow-hidden rounded-[28px] border border-white/70 bg-paper shadow-2xl"
          >
            <div className="relative bg-ink px-6 py-6 text-white sm:px-8">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/20 hover:text-white"
                aria-label="Закрыть"
              >
                <X size={18} />
              </button>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">
                {audience === "student" ? "Важное для вас" : "Рабочие события"}
              </p>
              <h2 id="teacher-notifications-title" className="font-display mt-2 pr-10 text-3xl">
                {audience === "student" ? "Ваши уведомления" : "Новое в вашем кабинете"}
              </h2>
              <p className="mt-2 text-sm text-white/60">
                {audience === "student"
                  ? "Сообщения, уроки, задания и результаты проверки в одном месте."
                  : "Сообщения, отчёты и изменения по назначенным урокам в одном месте."}
              </p>
            </div>

            <div className="max-h-[60vh] space-y-3 overflow-y-auto p-5 sm:p-6">
              {loading && items.length === 0 ? (
                <p className="py-8 text-center text-sm text-stone-500">Загружаем события...</p>
              ) : items.length === 0 ? (
                <div className="py-8 text-center">
                  <CheckCircle2 className="mx-auto text-emerald-600" size={30} />
                  <p className="mt-3 font-bold text-ink">Новых событий нет</p>
                  <p className="mt-1 text-sm text-stone-500">Все изменения уже просмотрены.</p>
                </div>
              ) : items.map((item) => {
                const ItemIcon = item.type === "direct_message_received"
                  ? MessagesSquare
                  : item.type === "staff_task_assigned"
                    ? ClipboardCheck
                  : item.type.includes("online_lesson")
                    ? CalendarClock
                    : item.type.includes("assignment") || item.type.includes("homework")
                      ? BookOpenCheck
                      : item.type.includes("points") || item.type.includes("coins")
                        ? Coins
                        : item.type.includes("achievement")
                          ? Sparkles
                          : CheckCircle2;
                return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void openItem(item)}
                  className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition hover:border-gold/40 ${
                    item.readAt ? "border-stone-200 bg-white/60" : "border-amber-200 bg-amber-50/70"
                  }`}
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
                    <ItemIcon size={20} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-ink">{item.title}</span>
                    <span className="mt-1 block text-sm leading-5 text-stone-500">{item.body}</span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-stone-300" />
                </button>
                );
              })}
            </div>

            {items.some((item) => !item.readAt) ? (
              <div className="border-t border-stone-100 px-6 py-4 text-center">
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  className="text-sm font-bold text-stone-500 hover:text-ink"
                >
                  Отметить всё просмотренным
                </button>
              </div>
            ) : null}
          </section>
        </div>
      ), document.body) : null}
    </>
  );
}

export function TeacherNotificationCenter(props: Omit<ComponentProps<typeof NotificationCenter>, "audience">) {
  return <NotificationCenter {...props} audience="teacher" />;
}
