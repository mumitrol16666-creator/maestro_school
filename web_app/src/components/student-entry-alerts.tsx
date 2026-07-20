"use client";

import { BookOpen, CalendarDays, ChevronRight, MessagesSquare, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { SchoolAlertCounts } from "@/lib/student-school-alerts";

function sessionKey(userId: string) {
  const now = new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  return `maestro_entry_alerts:${userId}:${today}`;
}

export function StudentEntryAlerts({
  userId,
  counts,
  onlineUnread,
  messagesUnread,
}: {
  userId: string;
  counts: SchoolAlertCounts;
  onlineUnread: number;
  messagesUnread: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const total = counts.totalUnread + counts.todayLessons + counts.tomorrowLessons + onlineUnread + messagesUnread;

  useEffect(() => {
    if (total <= 0 || window.sessionStorage.getItem(sessionKey(userId))) return;
    const timer = window.setTimeout(() => setOpen(true), 450);
    return () => window.clearTimeout(timer);
  }, [total, userId]);

  const items = useMemo(() => [
    counts.todayLessons > 0
      ? {
          icon: CalendarDays,
          title: counts.todayLessons === 1 ? "Сегодня у вас урок" : `Сегодня уроков: ${counts.todayLessons}`,
          text: "Откройте расписание, чтобы проверить время и кабинет.",
          href: "/school-lessons?tab=schedule",
        }
      : null,
    counts.tomorrowLessons > 0
      ? {
          icon: CalendarDays,
          title: counts.tomorrowLessons === 1 ? "Завтра у вас урок" : `Завтра уроков: ${counts.tomorrowLessons}`,
          text: "Расписание уже доступно в разделе школы.",
          href: "/school-lessons?tab=schedule",
        }
      : null,
    counts.homework > 0
      ? {
          icon: BookOpen,
          title: `Новых домашних заданий: ${counts.homework}`,
          text: "Преподаватель добавил задания после проведённых уроков.",
          href: "/school-lessons?tab=homework",
        }
      : null,
    counts.reports > 0
      ? {
          icon: Sparkles,
          title: `Новых итогов урока: ${counts.reports}`,
          text: "Посмотрите тему, результат занятия и рекомендации преподавателя.",
          href: "/school-lessons?tab=history",
        }
      : null,
    onlineUnread > 0
      ? {
          icon: BookOpen,
          title: `Новых уведомлений: ${onlineUnread}`,
          text: "Есть обновления по онлайн-урокам.",
          href: "/online-lessons",
        }
      : null,
    messagesUnread > 0
      ? {
          icon: MessagesSquare,
          title: messagesUnread === 1 ? "Новое сообщение" : `Новых сообщений: ${messagesUnread}`,
          text: "Преподаватель ответил на ваше обращение.",
          href: "/messages",
        }
      : null,
  ].filter(Boolean), [counts, messagesUnread, onlineUnread]);

  if (!open || items.length === 0) return null;

  function close() {
    window.sessionStorage.setItem(sessionKey(userId), "1");
    setOpen(false);
  }

  function openItem(href: string) {
    close();
    router.push(href);
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-stone-950/45 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-alerts-title"
        className="w-full max-w-xl overflow-hidden rounded-[30px] border border-white/70 bg-paper shadow-2xl"
      >
        <div className="relative bg-ink px-6 py-7 text-white sm:px-8">
          <button
            type="button"
            onClick={close}
            className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/20 hover:text-white"
            aria-label="Закрыть"
          >
            <X size={18} />
          </button>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold">Важное для вас</p>
          <h2 id="student-alerts-title" className="font-display mt-2 pr-10 text-3xl sm:text-4xl">
            Пока вас не было
          </h2>
          <p className="mt-2 text-sm text-white/60">Собрали новые задания и ближайшие занятия в одном месте.</p>
        </div>

        <div className="space-y-3 p-5 sm:p-6">
          {items.map((item) => {
            const Icon = item!.icon;
            return (
              <button
                key={`${item!.href}-${item!.title}`}
                type="button"
                onClick={() => openItem(item!.href)}
                className="flex w-full items-center gap-4 rounded-2xl border border-stone-200 bg-white p-4 text-left transition hover:border-gold/40 hover:shadow-soft"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-50 text-gold">
                  <Icon size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-ink">{item!.title}</span>
                  <span className="mt-1 block text-sm leading-5 text-stone-500">{item!.text}</span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-stone-300" />
              </button>
            );
          })}
        </div>

        <div className="border-t border-stone-100 px-6 py-4 text-center">
          <button type="button" onClick={close} className="text-sm font-bold text-stone-500 hover:text-ink">
            Посмотреть позже
          </button>
        </div>
      </section>
    </div>
  );
}
