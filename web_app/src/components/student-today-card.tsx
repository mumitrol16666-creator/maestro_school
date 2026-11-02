"use client";

import { ArrowRight, CalendarDays, Flame, MonitorPlay, School } from "lucide-react";
import Link from "next/link";
import { PracticeCheckin } from "@/components/practice-checkin";
import type { ApiStudentHome } from "@/types/api";

/**
 * Plan 5.1: the first thing the student sees — the nearest lesson and what to do before it. One
 * button. Spoken to a child: no statuses, no counters that mean nothing.
 */
const dateLabel = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Aqtobe" });

function when(lesson: NonNullable<ApiStudentHome["today"]["nextLesson"]>) {
  if (lesson.isToday) return `Сегодня в ${lesson.startTime}`;
  if (lesson.isTomorrow) return `Завтра в ${lesson.startTime}`;
  const label = dateLabel.format(new Date(lesson.date));
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} в ${lesson.startTime}`;
}

export function StudentTodayCard({ today, streakWeeks, practice = null, scheduleUnavailable = false }: { today: ApiStudentHome["today"]; streakWeeks: number | null; practice?: ApiStudentHome["practice"]; scheduleUnavailable?: boolean }) {
  const lesson = today.nextLesson;
  const [first, ...rest] = today.tasks;
  const LessonIcon = lesson?.deliveryFormat === "online" ? MonitorPlay : School;
  const cta = first
    ? { href: first.target.href ?? "/tasks", label: first.status === "needs_revision" ? "Доработать задание" : "Открыть задание" }
    : lesson
      ? { href: "/school-lessons?tab=schedule", label: "Открыть расписание" }
      : { href: "/learning", label: "Открыть обучение" };

  return (
    <section className="rounded-[24px] border border-white/10 bg-charcoal p-5 text-white shadow-soft sm:p-6" data-testid="student-today">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gold-ink sm:text-xs">Сегодня</p>
        {streakWeeks ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-orange-400/20 px-2 py-0.5 text-[11px] font-black text-orange-100" data-testid="today-streak">
            <Flame size={12} /> {streakWeeks} нед. подряд
          </span>
        ) : null}
      </div>

      {lesson ? (
        <div className="mt-3 flex items-start gap-3" data-testid="today-lesson">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-gold-ink"><LessonIcon size={20} /></span>
          <div className="min-w-0">
            <h2 className="font-display text-2xl leading-tight sm:text-[28px]">{when(lesson)}</h2>
            <p className="mt-1 text-sm text-white/70">
              {lesson.title}{lesson.teacherName ? ` · ${lesson.teacherName}` : ""}{lesson.roomName ? ` · ${lesson.roomName}` : ""}
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-start gap-3" data-testid="today-lesson">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-gold-ink"><CalendarDays size={20} /></span>
          <div>
            {/* В-18: CRM is down with no server copy, so an empty schedule says nothing about lessons. */}
            <h2 className="font-display text-2xl leading-tight sm:text-[28px]">{scheduleUnavailable ? "Расписание не загрузилось" : "Ближайший урок пока не назначен"}</h2>
            <p className="mt-1 text-sm text-white/70">{scheduleUnavailable ? "Школа сейчас не отвечает. Ближайший урок появится здесь, когда связь вернётся." : "Как только школа поставит урок, он появится здесь."}</p>
          </div>
        </div>
      )}

      <div className="mt-4 rounded-2xl bg-white/[0.06] p-4" data-testid="today-tasks">
        {first ? (
          <>
            <p className="text-[11px] font-black uppercase tracking-wider text-white/50">{lesson ? "К уроку" : "Задание"}</p>
            <p className="mt-1 break-words text-base font-bold">{first.title}</p>
            {first.descriptionPreview ? <p className="mt-1 line-clamp-2 text-sm text-white/70">{first.descriptionPreview}</p> : null}
            {rest.length || today.tasksTotal > today.tasks.length ? (
              <p className="mt-2 text-xs text-white/60">
                Ещё {today.tasksTotal - 1}: {rest.map((task) => task.title).join(", ")}{today.tasksTotal > today.tasks.length ? "…" : ""}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm font-semibold text-white/80">
            {lesson ? "Заданий к уроку нет — просто приходи с инструментом." : "Заданий нет. Свободен, но гитара ждёт."}
          </p>
        )}
      </div>

      <Link href={cta.href} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gold px-4 text-sm font-black text-ink transition hover:bg-amber-400 sm:w-auto" data-testid="today-cta">
        {cta.label} <ArrowRight size={17} />
      </Link>
      <PracticeCheckin practice={practice} />
    </section>
  );
}
