"use client";

import {
  Bell,
  BookOpenCheck,
  CalendarClock,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Coins,
  MessagesSquare,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { createPortal } from "react-dom";
import { useDialogBehavior } from "@/hooks/use-dialog-behavior";
import { notificationsApi, type UserNotification } from "@/lib/notifications-api";

type NotificationAudience = "student" | "teacher" | "staff" | "parent";

function notificationIcon(item: UserNotification) {
  if (item.type === "direct_message_received") return MessagesSquare;
  if (item.type === "staff_task_assigned") return ClipboardCheck;
  if (
    item.type.includes("lesson_reminder")
    || item.type.includes("schedule")
    || item.type.includes("cancelled")
    || item.type.includes("online_lesson")
  ) return CalendarClock;
  if (item.type.includes("assignment") || item.type.includes("homework")) return BookOpenCheck;
  if (item.type.includes("points") || item.type.includes("coins") || item.type.includes("reward")) return Coins;
  if (item.type.includes("achievement")) return Sparkles;
  return CheckCircle2;
}

function notificationAction(item: UserNotification) {
  if (!item.url) return "Отметить";
  if (item.url.startsWith("/monthly-plan")) return "Открыть план";
  if (item.url.startsWith("/messages") || item.url.includes("/messages")) return "Открыть диалог";
  if (item.url.startsWith("/rewards") || item.url.includes("/rewards")) return "Открыть награды";
  if (item.type === "direct_message_received") return "Открыть диалог";
  if (item.type === "homework_submitted") return "Проверить работу";
  if (item.type === "homework_reviewed") return "Посмотреть результат";
  if (item.type === "homework_assigned" || item.type.includes("assignment")) return "Открыть задание";
  if (item.type.includes("lesson") || item.type.includes("schedule")) return "Открыть урок";
  if (item.type.includes("reward") || item.type.includes("coins")) return "Открыть награды";
  return "Открыть";
}

function notificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const time = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  if (day === today) return `Сегодня, ${time}`;
  if (day === today - 86_400_000) return `Вчера, ${time}`;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function audienceCopy(audience: NotificationAudience) {
  if (audience === "parent") return "События по ученику";
  if (audience === "teacher") return "Рабочие уведомления";
  if (audience === "staff") return "События школы";
  return "Уведомления";
}

function isSafeInternalUrl(value: string) {
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\");
}

function NotificationRow({
  item,
  onOpen,
}: {
  item: UserNotification;
  onOpen: (item: UserNotification) => void;
}) {
  const Icon = notificationIcon(item);
  const unread = !item.readAt;

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={`group grid w-full grid-cols-[40px_minmax(0,1fr)_auto] gap-3 border-b border-stone-200 px-4 py-4 text-left transition-colors last:border-b-0 hover:bg-stone-50 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gold sm:px-5 ${
        unread ? "bg-amber-50/55" : "bg-white"
      }`}
    >
      <span className={`relative grid h-10 w-10 place-items-center rounded-lg ${
        unread ? "bg-amber-100 text-amber-900" : "bg-stone-100 text-stone-500"
      }`}>
        <Icon size={18} />
        {unread ? (
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-gold" />
        ) : null}
      </span>
      <span className="min-w-0">
        <span className={`block text-sm leading-5 text-ink ${unread ? "font-black" : "font-bold"}`}>
          {item.title}
        </span>
        <span className="mt-1 block text-sm leading-5 text-stone-600">{item.body}</span>
        <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <time dateTime={item.createdAt} className="text-xs font-semibold text-stone-400">
            {notificationTime(item.createdAt)}
          </time>
          <span className="text-xs font-bold text-amber-800">{notificationAction(item)}</span>
        </span>
      </span>
      <ChevronRight
        size={17}
        className="mt-1 shrink-0 text-stone-300 transition-transform group-hover:translate-x-0.5 group-hover:text-gold"
      />
    </button>
  );
}

export function NotificationCenter({
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [items, setItems] = useState<UserNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const dialogRef = useDialogBehavior(open, () => setOpen(false));

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setItems(await notificationsApi.list(50));
    } catch {
      setLoadError("Не удалось загрузить уведомления. Проверьте соединение и попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [load, open, unreadCount]);

  const unreadItems = useMemo(() => items.filter((item) => !item.readAt), [items]);
  const readItems = useMemo(() => items.filter((item) => item.readAt), [items]);
  const totalUnread = unreadCount ?? unreadItems.length;

  async function openItem(item: UserNotification) {
    if (!item.readAt) {
      const readAt = new Date().toISOString();
      setItems((current) => current.map((candidate) => (
        candidate.id === item.id ? { ...candidate, readAt } : candidate
      )));
      await notificationsApi.markRead(item.id).catch(() => void load());
      void reloadUnread();
    }
    if (item.url && isSafeInternalUrl(item.url)) {
      setOpen(false);
      router.push(item.url);
    }
  }

  async function markAllRead() {
    if (markingAll) return;
    setMarkingAll(true);
    const readAt = new Date().toISOString();
    setItems((current) => current.map((item) => item.readAt ? item : { ...item, readAt }));
    try {
      await notificationsApi.markAllRead();
      await reloadUnread();
    } catch {
      await load();
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={unreadCount && unreadCount > 0 ? `Уведомления, новых: ${unreadCount}` : "Уведомления"}
        aria-expanded={open}
        className="relative grid h-10 w-10 place-items-center rounded-xl border border-stone-200 bg-white text-stone-600 transition-colors hover:border-gold/30 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold sm:rounded-full"
      >
        <Bell size={16} />
        {unreadCount != null && unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-gold px-1 text-[9px] font-black leading-none text-ink">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open && typeof document !== "undefined" ? createPortal((
        <div className="fixed inset-0 z-[90]">
          <button
            type="button"
            className="absolute inset-0 h-full w-full bg-stone-950/45 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
            aria-label="Закрыть уведомления по фону"
          />
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="notifications-title"
            aria-busy={loading || markingAll}
            className="absolute inset-x-0 bottom-0 flex max-h-[92dvh] min-h-[52dvh] flex-col overflow-hidden rounded-t-xl border border-stone-200 bg-white shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:h-[100dvh] sm:max-h-none sm:min-h-0 sm:w-[440px] sm:rounded-none sm:border-y-0 sm:border-r-0"
          >
            <header className="flex shrink-0 items-start gap-3 border-b border-stone-200 bg-paper px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top,0px))] sm:px-5 sm:py-5">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gold">
                  {audienceCopy(audience)}
                </p>
                <h2 id="notifications-title" className="mt-1 text-xl font-black text-ink">
                  {totalUnread > 0 ? `${totalUnread} новых` : "Всё просмотрено"}
                </h2>
              </div>
              {totalUnread > 0 ? (
                <button
                  type="button"
                  disabled={markingAll}
                  onClick={() => void markAllRead()}
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-xs font-bold text-stone-600 transition-colors hover:bg-stone-100 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold disabled:opacity-50"
                  title="Отметить всё просмотренным"
                >
                  <CheckCheck size={17} />
                  <span className="hidden min-[390px]:inline">Прочитать всё</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setOpen(false)}
                data-dialog-initial-focus="true"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-stone-200 bg-white text-stone-500 transition-colors hover:border-stone-300 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
                aria-label="Закрыть уведомления"
              >
                <X size={18} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto overscroll-contain bg-stone-50 pb-[env(safe-area-inset-bottom,0px)]" aria-live="polite">
              {loading && items.length === 0 ? (
                <div className="grid min-h-52 place-items-center px-6 text-center">
                  <p className="text-sm font-semibold text-stone-500">Загружаем события…</p>
                </div>
              ) : loadError && items.length === 0 ? (
                <div className="grid min-h-64 place-items-center px-6 text-center">
                  <div>
                    <TriangleAlert className="mx-auto text-amber-700" size={30} />
                    <p className="mt-3 font-bold text-ink">Уведомления не загрузились</p>
                    <p className="mt-1 max-w-xs text-sm leading-6 text-stone-500">{loadError}</p>
                    <button
                      type="button"
                      onClick={() => void load()}
                      className="mt-4 min-h-11 rounded-lg bg-ink px-5 text-sm font-bold text-white transition-colors hover:bg-gold hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                    >
                      Попробовать снова
                    </button>
                  </div>
                </div>
              ) : items.length === 0 ? (
                <div className="grid min-h-64 place-items-center px-6 text-center">
                  <div>
                    <CheckCircle2 className="mx-auto text-emerald-600" size={30} />
                    <p className="mt-3 font-bold text-ink">Событий пока нет</p>
                    <p className="mt-1 text-sm text-stone-500">Здесь появятся задания, уроки и сообщения.</p>
                  </div>
                </div>
              ) : (
                <>
                  {loadError ? (
                    <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold leading-5 text-amber-900 sm:px-5">
                      <TriangleAlert className="mt-0.5 shrink-0" size={15} />
                      <span>Не удалось обновить список. Ниже показаны последние загруженные события.</span>
                    </div>
                  ) : null}
                  {unreadItems.length > 0 ? (
                    <section aria-labelledby="new-notifications-title">
                      <h3 id="new-notifications-title" className="border-b border-stone-200 bg-stone-50 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-stone-500 sm:px-5">
                        Новые
                      </h3>
                      {unreadItems.map((item) => <NotificationRow key={item.id} item={item} onOpen={(candidate) => void openItem(candidate)} />)}
                    </section>
                  ) : null}
                  {readItems.length > 0 ? (
                    <section aria-labelledby="read-notifications-title" className={unreadItems.length ? "mt-3" : ""}>
                      <h3 id="read-notifications-title" className="border-y border-stone-200 bg-stone-50 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-stone-500 sm:px-5">
                        Ранее
                      </h3>
                      {readItems.map((item) => <NotificationRow key={item.id} item={item} onOpen={(candidate) => void openItem(candidate)} />)}
                    </section>
                  ) : null}
                  {items.length === 50 ? (
                    <p className="border-t border-stone-200 bg-white px-4 py-3 text-center text-xs font-semibold text-stone-400 sm:px-5">
                      Показаны последние 50 событий
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </section>
        </div>
      ), document.body) : null}
    </>
  );
}

export function TeacherNotificationCenter(props: Omit<ComponentProps<typeof NotificationCenter>, "audience">) {
  return <NotificationCenter {...props} audience="teacher" />;
}
