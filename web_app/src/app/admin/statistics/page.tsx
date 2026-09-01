"use client";

import {
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  LogIn,
  Search,
  UsersRound,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { StatisticsSectionTabs } from "@/components/statistics-section-tabs";
import { useApiResource } from "@/hooks/use-api-resource";
import { appStatisticsApi } from "@/lib/app-statistics-api";
import type { AppStatisticsStudentMetrics } from "@/types/app-statistics";

const sectionLabels: Record<string, string> = {
  dashboard: "Главная",
  learning: "Обучение",
  homework: "Домашние задания",
  monthly_plan: "План месяца",
  courses: "Курсы",
  tests: "Тесты",
  schedule: "Расписание",
  league: "Недельная лига",
  messages: "Сообщения",
  shop: "Магазин",
  news: "Новости",
  profile: "Профиль",
  account: "Вход",
  other: "Другие экраны",
};

function monthKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Aqtobe",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? String(date.getFullYear());
  const month = parts.find((part) => part.type === "month")?.value ?? String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function shiftMonth(key: string, amount: number) {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatMonth(key: string, style: "long" | "short" = "long") {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("ru-RU", { month: style, year: "numeric" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "Ещё не заходил";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Дата неизвестна";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function changeLabel(current: number, previous: number) {
  const delta = current - previous;
  if (!delta) return "без изменений";
  return `${delta > 0 ? "+" : ""}${delta} к прошлому месяцу`;
}

export default function AppStatisticsPage() {
  const [month, setMonth] = useState(monthKey);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search.trim());
  const monthOptions = useMemo(
    () => Array.from({ length: 18 }, (_, index) => shiftMonth(monthKey(), -index)),
    [],
  );
  const resource = useApiResource(
    () => appStatisticsApi.get({ month, search: deferredSearch, page, limit: 20 }),
    [month, deferredSearch, page],
  );

  useEffect(() => {
    setPage(1);
    setExpandedStudentId(null);
  }, [month, deferredSearch]);

  if (resource.loading && !resource.data) return <LoadingState label="Собираем статистику приложения" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data) return null;

  const data = resource.data;
  const maxActivity = Math.max(1, ...data.series.map((item) => item.activeStudents));

  return (
    <>
      <PageHeader
        eyebrow="Работа приложения"
        title="Статистика"
        description="Входы учеников, работа с заданиями и использование основных разделов."
        action={(
          <label className="block min-w-56 text-xs font-black text-stone-500">
            Месяц
            <select
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="mt-2 min-h-12 w-full rounded-xl border border-stone-200 bg-white px-4 text-sm font-bold text-ink outline-none focus:border-gold"
            >
              {monthOptions.map((option) => (
                <option key={option} value={option}>{formatMonth(option)}</option>
              ))}
            </select>
          </label>
        )}
      />

      <StatisticsSectionTabs />

      <section className="mb-7 border-y border-amber-200 bg-amber-50/70 px-4 py-4 text-sm leading-6 text-amber-950 sm:px-5">
        <strong>Как читать данные.</strong>{" "}
        {data.period.trackingStartedAt
          ? `Входы и просмотры считаются с ${formatDateTime(data.period.trackingStartedAt)}.`
          : "Сбор входов и просмотров начнётся после первого входа ученика."}{" "}
        История сданных ДЗ и пройденных тестов доступна и за прошлые месяцы.
      </section>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <SummaryMetric icon={UsersRound} label="Активных учеников" current={data.summary.current.activeStudents} previous={data.summary.previous.activeStudents} />
        <SummaryMetric icon={LogIn} label="Входов" current={data.summary.current.logins} previous={data.summary.previous.logins} />
        <SummaryMetric icon={Clock3} label="Сессий" current={data.summary.current.sessions} previous={data.summary.previous.sessions} />
        <SummaryMetric icon={Eye} label="Открыто экранов ДЗ" current={data.summary.current.homeworkViews} previous={data.summary.previous.homeworkViews} />
        <SummaryMetric icon={BookOpenCheck} label="Сдано ДЗ" current={data.summary.current.homeworkSubmissions} previous={data.summary.previous.homeworkSubmissions} />
        <SummaryMetric icon={CheckCircle2} label="Пройдено тестов" current={data.summary.current.testsCompleted} previous={data.summary.previous.testsCompleted} />
      </section>

      <section className="mt-9 border-y border-stone-200 py-6">
        <div className="flex items-center gap-3">
          <BarChart3 size={20} className="text-gold" />
          <div>
            <h2 className="font-display text-2xl">Динамика за полгода</h2>
            <p className="mt-1 text-xs text-stone-500">Активные ученики, сданные задания и завершённые тесты.</p>
          </div>
        </div>
        <div className="mt-6 grid auto-cols-[155px] grid-flow-col gap-4 overflow-x-auto pb-2 sm:auto-cols-auto sm:grid-flow-row sm:grid-cols-2 sm:gap-5 xl:grid-cols-6">
          {data.series.map((item) => (
            <div key={item.month} className="min-w-0">
              <div className="flex h-28 items-end rounded-md bg-stone-100 px-3 pt-3">
                <div
                  className="w-full rounded-t bg-gold transition-[height]"
                  style={{ height: `${Math.max(6, Math.round((item.activeStudents / maxActivity) * 100))}%` }}
                />
              </div>
              <p className="mt-2 text-sm font-black capitalize text-ink">{formatMonth(item.month, "short")}</p>
              <p className="mt-1 text-xs text-stone-500">{item.activeStudents} активных</p>
              <p className="text-xs text-stone-500">{item.homeworkSubmissions} ДЗ · {item.testsCompleted} тестов</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-9">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-gold">По ученикам</p>
            <h2 className="font-display mt-2 text-3xl">Активность и обучение</h2>
            <p className="mt-2 text-sm text-stone-500">{data.students.total} учеников в приложении.</p>
          </div>
          <label className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 sm:w-80">
            <Search size={17} className="text-stone-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Найти ученика"
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
        </div>

        <div className="mt-6 divide-y divide-stone-200 border-y border-stone-200">
          {data.students.items.length ? data.students.items.map((student) => {
            const expanded = expandedStudentId === student.id;
            return (
              <article key={student.id}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setExpandedStudentId(expanded ? null : student.id)}
                  className="grid w-full grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 py-4 text-left transition hover:bg-white/60 sm:px-3"
                >
                  <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-lg bg-stone-100 text-sm font-black text-stone-500">
                    {student.avatar ? <img src={student.avatar} alt="" className="h-full w-full object-cover" /> : student.displayName.slice(0, 1)}
                  </span>
                  <span className="min-w-0">
                    <strong className="block truncate text-sm text-ink sm:text-base">{student.displayName}</strong>
                    <span className="mt-1 block text-xs text-stone-500">Последняя активность: {formatDateTime(student.lastActiveAt)}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="hidden text-right sm:block">
                      <strong className="block text-sm">{student.current.activeDays} дн.</strong>
                      <span className="text-[11px] text-stone-500">активности</span>
                    </span>
                    <ChevronDown size={18} className={`text-stone-400 transition ${expanded ? "rotate-180" : ""}`} />
                  </span>
                </button>

                {expanded ? (
                  <div className="border-t border-stone-100 bg-white/55 px-4 py-5 sm:px-6">
                    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.6fr)]">
                      <div>
                        <h3 className="text-sm font-black text-ink">Этот месяц и прошлый</h3>
                        <StudentComparison current={student.current} previous={student.previous} />
                        <h3 className="mt-6 text-sm font-black text-ink">Чаще открывает</h3>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {student.sections.length ? student.sections.slice(0, 6).map((section) => (
                            <span key={section.section} className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-bold text-stone-600">
                              {sectionLabels[section.section] ?? "Другой раздел"} · {section.views}
                            </span>
                          )) : <p className="text-sm text-stone-500">В этом месяце просмотров пока нет.</p>}
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-ink">Последние действия</h3>
                        <div className="mt-3 divide-y divide-stone-100">
                          {student.recentEvents.length ? student.recentEvents.map((event) => (
                            <div key={event.id} className="py-2.5">
                              <p className="text-xs font-bold text-ink">{eventLabel(event.eventType, event.section)}</p>
                              <p className="mt-1 text-[11px] text-stone-500">{formatDateTime(event.occurredAt)}</p>
                            </div>
                          )) : <p className="text-sm text-stone-500">Действий пока нет.</p>}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          }) : (
            <p className="py-10 text-center text-sm text-stone-500">По вашему запросу ученики не найдены.</p>
          )}
        </div>

        {data.students.pages > 1 ? (
          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              className="grid h-11 w-11 place-items-center rounded-xl border border-stone-200 bg-white disabled:opacity-40"
              aria-label="Предыдущая страница"
            ><ChevronLeft size={18} /></button>
            <p className="text-xs font-bold text-stone-500">Страница {data.students.page} из {data.students.pages}</p>
            <button
              type="button"
              disabled={page >= data.students.pages}
              onClick={() => setPage((value) => Math.min(data.students.pages, value + 1))}
              className="grid h-11 w-11 place-items-center rounded-xl border border-stone-200 bg-white disabled:opacity-40"
              aria-label="Следующая страница"
            ><ChevronRight size={18} /></button>
          </div>
        ) : null}
      </section>
    </>
  );
}

function SummaryMetric({
  icon: Icon,
  label,
  current,
  previous,
}: {
  icon: typeof UsersRound;
  label: string;
  current: number;
  previous: number;
}) {
  return (
    <article className="min-h-36 rounded-lg border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
      <Icon size={19} className="text-gold" />
      <p className="font-display mt-4 text-3xl">{current}</p>
      <p className="mt-1 text-xs font-black text-ink">{label}</p>
      <p className="mt-2 text-[11px] text-stone-500">{changeLabel(current, previous)}</p>
    </article>
  );
}

function StudentComparison({
  current,
  previous,
}: {
  current: AppStatisticsStudentMetrics;
  previous: AppStatisticsStudentMetrics;
}) {
  const rows: Array<[string, keyof AppStatisticsStudentMetrics]> = [
    ["Активных дней", "activeDays"],
    ["Входов", "logins"],
    ["Открыто ДЗ", "homeworkViews"],
    ["Сдано ДЗ", "homeworkSubmissions"],
    ["Пройдено тестов", "testsCompleted"],
  ];
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[420px] text-left text-xs">
        <thead className="text-stone-400">
          <tr><th className="pb-2 font-bold">Показатель</th><th className="pb-2 font-bold">Сейчас</th><th className="pb-2 font-bold">Прошлый месяц</th></tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {rows.map(([label, key]) => (
            <tr key={key}><td className="py-2.5 font-semibold text-stone-600">{label}</td><td className="py-2.5 font-black text-ink">{current[key]}</td><td className="py-2.5 text-stone-500">{previous[key]}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function eventLabel(eventType: string, section: string) {
  if (eventType === "login") return "Вошёл в приложение";
  if (eventType === "session_started") return "Открыл приложение";
  return `Открыл раздел «${sectionLabels[section] ?? "Другой раздел"}»`;
}
