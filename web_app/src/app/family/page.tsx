"use client";

import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock3,
  MapPin,
  Target,
  UserRound,
  WalletCards,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { useApiResource } from "@/hooks/use-api-resource";
import { familyApi } from "@/lib/family-api";
import {
  schoolHomeworkReviewState,
  type SchoolHomeworkReviewState,
} from "@/lib/school-homework-state";
import type {
  FamilyChild,
  FamilySchoolLesson,
  FamilySchoolSummary,
} from "@/types/family";

const relationshipLabels: Record<string, string> = {
  mother: "Мама",
  father: "Папа",
  guardian: "Представитель",
  other: "Родитель",
};

const attendanceLabels: Record<string, string> = {
  scheduled: "Запланирован",
  started: "Идёт",
  pending_admin_review: "На проверке",
  completed: "Проведён",
  not_filled: "Не заполнен",
  cancelled: "Отменён",
};

const homeworkLabels = {
  completed: "Выполнено",
  partial: "Выполнено частично",
  not_completed: "Не выполнено",
} as const;

function parseDate(value: string) {
  return new Date(value.includes("T") ? value : `${value}T00:00:00`);
}

function formatDate(value: string, withYear = false) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    ...(withYear ? { year: "numeric" } : {}),
  }).format(parseDate(value));
}

function formatMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function money(value: number) {
  return `${value.toLocaleString("ru-RU")} ₸`;
}

export default function FamilyPage() {
  const childrenResource = useApiResource(() => familyApi.children(), []);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);

  useEffect(() => {
    if (!childrenResource.data?.length) return;
    const requestedChildId = new URLSearchParams(window.location.search).get("student");
    setSelectedChildId((current) => (
      current && childrenResource.data?.some((child) => child.id === current)
        ? current
        : requestedChildId && childrenResource.data?.some((child) => child.id === requestedChildId)
          ? requestedChildId
          : childrenResource.data![0].id
    ));
  }, [childrenResource.data]);

  if (childrenResource.loading) {
    return <LoadingState label="Загружаем семейный кабинет" />;
  }
  if (childrenResource.error) {
    return <ErrorState message={childrenResource.error} retry={childrenResource.reload} />;
  }
  if (!childrenResource.data?.length) {
    return (
      <EmptyState
        title="Нет привязанных учеников"
        description="Попросите администратора Maestro привязать ученика к вашему родительскому профилю."
      />
    );
  }

  const selectedChild = childrenResource.data.find((child) => child.id === selectedChildId)
    ?? childrenResource.data[0];

  return (
    <>
      <header className="mb-7">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold">Семейный кабинет</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl sm:text-5xl">Обучение ребёнка</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-500">
              Расписание, домашние задания, итоги занятий и состояние абонемента — без лишних разделов.
            </p>
          </div>
          {childrenResource.data.length > 1 ? (
            <label className="min-w-[240px]">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-400">
                Выберите ученика
              </span>
              <select
                value={selectedChild.id}
                onChange={(event) => setSelectedChildId(event.target.value)}
                className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-gold"
              >
                {childrenResource.data.map((child) => (
                  <option key={child.id} value={child.id}>{child.fullName}</option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </header>

      <ChildOverview key={selectedChild.id} child={selectedChild} />
    </>
  );
}

function ChildOverview({ child }: { child: FamilyChild }) {
  const resource = useApiResource(() => familyApi.childOverview(child.id), [child.id]);

  if (resource.loading) return <LoadingState label={`Загружаем данные: ${child.fullName}`} />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data) return null;

  const { summary } = resource.data;
  const nearestLesson = summary.upcomingLessons[0] ?? null;
  const homeworks = summary.lessonHistory.filter((lesson) => Boolean(lesson.homework)).slice(0, 8);
  const recentLessons = summary.lessonHistory.slice(0, 6);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[30px] bg-ink p-6 text-white shadow-soft sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-white/10 font-display text-xl text-gold">
              {child.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={child.avatar} alt="" className="h-full w-full object-cover" />
              ) : child.firstName.slice(0, 1)}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">
                {relationshipLabels[child.relationship] ?? "Ученик"}
              </p>
              <h2 className="font-display mt-1 text-3xl sm:text-4xl">{child.fullName}</h2>
              <p className="mt-1 text-sm text-white/45">
                {summary.profile.groups.map((group) => group.name).join(", ") || "Группа пока не указана"}
              </p>
            </div>
          </div>
          <div className="grid w-full grid-cols-2 gap-3 sm:w-auto sm:min-w-[360px]">
            <Metric
              label="Занятий осталось"
              value={String(summary.balanceSnapshot.classesRemainingTotal)}
            />
            <Metric
              label={summary.balanceSnapshot.debtAmountKzt > 0 ? "К оплате" : "Баланс"}
              value={money(
                summary.balanceSnapshot.debtAmountKzt > 0
                  ? summary.balanceSnapshot.debtAmountKzt
                  : summary.balanceSnapshot.accountBalanceKzt,
              )}
              warning={summary.balanceSnapshot.debtAmountKzt > 0}
            />
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.17em] text-gold">Ближайшее занятие</p>
              <h2 className="font-display mt-2 text-3xl">Расписание</h2>
            </div>
            <CalendarDays className="text-gold" />
          </div>
          {nearestLesson ? (
            <div className="mt-5 rounded-2xl bg-stone-50 p-5">
              <p className="font-display text-2xl">{nearestLesson.title}</p>
              <p className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-stone-600">
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 size={15} className="text-gold" />
                  {formatDate(nearestLesson.date)} · {nearestLesson.startTime}–{nearestLesson.endTime}
                </span>
                {nearestLesson.teacherName ? (
                  <span className="inline-flex items-center gap-1.5">
                    <UserRound size={15} />
                    {nearestLesson.teacherName}
                  </span>
                ) : null}
                {nearestLesson.roomName ? (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin size={15} />
                    {nearestLesson.roomName}
                  </span>
                ) : null}
              </p>
            </div>
          ) : (
            <p className="mt-5 rounded-2xl bg-stone-50 p-5 text-sm text-stone-500">
              Ближайшие занятия пока не назначены.
            </p>
          )}
          {summary.upcomingLessons.length > 1 ? (
            <div className="mt-4 space-y-2">
              {summary.upcomingLessons.slice(1, 4).map((lesson) => (
                <div key={lesson.crmClassId} className="flex items-center justify-between gap-4 rounded-xl border border-stone-100 px-4 py-3 text-sm">
                  <span className="font-semibold">{formatDate(lesson.date)}</span>
                  <span className="text-stone-500">{lesson.startTime} · {lesson.title}</span>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <MonthlyPlanCard plan={summary.monthlyPlan} />
      </div>

      <section className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.17em] text-gold">Домашняя работа</p>
            <h2 className="font-display mt-2 text-3xl">Последние задания</h2>
          </div>
          <p className="text-sm text-stone-500">Оценка преподавателя и начисленные баллы</p>
        </div>
        {homeworks.length ? (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {homeworks.map((lesson) => (
              <HomeworkCard
                key={lesson.crmClassId}
                lesson={lesson}
                reviewState={schoolHomeworkReviewState(lesson, summary.lessonHistory)}
              />
            ))}
          </div>
        ) : (
          <p className="mt-5 rounded-2xl bg-stone-50 p-5 text-sm text-stone-500">
            Преподаватель ещё не выдавал домашние задания.
          </p>
        )}
      </section>

      <section className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.17em] text-gold">После занятий</p>
          <h2 className="font-display mt-2 text-3xl">Итоги уроков</h2>
        </div>
        {recentLessons.length ? (
          <div className="mt-6 space-y-4">
            {recentLessons.map((lesson) => <LessonSummary key={lesson.crmClassId} lesson={lesson} />)}
          </div>
        ) : (
          <p className="mt-5 rounded-2xl bg-stone-50 p-5 text-sm text-stone-500">
            Завершённых занятий пока нет.
          </p>
        )}
      </section>

      <MembershipCard summary={summary} />
    </div>
  );
}

function Metric({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${warning ? "border-red-400/30 bg-red-500/10" : "border-white/10 bg-white/5"}`}>
      <p className="font-display text-2xl text-white">{value}</p>
      <p className={`mt-1 text-[11px] ${warning ? "text-red-100/70" : "text-white/45"}`}>{label}</p>
    </div>
  );
}

function MonthlyPlanCard({ plan }: { plan: FamilySchoolSummary["monthlyPlan"] }) {
  if (!plan) {
    return (
      <section className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft">
        <Target className="text-gold" />
        <h2 className="font-display mt-4 text-3xl">Учебный план</h2>
        <p className="mt-4 rounded-2xl bg-stone-50 p-5 text-sm leading-6 text-stone-500">
          Преподаватель ещё не добавил план на текущий месяц.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.17em] text-gold">
            План на {formatMonth(plan.month)}
          </p>
          <h2 className="font-display mt-2 text-3xl">Цель месяца</h2>
        </div>
        <span className="font-display text-3xl text-gold">{plan.progressPercent}%</span>
      </div>
      <p className="mt-4 text-sm leading-6 text-stone-700">{plan.goal}</p>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-stone-100">
        <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${plan.progressPercent}%` }} />
      </div>
      <div className="mt-5 space-y-2">
        {plan.items.filter((item) => item.status !== "moved").slice(0, 5).map((item) => (
          <div key={item.id} className="flex items-start gap-2 text-sm">
            {item.status === "completed" ? (
              <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-600" />
            ) : (
              <Circle size={17} className="mt-0.5 shrink-0 text-stone-300" />
            )}
            <span className={item.status === "completed" ? "text-stone-500 line-through" : "text-stone-700"}>
              {item.title}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-5 text-xs text-stone-400">План ведёт: {plan.teacherName || "преподаватель Maestro"}</p>
    </section>
  );
}

function HomeworkCard({
  lesson,
  reviewState,
}: {
  lesson: FamilySchoolLesson;
  reviewState: SchoolHomeworkReviewState;
}) {
  const result = lesson.homeworkResult;
  const percent = result?.completionPercent ?? (
    result?.status === "completed" ? 100 : result?.status === "not_completed" ? 0 : null
  );
  const status = result
    ? homeworkLabels[result.status]
    : reviewState === "missing_review"
      ? "Результат не отмечен"
      : "Проверка на следующем уроке";

  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-stone-400">{formatDate(lesson.date, true)} · {lesson.title}</p>
          <p className="mt-3 text-sm leading-6 text-stone-700">{lesson.homework}</p>
        </div>
        <BookOpen size={18} className="shrink-0 text-gold" />
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4">
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${
          result?.status === "completed"
            ? "bg-emerald-50 text-emerald-800"
            : result?.status === "not_completed"
              ? "bg-red-50 text-red-700"
              : reviewState === "missing_review"
                ? "bg-red-50 text-red-700"
                : "bg-amber-50 text-amber-900"
        }`}>
          {percent != null ? `${percent}% · ` : ""}{status}
        </span>
        <span className="text-xs font-bold text-stone-500">
          {lesson.lessonPointsAwarded != null
            ? `+${lesson.lessonPointsAwarded} баллов`
            : lesson.lessonPoints != null
              ? `Можно получить: ${lesson.lessonPoints}`
              : "Баллы не назначены"}
        </span>
      </div>
    </article>
  );
}

function LessonSummary({ lesson }: { lesson: FamilySchoolLesson }) {
  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-2xl">{lesson.title}</p>
          <p className="mt-1 text-xs text-stone-400">
            {formatDate(lesson.date, true)} · {lesson.teacherName || "Maestro"}
          </p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
          lesson.attended === true
            ? "bg-emerald-50 text-emerald-800"
            : lesson.attended === false
              ? "bg-stone-100 text-stone-600"
              : "bg-amber-50 text-amber-900"
        }`}>
          {lesson.attended === true ? <CheckCircle2 size={14} /> : lesson.attended === false ? <XCircle size={14} /> : null}
          {lesson.attended === true
            ? "Был на уроке"
            : lesson.attended === false
              ? "Не был на уроке"
              : attendanceLabels[lesson.status] ?? lesson.status}
        </span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SummaryCell label="Тема" value={lesson.topic} />
        <SummaryCell label="Что получилось" value={lesson.lessonSummary} />
        <SummaryCell label="Фокус следующего урока" value={lesson.nextLessonFocus} />
      </div>
    </article>
  );
}

function SummaryCell({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-xl bg-stone-50 p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">{label}</p>
      <p className="mt-2 text-sm leading-5 text-stone-700">{value || "Пока без комментария"}</p>
    </div>
  );
}

function MembershipCard({ summary }: { summary: FamilySchoolSummary }) {
  const membership = summary.balanceSnapshot.currentMembership;
  return (
    <section className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
      <div className="flex items-center gap-3">
        <WalletCards className="text-gold" />
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.17em] text-gold">Абонемент</p>
          <h2 className="font-display mt-1 text-3xl">Состояние занятий</h2>
        </div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard label="Занятий осталось" value={String(summary.balanceSnapshot.classesRemainingTotal)} />
        <InfoCard label="Баланс" value={money(summary.balanceSnapshot.accountBalanceKzt)} />
        <InfoCard
          label="К оплате"
          value={money(summary.balanceSnapshot.debtAmountKzt)}
          warning={summary.balanceSnapshot.debtAmountKzt > 0}
        />
        <InfoCard
          label="Текущий абонемент"
          value={membership?.planName || membership?.groupName || "Не подключён"}
        />
      </div>
      {membership ? (
        <p className="mt-5 text-xs text-stone-400">
          Период: {formatDate(membership.startDate, true)} — {formatDate(membership.endDate, true)}
        </p>
      ) : null}
    </section>
  );
}

function InfoCard({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className={`rounded-2xl p-5 ${warning ? "bg-red-50" : "bg-stone-50"}`}>
      <p className={`font-display text-2xl ${warning ? "text-red-700" : "text-ink"}`}>{value}</p>
      <p className={`mt-2 text-xs ${warning ? "text-red-600" : "text-stone-500"}`}>{label}</p>
    </div>
  );
}
