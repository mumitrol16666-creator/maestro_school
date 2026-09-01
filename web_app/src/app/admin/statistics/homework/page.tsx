"use client";

import {
  BookOpenCheck,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ListChecks,
  RotateCcw,
  Search,
  Send,
  UserRoundX,
  UsersRound,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { StatisticsSectionTabs } from "@/components/statistics-section-tabs";
import { useApiResource } from "@/hooks/use-api-resource";
import { homeworkStatisticsApi } from "@/lib/homework-statistics-api";
import { aqtobeMonthKey, formatMonthKey, recentMonthKeys } from "@/lib/school-month";
import type {
  HomeworkStatisticsMetrics,
  HomeworkStatisticsStudent,
} from "@/types/homework-statistics";

export default function HomeworkStatisticsPage() {
  const [month, setMonth] = useState(aqtobeMonthKey);
  const [directionId, setDirectionId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search.trim());
  const monthOptions = useMemo(() => recentMonthKeys(), []);
  const resource = useApiResource(
    () => homeworkStatisticsApi.admin({
      month,
      directionId: directionId || undefined,
      search: deferredSearch || undefined,
      page,
      limit: 20,
    }),
    [month, directionId, deferredSearch, page],
  );

  useEffect(() => {
    setPage(1);
    setExpandedStudentId(null);
  }, [month, directionId, deferredSearch]);

  if (resource.loading && !resource.data) return <LoadingState label="Собираем статистику домашних заданий" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data) return null;

  const data = resource.data;
  const totals = data.totals;

  return (
    <>
      <PageHeader
        eyebrow="Работа приложения"
        title="Статистика"
        description="Результаты домашних заданий без повторного счёта версий и попыток."
        action={(
          <label className="block min-w-56 text-xs font-black text-stone-500">
            Месяц назначения
            <select
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="mt-2 min-h-12 w-full rounded-xl border border-stone-200 bg-white px-4 text-sm font-bold text-ink outline-none focus:border-gold"
            >
              {monthOptions.map((option) => (
                <option key={option} value={option}>{formatMonthKey(option)}</option>
              ))}
            </select>
          </label>
        )}
      />

      <StatisticsSectionTabs />

      <section className="mb-7 border-y border-amber-200 bg-amber-50/70 px-4 py-4 text-sm leading-6 text-amber-950 sm:px-5">
        Здесь учитываются задания, <strong>назначенные в выбранном месяце</strong>. Каждое задание ученика считается один раз, даже если ответ обновлялся несколько раз.
      </section>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-3" aria-label="Сводка по домашним заданиям">
        <SummaryMetric icon={ListChecks} label="Назначено" value={totals.assigned} />
        <SummaryMetric icon={Send} label="Отправлено" value={totals.submitted} />
        <SummaryMetric icon={CheckCircle2} label="Освоено" value={totals.accepted} tone="text-emerald-700" />
        <SummaryMetric icon={Clock3} label="Ждут проверки" value={totals.waitingReview} tone="text-blue-700" />
        <SummaryMetric icon={RotateCcw} label="На доработке" value={totals.revision} tone="text-red-700" />
        <SummaryMetric icon={UserRoundX} label="Без ответа" value={totals.noAttempt} tone="text-amber-800" />
      </section>

      <section className="mt-8 grid divide-y divide-stone-200 border-y border-stone-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <QualityMetric label="Отправили ответ" value={percent(totals.submissionRate)} note={`${totals.submitted} из ${totals.assigned}`} />
        <QualityMetric label="Освоили с первой проверки" value={percent(totals.firstPassRate)} note={`${totals.acceptedFirstPass} из ${totals.accepted}`} />
        <QualityMetric label="Проверок до освоения" value={numberOrDash(totals.averageCycles)} note="в среднем на принятое ДЗ" />
      </section>

      <section className="mt-9 grid gap-8 xl:grid-cols-2">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <BookOpenCheck size={19} className="text-gold" />
            <div>
              <h2 className="font-display text-2xl">По направлениям</h2>
              <p className="mt-1 text-xs text-stone-500">Можно выбрать направление и раскрыть состав ниже.</p>
            </div>
          </div>
          <div className="mt-4 divide-y divide-stone-200 border-y border-stone-200">
            {data.directions.length ? data.directions.map((direction) => (
              <button
                key={direction.id}
                type="button"
                onClick={() => setDirectionId(directionId === direction.id ? "" : direction.id)}
                className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-2 py-4 text-left transition hover:bg-white/60 ${
                  directionId === direction.id ? "bg-amber-50/70" : ""
                }`}
              >
                <span className="min-w-0">
                  <strong className="block truncate text-sm text-ink">{direction.title}</strong>
                  <span className="mt-1 block text-xs text-stone-500">{direction.metrics.accepted} освоено · {direction.metrics.waitingReview} ждут проверки</span>
                </span>
                <span className="text-right">
                  <strong className="block text-sm text-ink">{direction.metrics.submitted}/{direction.metrics.assigned}</strong>
                  <span className="text-[10px] text-stone-400">отправлено</span>
                </span>
              </button>
            )) : <EmptyLine text="За этот месяц заданий пока нет." />}
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <UsersRound size={19} className="text-gold" />
            <div>
              <h2 className="font-display text-2xl">Групповые задания</h2>
              <p className="mt-1 text-xs text-stone-500">Одно общее ДЗ учитывается отдельно для каждого участника.</p>
            </div>
          </div>
          <div className="mt-4 divide-y divide-stone-200 border-y border-stone-200">
            {data.groups.length ? data.groups.map((group) => (
              <div key={group.crmGroupId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-2 py-4">
                <span className="min-w-0">
                  <strong className="block truncate text-sm text-ink">{group.name}</strong>
                  <span className="mt-1 block truncate text-xs text-stone-500">{group.directions.map((item) => item.title).join(", ")}</span>
                </span>
                <span className="text-right">
                  <strong className="block text-sm text-ink">{group.metrics.accepted}/{group.metrics.assigned}</strong>
                  <span className="text-[10px] text-stone-400">освоено</span>
                </span>
              </div>
            )) : <EmptyLine text="Групповых заданий за этот период нет." />}
          </div>
        </div>
      </section>

      <section className="mt-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-gold">По ученикам</p>
            <h2 className="font-display mt-2 text-3xl">Результаты ДЗ</h2>
            <p className="mt-2 text-sm text-stone-500">{data.students.total} учеников с назначенными заданиями.</p>
          </div>
          <label className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 sm:w-80">
            <Search size={17} className="shrink-0 text-stone-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Найти ученика"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
        </div>

        <div className="mt-6 divide-y divide-stone-200 border-y border-stone-200">
          {data.students.items.length ? data.students.items.map((student) => (
            <StudentRow
              key={student.id}
              student={student}
              expanded={expandedStudentId === student.id}
              onToggle={() => setExpandedStudentId(expandedStudentId === student.id ? null : student.id)}
            />
          )) : <EmptyLine text="По выбранным условиям учеников не найдено." />}
        </div>

        {data.students.pages > 1 ? (
          <div className="mt-5 flex items-center justify-between gap-3">
            <button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="grid h-11 w-11 place-items-center rounded-xl border border-stone-200 bg-white disabled:opacity-40" aria-label="Предыдущая страница">
              <ChevronLeft size={18} />
            </button>
            <p className="text-xs font-bold text-stone-500">Страница {data.students.page} из {data.students.pages}</p>
            <button type="button" disabled={page >= data.students.pages} onClick={() => setPage((value) => Math.min(data.students.pages, value + 1))} className="grid h-11 w-11 place-items-center rounded-xl border border-stone-200 bg-white disabled:opacity-40" aria-label="Следующая страница">
              <ChevronRight size={18} />
            </button>
          </div>
        ) : null}
      </section>
    </>
  );
}

function StudentRow({
  student,
  expanded,
  onToggle,
}: {
  student: HomeworkStatisticsStudent;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <article>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="grid w-full grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 py-4 text-left transition hover:bg-white/60 sm:px-3"
      >
        <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-lg bg-stone-100 text-sm font-black text-stone-500">
          {student.avatar ? <img src={student.avatar} alt="" className="h-full w-full object-cover" /> : student.displayName.slice(0, 1)}
        </span>
        <span className="min-w-0">
          <strong className="block truncate text-sm text-ink sm:text-base">{student.displayName}</strong>
          <span className="mt-1 block truncate text-xs text-stone-500">{student.directions.map((item) => item.title).join(", ")}</span>
        </span>
        <span className="flex items-center gap-3">
          <span className="hidden text-right sm:block">
            <strong className="block text-sm text-ink">{student.metrics.accepted}/{student.metrics.assigned}</strong>
            <span className="text-[10px] text-stone-400">освоено</span>
          </span>
          <ChevronDown size={18} className={`text-stone-400 transition ${expanded ? "rotate-180" : ""}`} />
        </span>
      </button>
      {expanded ? (
        <div className="border-t border-stone-100 bg-white/55 px-3 py-5 sm:px-6">
          <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
            <DetailMetric label="Назначено" value={student.metrics.assigned} />
            <DetailMetric label="Отправлено" value={student.metrics.submitted} />
            <DetailMetric label="Освоено" value={student.metrics.accepted} />
            <DetailMetric label="С первой проверки" value={student.metrics.acceptedFirstPass} />
            <DetailMetric label="Ждут проверки" value={student.metrics.waitingReview} />
            <DetailMetric label="На доработке" value={student.metrics.revision} />
            <DetailMetric label="Без ответа" value={student.metrics.noAttempt} />
            <DetailMetric label="Среднее число проверок" value={numberOrDash(student.metrics.averageCycles)} />
          </div>
        </div>
      ) : null}
    </article>
  );
}

function SummaryMetric({
  icon: Icon,
  label,
  value,
  tone = "text-ink",
}: {
  icon: typeof ListChecks;
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="min-h-32 rounded-lg border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
      <Icon size={19} className="text-gold" />
      <p className={`font-display mt-4 text-3xl tabular-nums ${tone}`}>{value}</p>
      <p className="mt-1 text-xs font-black text-stone-600">{label}</p>
    </div>
  );
}

function QualityMetric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="px-3 py-5 sm:px-5">
      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-stone-400">{label}</p>
      <p className="font-display mt-2 text-3xl tabular-nums text-ink">{value}</p>
      <p className="mt-1 text-xs text-stone-500">{note}</p>
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase leading-4 tracking-[0.08em] text-stone-400">{label}</p>
      <p className="mt-1 text-xl font-black tabular-nums text-ink">{value}</p>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <p className="px-2 py-8 text-center text-sm text-stone-500">{text}</p>;
}

function percent(value: number | null) {
  return value == null ? "—" : `${value}%`;
}

function numberOrDash(value: number | null) {
  return value == null ? "—" : String(value).replace(".", ",");
}
