"use client";

import { sectorTitle } from "@/lib/sector-label";
import { formatExamDate } from "@/lib/sector-exams-api";
import {
  ArrowRight,
  ChevronRight,
  MonitorPlay,
  School,
  Sparkles,
  Star,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import { ScreenError } from "@/components/app-error-screen";
import { LevelBadge, LevelProgressDialog } from "@/components/level-summary";
import { ProgressBar } from "@/components/progress-bar";
import { ScreenSkeleton } from "@/components/screen-skeleton";
import { useApiResource } from "@/hooks/use-api-resource";
import { StudentBanners } from "@/components/student-banners";
import { StudentTodayCard } from "@/components/student-today-card";
import { invalidateStudentHome, loadStudentHome } from "@/lib/student-home";
import { formatCount, formatOutOf, pluralize } from "@/lib/plural";
import { weeklyLeagueApi } from "@/lib/weekly-league-api";
import type { SchoolOfflineLesson } from "@/types/school-offline";
import type { StudentHomeMonthlyPlan, StudentMonthlyPlansResponse } from "@/types/api";

function formatLessonDate(value: string) {
  const date = new Date(value);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const sameDay = (left: Date, right: Date) => left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
  if (sameDay(date, today)) return "Сегодня";
  if (sameDay(date, tomorrow)) return "Завтра";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(date);
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [levelDialogOpen, setLevelDialogOpen] = useState(false);
  // Plan 2.1: «Сейчас» is one read of the student's home; the header shares it.
  const resource = useApiResource(() => loadStudentHome(), []);
  if (resource.loading && !resource.data) {
    return <ScreenSkeleton variant="home" label="Собираем твою учебную главную" />;
  }
  if (!resource.data) {
    return <ScreenError message={resource.error} code={resource.errorCode} retry={() => { invalidateStudentHome(); return resource.reload(); }} />;
  }

  const data = resource.data;
  const school = data.school;
  const upcoming = school?.upcomingLessons ?? [];
  const plans = data.monthlyPlans;
  // 07.11: progress is the current sectors only; the one waiting for its exam is a line below it.
  const currentPlans = plans.filter((plan) => plan.status !== "awaiting_exam");
  const waitingPlans = plans.filter((plan) => plan.status === "awaiting_exam");
  const planProgress = aggregatePlanProgress(currentPlans);
  const actionTasks = data.tasks?.items.filter((task) => task.actionRequired) ?? [];
  // Plan 5.1: «Сегодня» opens the home; the lessons after the nearest one go to the list.
  const today = data.today ?? { nextLesson: null, tasks: [], tasksTotal: 0 };
  const visibleUpcoming = upcoming
    .filter((lesson) => lesson.crmClassId !== today.nextLesson?.crmClassId)
    .slice(0, 3);
  const scheduleIssue = data.schoolStatus === "unavailable" || data.schoolStatus === "failed" ? data.schoolStatus : null;
  // «Пока всё тихо» says there are no lessons; with the schedule unread that is not known.
  const hasLearningData = Boolean(
    scheduleIssue
    || today.nextLesson
    || plans.length
    || data.dashboard.currentCourse
    || actionTasks.length,
  );

  return (
    <div className="mx-auto max-w-[1400px]">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 sm:mb-5 sm:gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-gold-ink">Твоя учебная неделя</p>
          <h1 className="font-display mt-1.5 text-[32px] leading-tight sm:mt-2 sm:text-4xl">
            Привет, {user?.firstName || "ученик"}!
          </h1>
          <p className="mt-1 text-[13px] text-stone-500 sm:mt-2 sm:text-sm">Здесь только то, что важно сейчас.</p>
        </div>
        {/* Plan 5.1: two figures only — LEVEL and Points. Coins wait for the shop (decision 24.10). */}
        <div className="grid w-full grid-cols-2 gap-2 sm:w-auto">
          {data.dashboard.level ? (
            <MetricChip
              leading={<LevelBadge level={data.dashboard.level.level} size="small" />}
              value={data.dashboard.level.level.title}
              label=""
              onClick={() => setLevelDialogOpen(true)}
              testId="dashboard-level-chip"
            />
          ) : null}
          <MetricChip icon={Star} value={data.dashboard.points.toLocaleString("ru-RU")} label={pluralize(data.dashboard.points, ["балл", "балла", "баллов"])} onClick={data.dashboard.level ? () => setLevelDialogOpen(true) : undefined} testId="dashboard-points-chip" />
        </div>
      </header>

      {levelDialogOpen && data.dashboard.level ? (
        <LevelProgressDialog progress={data.dashboard.level} onClose={() => setLevelDialogOpen(false)} />
      ) : null}

      <StudentBanners banners={data.banners ?? []} />

      <div className="grid grid-cols-[minmax(0,1fr)] items-stretch gap-5 xl:grid-cols-[minmax(0,1.75fr)_minmax(280px,0.65fr)]">
        <div className="order-1 min-w-0"><StudentTodayCard today={today} streakWeeks={data.streakWeeks ?? null} practice={data.practice ?? null} scheduleIssue={scheduleIssue} /></div>
        <div className="order-3 min-w-0 xl:order-2"><LeagueMiniWidget /></div>
      </div>

      {(plans.length || data.tasks || visibleUpcoming.length) ? (
        <div className={`mt-5 grid grid-cols-[minmax(0,1fr)] items-start gap-5 ${visibleUpcoming.length ? "lg:grid-cols-2" : ""}`}>
          <LearningSummary
            actionCount={data.tasks?.counts.actionRequired ?? null}
            plans={currentPlans}
            waitingPlans={waitingPlans}
            hasPlans={plans.length > 0}
            planProgress={planProgress}
          />
          {visibleUpcoming.length ? <UpcomingLessons lessons={visibleUpcoming} /> : null}
        </div>
      ) : null}

      {data.dashboard.currentCourse ? (
        <section className="mt-6 rounded-[26px] border border-stone-200 bg-white p-5 shadow-soft sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-stone-500">Самостоятельный курс</p>
              <h2 className="font-display mt-2 text-2xl">{data.dashboard.currentCourse.title}</h2>
              <p className="mt-2 text-sm text-stone-500">
                {formatOutOf(data.dashboard.completedLessonsCount, data.dashboard.totalLessonsCount, ["урока", "уроков", "уроков"])} · {data.dashboard.progressPercent}%
              </p>
            </div>
            <Link
              href={data.dashboard.nextAvailableLesson ? `/lessons/${data.dashboard.nextAvailableLesson.id}` : `/courses/${data.dashboard.currentCourse.id}`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-stone-300 px-4 text-sm font-bold"
            >
              {data.dashboard.nextAvailableLesson ? "Открыть урок" : "Открыть курс"}
              <ArrowRight size={16} />
            </Link>
          </div>
          <ProgressBar value={data.dashboard.progressPercent} />
        </section>
      ) : null}

      {!hasLearningData ? (
        <section className="mt-8 rounded-[28px] border border-dashed border-stone-300 bg-white p-8 text-center">
          <Sparkles className="mx-auto text-gold-ink" />
          <h2 className="font-display mt-4 text-3xl">Пока всё тихо</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-stone-500">
            Когда школа поставит урок, преподаватель даст задание или откроет сектор, всё это появится здесь.
          </p>
        </section>
      ) : null}
    </div>
  );
}

/**
 * Plan 2.1: «Обучение» lives on its own page; «Сейчас» only says how much is waiting there
 * and how far the sector has come, and leads to it.
 */
function LearningSummary({
  actionCount,
  plans,
  waitingPlans,
  hasPlans,
  planProgress,
}: {
  actionCount: number | null;
  plans: StudentHomeMonthlyPlan[];
  waitingPlans: StudentHomeMonthlyPlan[];
  hasPlans: boolean;
  planProgress: StudentMonthlyPlansResponse["aggregateProgress"];
}) {
  return (
    <section className="min-w-0 rounded-[28px] border border-stone-200 bg-white p-6 shadow-soft sm:p-7" data-testid="dashboard-learning-summary">
      <p className="text-xs font-black uppercase tracking-wide text-gold-ink">Обучение</p>
      <h2 className="font-display mt-2 text-3xl leading-tight text-ink">
        {actionCount == null
          ? "Задания и сектор"
          : actionCount > 0
            ? `${formatCount(actionCount, ["задание", "задания", "заданий"])} ${pluralize(actionCount, ["ждёт", "ждут", "ждут"])}`
            : "Все задания сделаны"}
      </h2>
      {plans.length ? (
        <div className="mt-5">
          <p className="text-sm font-bold text-stone-700">
            {plans.length === 1 ? sectorTitle(plans[0]!, "student") : "Мои сектора"} · {planProgress.percent}%
          </p>
          <div className="mt-2"><ProgressBar value={planProgress.percent} /></div>
          <p className="mt-2 text-xs font-semibold text-stone-500">{formatOutOf(planProgress.completed, planProgress.total, ["темы", "тем", "тем"])} закрыто</p>
        </div>
      ) : null}
      {waitingPlans.map((plan) => (
        <Link
          key={plan.id}
          href={`/monthly-plan?sector=${encodeURIComponent(plan.id)}`}
          data-testid="dashboard-sector-awaiting-exam"
          className="mt-3 flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-lg bg-sky-50 px-3 py-2 text-sm font-bold text-sky-950"
        >
          <span className="min-w-0 break-words">
            {sectorTitle(plan, "student")} ждёт экзамена{plan.exam?.status === "scheduled" && plan.exam.scheduledAt ? ` · ${formatExamDate(plan.exam.scheduledAt)}` : ""}
          </span>
          <ChevronRight size={16} className="shrink-0" aria-hidden="true" />
        </Link>
      ))}
      <div className="mt-5 flex flex-wrap gap-2">
        <Link href="/learning" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-bold text-white">
          Открыть обучение <ArrowRight size={16} />
        </Link>
        {hasPlans ? (
          <Link href="/monthly-plan" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-stone-300 px-4 text-sm font-bold text-ink">
            Открыть сектор
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function MetricChip({
  icon: Icon,
  leading,
  value,
  label,
  href,
  onClick,
  testId,
}: {
  icon?: typeof Star;
  leading?: ReactNode;
  value: string | number;
  label: string;
  href?: string;
  onClick?: () => void;
  testId?: string;
}) {
  const interactive = Boolean(href || onClick);
  const accessibleLabel = `${value} ${label}`.trim();
  const className = `group flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-2 py-2 shadow-sm transition sm:min-h-14 sm:justify-start sm:rounded-2xl sm:px-3 ${interactive ? "cursor-pointer hover:-translate-y-0.5 hover:border-gold/50 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold" : ""}`;
  const content = (
    <>
      {leading ?? (Icon ? <Icon size={17} className="shrink-0 text-gold-ink" /> : null)}
      <span className="min-w-0 text-xs text-stone-500">
        <strong className="mr-1 text-sm text-ink sm:text-base">{value}</strong>
        <span className="break-words">{label}</span>
      </span>
      {interactive ? <ChevronRight size={14} className="hidden shrink-0 text-stone-300 transition group-hover:text-gold-ink sm:block" /> : null}
    </>
  );
  if (href) {
    return <Link href={href} className={className} aria-label={accessibleLabel} title={accessibleLabel} data-testid={testId}>{content}</Link>;
  }
  if (onClick) {
    return <button type="button" onClick={onClick} className={className} aria-label={accessibleLabel} title={accessibleLabel} data-testid={testId}>{content}</button>;
  }
  return <div className={className} aria-label={accessibleLabel} title={accessibleLabel} data-testid={testId}>{content}</div>;
}

function LeagueMiniWidget() {
  const resource = useApiResource(() => weeklyLeagueApi.studentOverview(0), []);
  const data = resource.data;
  if (!data) return null;
  const me = data.currentStudent;
  const top3 = data.standings.slice(0, 3);
  const medals = ["🥇", "🥈", "🥉"];

  return (
    <section className="h-full rounded-[20px] border border-stone-200 bg-charcoal p-4 text-white shadow-soft sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gold/15 text-gold-ink sm:h-10 sm:w-10">
            <Trophy size={18} />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-gold-ink">Недельная лига</p>
            <h3 className="font-display text-base sm:text-lg">Лидеры недели</h3>
          </div>
        </div>
        <Link
          href="/league"
          aria-label="Открыть таблицу недельной лиги"
          title="Таблица лиги"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/80 transition hover:bg-white/10 hover:text-white"
        >
          <ChevronRight size={18} />
        </Link>
      </div>

      {top3.length > 0 ? (
        <div className="mt-4 hidden space-y-2 sm:block">
          {top3.map((item, idx) => (
            <div
              key={item.displayName}
              className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-xs font-bold ${
                item.isCurrentStudent ? "bg-gold/20 text-gold-ink" : "bg-white/[0.04] text-white/80"
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <span>{medals[idx]}</span>
                <span className="truncate">{item.displayName} {item.isCurrentStudent ? "(вы)" : ""}</span>
              </div>
              <span className="shrink-0 font-display text-sm text-gold-ink">{item.xp} XP</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 hidden text-xs text-white/50 sm:block">Неделя только началась. Сделай первое действие!</p>
      )}

      <div className="mt-3 border-t border-white/10 pt-3 sm:mt-4">
        <div className="flex items-center justify-between text-xs text-white/60">
          <span>{me?.position ? `Твоё место: #${me.position}` : "Цель на неделю"}</span>
          <span className="font-bold text-white">{me?.xp ?? 0} / {me?.goalXp ?? 80} XP</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-gold to-amber-400 transition-all"
            style={{ width: `${me?.goalProgress ?? 0}%` }}
          />
        </div>
      </div>
    </section>
  );
}

function aggregatePlanProgress(plans: StudentHomeMonthlyPlan[]): StudentMonthlyPlansResponse["aggregateProgress"] {
  const completed = plans.reduce((total, plan) => total + plan.progress.completed, 0);
  const itemTotal = plans.reduce((total, plan) => total + plan.progress.total, 0);
  return {
    completed,
    total: itemTotal,
    percent: itemTotal ? Math.round((completed / itemTotal) * 100) : 0,
  };
}

function UpcomingLessons({ lessons }: { lessons: SchoolOfflineLesson[] }) {
  return (
    <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-stone-400">Дальше по расписанию</p>
          <h2 className="font-display mt-1 text-3xl">Ближайшие уроки</h2>
        </div>
        <Link
          href="/school-lessons?tab=schedule"
          aria-label="Открыть все уроки"
          title="Все уроки"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-stone-200 text-stone-500 transition hover:border-gold/40 hover:text-gold-ink"
        >
          <ChevronRight size={18} />
        </Link>
      </div>
      <div className="mt-5 divide-y divide-stone-100">
        {lessons.map((lesson) => (
          <Link key={lesson.crmClassId} href={`/school-lessons?tab=schedule${lesson.deliveryFormat === "online" ? "&format=online" : ""}`} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${lesson.deliveryFormat === "online" ? "bg-sky-50 text-sky-700" : "bg-stone-100 text-stone-600"}`}>
              {lesson.deliveryFormat === "online" ? <MonitorPlay size={19} /> : <School size={19} />}
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-sm text-stone-800">{lesson.title}</strong>
              <span className="mt-1 block text-xs text-stone-500">{formatLessonDate(lesson.date)} · {lesson.startTime}{lesson.deliveryFormat === "online" ? " · Онлайн" : ""}{lesson.teacherName ? ` · ${lesson.teacherName}` : ""}</span>
            </span>
            <ChevronRight size={18} className="text-stone-300" />
          </Link>
        ))}
      </div>
    </section>
  );
}
