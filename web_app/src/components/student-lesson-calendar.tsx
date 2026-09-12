"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  MapPin,
  MonitorPlay,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  SchoolOfflineLesson,
  StudentOfflineSummary,
} from "@/types/school-offline";

const focus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2";
const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const schoolZone = "Asia/Aqtobe";

function schoolToday(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: schoolZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// CRM dates are school calendar dates; use UTC only for date arithmetic, never the browser's timezone.
function dateValue(key: string) {
  return new Date(`${key.slice(0, 10)}T12:00:00Z`);
}
function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}
function addDays(key: string, amount: number) {
  const date = dateValue(key);
  date.setUTCDate(date.getUTCDate() + amount);
  return dateKey(date);
}
function weekStart(key: string) {
  return addDays(key, -((dateValue(key).getUTCDay() + 6) % 7));
}
function labelDate(key: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("ru-RU", {
    ...options,
    timeZone: "UTC",
  }).format(dateValue(key));
}
function lessonLabel(lesson: SchoolOfflineLesson) {
  return (
    lesson.topic?.trim() ||
    lesson.groupName?.trim() ||
    ({
      individual: "Индивидуальный урок",
      group: "Групповой урок",
      theory: "Теория",
      trial: "Пробный урок",
    }[lesson.classType || ""] ??
      "Урок музыки")
  );
}

export function StudentLessonCalendar({
  data,
  requestedLessonId,
  onHistory,
}: {
  data: StudentOfflineSummary;
  requestedLessonId?: string | null;
  onHistory: (id: string) => void;
}) {
  const [now, setNow] = useState(() => new Date());
  const [selection, setSelection] = useState<string | null>(null);
  const [monthView, setMonthView] = useState(false);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const today = schoolToday(now);
  const schoolTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: schoolZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  const lessons = useMemo(
    () =>
      [
        ...new Map(
          [...data.lessonHistory, ...data.upcomingLessons].map((lesson) => [
            lesson.crmClassId,
            lesson,
          ]),
        ).values(),
      ].sort((a, b) =>
        `${a.date.slice(0, 10)}${a.startTime}`.localeCompare(
          `${b.date.slice(0, 10)}${b.startTime}`,
        ),
      ),
    [data],
  );
  const nearest = lessons.find(
    (lesson) =>
      ["scheduled", "started"].includes(lesson.status) &&
      `${lesson.date.slice(0, 10)}T${lesson.endTime.slice(0, 5)}` >
        `${today}T${schoolTime}`,
  );
  const requestedLesson = lessons.find(
    (lesson) => lesson.crmClassId === requestedLessonId,
  );
  const selected =
    selection ??
    requestedLesson?.date.slice(0, 10) ??
    nearest?.date.slice(0, 10) ??
    today;
  const monthStart = `${selected.slice(0, 7)}-01`;
  const firstDay = monthView ? weekStart(monthStart) : weekStart(selected);
  const monthEnd = new Date(dateValue(monthStart));
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0);
  const dayCount = monthView
    ? Math.ceil(
        (((dateValue(monthStart).getUTCDay() + 6) % 7) +
          monthEnd.getUTCDate()) /
          7,
      ) * 7
    : 7;
  const days = Array.from({ length: dayCount }, (_, index) =>
    addDays(firstDay, index),
  );
  const selectedLessons = lessons
    .filter((lesson) => lesson.date.slice(0, 10) === selected)
    .sort((a, b) => {
      const stillUpcoming = (lesson: SchoolOfflineLesson) =>
        ["scheduled", "started"].includes(lesson.status) &&
        `${selected}T${lesson.endTime.slice(0, 5)}` > `${today}T${schoolTime}`;
      return (
        Number(stillUpcoming(b)) - Number(stillUpcoming(a)) ||
        a.startTime.localeCompare(b.startTime)
      );
    });
  const markedDates = new Set(
    lessons.map((lesson) => lesson.date.slice(0, 10)),
  );
  function navigate(direction: number) {
    if (!monthView) return setSelection(addDays(selected, direction * 7));
    const nextMonth = dateValue(monthStart);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + direction);
    setSelection(dateKey(nextMonth));
  }
  return (
    <section
      aria-label="Календарь уроков"
      className="min-w-0 rounded-2xl border border-stone-200 bg-white p-4 sm:p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <CalendarDays size={18} className="text-gold" />
          Мои занятия
        </h2>
      </div>
      <div className="mt-1 flex items-center justify-between gap-1">
        <button
          type="button"
          aria-label={monthView ? "Предыдущий месяц" : "Предыдущая неделя"}
          onClick={() => navigate(-1)}
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-stone-100 ${focus}`}
        >
          <ChevronLeft size={18} />
        </button>
        <button
          type="button"
          aria-expanded={monthView}
          aria-label={monthView ? "Показать неделю" : "Показать месяц"}
          onClick={() => setMonthView((value) => !value)}
          className={`min-h-11 rounded-lg px-2 text-center text-sm font-semibold capitalize ${focus}`}
        >
          {labelDate(selected, { month: "long", year: "numeric" })}
          <span className="ml-2 text-xs font-normal normal-case text-stone-500">
            {monthView ? "Свернуть" : "Месяц"}
          </span>
        </button>
        <button
          type="button"
          aria-label={monthView ? "Следующий месяц" : "Следующая неделя"}
          onClick={() => navigate(1)}
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-stone-100 ${focus}`}
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1 text-center">
        {weekdays.map((day) => (
          <span key={day} className="py-1 text-xs text-stone-500">
            {day}
          </span>
        ))}
        {days.map((day) => {
          const dayLessons = lessons.filter(
            (lesson) => lesson.date.slice(0, 10) === day,
          );
          return (
            <button
              key={day}
              type="button"
              aria-pressed={selected === day}
              aria-current={day === today ? "date" : undefined}
              aria-label={`${labelDate(day, { day: "numeric", month: "long", year: "numeric" })}, занятий: ${dayLessons.length}`}
              onClick={() => setSelection(day)}
              className={`relative flex min-h-11 min-w-0 flex-col items-center justify-center rounded-lg py-1.5 text-sm font-semibold tabular-nums ${focus} ${selected === day ? "bg-ink text-white" : day === today ? "bg-amber-50 ring-1 ring-inset ring-gold text-ink" : "hover:bg-stone-100"} ${monthView && day.slice(0, 7) !== selected.slice(0, 7) ? "text-stone-400" : ""}`}
            >
              {Number(day.slice(8))}
              <span
                aria-hidden="true"
                className={`mt-1 h-1 w-1 rounded-full ${markedDates.has(day) ? (selected === day ? "bg-gold" : "bg-amber-600") : "bg-transparent"}`}
              />
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 text-xs text-stone-500">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-amber-600"
          />
          Есть занятие
        </span>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setSelection(today)}
            className={`min-h-9 rounded font-medium hover:text-ink ${focus}`}
          >
            Сегодня
          </button>
          {nearest && selected !== nearest.date.slice(0, 10) ? (
            <button
              type="button"
              onClick={() => setSelection(nearest.date.slice(0, 10))}
              className={`min-h-9 rounded font-medium text-amber-800 ${focus}`}
            >
              Ближайший урок
            </button>
          ) : null}
        </div>
      </div>
      <div
        className="mt-2 border-t border-stone-100 pt-3"
        aria-live="polite"
        aria-atomic="true"
      >
        <h3 className="mb-2 text-xs font-semibold capitalize text-stone-500">
          {selected === today
            ? "Сегодня · "
            : selected === addDays(today, 1)
              ? "Завтра · "
              : ""}
          {labelDate(selected, {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </h3>
        {selectedLessons.length ? (
          <div className="space-y-2">
            {selectedLessons
              .slice(0, expandedDay === selected ? undefined : 1)
              .map((lesson) => (
                <article
                  key={lesson.crmClassId}
                  className="rounded-xl bg-stone-50 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-lg font-bold tabular-nums">
                      {lesson.startTime.slice(0, 5)}–
                      {lesson.endTime.slice(0, 5)}
                    </p>
                    <span
                      className={`text-xs font-medium ${lesson.status === "cancelled" ? "text-red-700" : "text-stone-500"}`}
                    >
                      {(
                        {
                          started: "Идёт сейчас",
                          completed: "Проведён",
                          cancelled: "Отменён",
                          pending_admin_review: "Итоги готовятся",
                          not_filled: "Итоги готовятся",
                        } as Record<string, string>
                      )[lesson.status] ||
                        (lesson.deliveryFormat === "online"
                          ? "Онлайн"
                          : "В школе")}
                    </span>
                  </div>
                  <p className="mt-1 break-words text-sm font-semibold">
                    {lessonLabel(lesson)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs leading-5 text-stone-600">
                    {lesson.teacherName ? (
                      <span className="inline-flex min-w-0 items-start gap-1.5">
                        <UserRound size={14} className="mt-0.5 shrink-0" />
                        <span className="break-words">
                          {lesson.teacherName}
                        </span>
                      </span>
                    ) : null}
                    {lesson.deliveryFormat !== "online" && lesson.roomName ? (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin size={14} />
                        {lesson.roomName}
                      </span>
                    ) : null}
                  </div>
                  {data.lessonHistory.some(
                    (item) => item.crmClassId === lesson.crmClassId,
                  ) ? (
                    <button
                      type="button"
                      onClick={() => onHistory(lesson.crmClassId)}
                      className={`mt-2 min-h-11 rounded-lg text-sm font-semibold text-amber-900 ${focus}`}
                    >
                      Итоги урока →
                    </button>
                  ) : null}
                  {lesson.deliveryFormat === "online" &&
                  ["scheduled", "started"].includes(lesson.status) ? (
                    lesson.meetingUrl &&
                    /^https?:\/\//i.test(lesson.meetingUrl) ? (
                      <a
                        href={lesson.meetingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={`mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-ink px-3 text-sm font-semibold text-white ${focus}`}
                      >
                        <MonitorPlay size={16} />
                        Подключиться
                      </a>
                    ) : (
                      <p className="mt-2 text-xs text-stone-500">
                        Ссылка на занятие появится здесь.
                      </p>
                    )
                  ) : null}
                </article>
              ))}
            {selectedLessons.length > 1 ? (
              <button
                type="button"
                aria-expanded={expandedDay === selected}
                onClick={() =>
                  setExpandedDay(expandedDay === selected ? null : selected)
                }
                className={`min-h-11 w-full rounded-lg text-sm font-semibold text-stone-600 hover:bg-stone-50 ${focus}`}
              >
                {expandedDay === selected
                  ? "Свернуть занятия"
                  : `Ещё занятий в этот день: ${selectedLessons.length - 1}`}
              </button>
            ) : null}
          </div>
        ) : (
          <p className="py-3 text-sm text-stone-500">
            На этот день занятий нет.
          </p>
        )}
      </div>
    </section>
  );
}
