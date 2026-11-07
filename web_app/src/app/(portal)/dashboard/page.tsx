"use client";

import { sectorTitle } from "@/lib/sector-label";
import { formatExamDate } from "@/lib/sector-exams-api";
import {
  ArrowRight,
  ChevronRight,
  Flame,
  MonitorPlay,
  School,
  Sparkles,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ScreenError } from "@/components/app-error-screen";
import { LevelBadge, LevelProgressDialog } from "@/components/level-summary";
import { ProgressBar } from "@/components/progress-bar";
import { ScreenSkeleton } from "@/components/screen-skeleton";
import { useApiResource } from "@/hooks/use-api-resource";
import { StudentBanners } from "@/components/student-banners";
import { StudentTodayCard } from "@/components/student-today-card";
import { dashboardCourseAction } from "@/lib/course-access-format";
import { invalidateStudentHome, loadStudentHome } from "@/lib/student-home";
import { formatCount, formatOutOf, pluralize } from "@/lib/plural";
import type { SchoolOfflineLesson } from "@/types/school-offline";
import type { ProductLevelProgress, StudentHomeMonthlyPlan, StudentMonthlyPlansResponse } from "@/types/api";

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
  // The streak in the header follows the «Позанимался сегодня» mark without a reload.
  const [streakNow, setStreakNow] = useState<number | null>(null);
  useEffect(() => {
    const onChecked = (event: Event) => {
      const days = (event as CustomEvent<{ streakDays?: number }>).detail?.streakDays;
      if (typeof days === "number") setStreakNow(days);
    };
    window.addEventListener("maestro:practice-checked-in", onChecked);
    return () => window.removeEventListener("maestro:practice-checked-in", onChecked);
  }, []);
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
  // Stage 4: a lesson that waits for the payment of its course leads to the course, not to the lesson.
  const courseAction = data.dashboard.currentCourse
    ? dashboardCourseAction({ nextLesson: data.dashboard.nextAvailableLesson, currentCourseId: data.dashboard.currentCourse.id })
    : { href: "/courses", label: "Открыть курс" };

  return (
    <div className="mx-auto max-w-[1400px]">
      {/* В-31: the greeting and two figures — LEVEL with its bar and the days of practice in a row. XP and the
          place in the league live on «Лига»; Coins are not shown to the student (decision 24.10). */}
      <header className="mb-3 sm:mb-4">
        <h1 className="font-display text-[26px] leading-tight sm:text-[28px]">
          Привет, {user?.firstName || "ученик"}!
        </h1>
        <div className="mt-2 grid grid-cols-1 gap-2 min-[360px]:grid-cols-[minmax(0,1fr)_auto] sm:max-w-xl">
          {data.dashboard.level ? <LevelChip progress={data.dashboard.level} onClick={() => setLevelDialogOpen(true)} /> : <span />}
          <StreakChip days={streakNow ?? data.practice?.streakDays ?? 0} />
        </div>
      </header>

      {levelDialogOpen && data.dashboard.level ? (
        <LevelProgressDialog progress={data.dashboard.level} onClose={() => setLevelDialogOpen(false)} />
      ) : null}

      <StudentTodayCard today={today} practice={data.practice ?? null} scheduleIssue={scheduleIssue} />

      <StudentBanners banners={data.banners ?? []} total={data.bannersTotal} />

      {(plans.length || data.tasks || visibleUpcoming.length) ? (
        <div className={`mt-4 grid grid-cols-[minmax(0,1fr)] items-start gap-5 ${visibleUpcoming.length ? "lg:grid-cols-2" : ""}`}>
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
              href={courseAction.href}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-stone-300 px-4 text-sm font-bold"
              data-testid="dashboard-course-action"
            >
              {courseAction.label}
              <ArrowRight size={16} />
            </Link>
          </div>
          <ProgressBar value={data.dashboard.progressPercent} />
        </section>
      ) : null}

      <Link
        href="/league"
        className="mt-5 flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white px-4 text-sm font-bold text-ink transition hover:border-gold/50"
        data-testid="dashboard-league-link"
      >
        <span className="flex min-w-0 items-center gap-3">
          <Trophy size={18} className="shrink-0 text-gold-ink" aria-hidden="true" />
          <span className="min-w-0">Недельная лига — таблица и награды</span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-stone-400" aria-hidden="true" />
      </Link>

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

function LevelChip({ progress, onClick }: { progress: ProductLevelProgress; onClick: () => void }) {
  const next = progress.next;
  const label = next
    ? `${progress.level.title}, ${progress.points.toLocaleString("ru-RU")} из ${next.minPoints.toLocaleString("ru-RU")}`
    : `${progress.level.title}, максимальный уровень`;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title="Уровни Maestro"
      className="flex min-h-12 min-w-0 items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2 text-left shadow-sm transition hover:border-gold/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
      data-testid="dashboard-level-chip"
    >
      <LevelBadge level={progress.level} size="small" />
      <span className="block min-w-0 flex-1">
        <strong className="block text-sm text-ink">{progress.level.title}</strong>
        {next ? (
          <>
            {/* The bar and the line are the same figure as the level window: progress inside the level. */}
            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-stone-200/90" aria-hidden="true">
              <span className="block h-full rounded-full bg-gold transition-all duration-500" style={{ width: `${Math.min(100, Math.max(0, progress.progressPercent))}%` }} />
            </span>
            <span className="mt-1 block text-xs text-stone-500" data-testid="dashboard-level-to-next">
              {formatCount(progress.pointsToNext, ["балл", "балла", "баллов"])} до {next.title}
            </span>
          </>
        ) : (
          <span className="mt-0.5 block text-xs text-stone-500">максимальный уровень</span>
        )}
      </span>
    </button>
  );
}

function StreakChip({ days }: { days: number }) {
  return (
    <div
      className="flex min-h-12 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 shadow-sm"
      data-testid="dashboard-streak"
    >
      <Flame size={20} className={`shrink-0 ${days > 0 ? "text-orange-500" : "text-stone-400"}`} aria-hidden="true" />
      {days > 0 ? (
        <span className="block leading-tight">
          <strong className="block text-base text-ink">{days.toLocaleString("ru-RU")}</strong>
          <span className="block text-xs text-stone-500">{pluralize(days, ["день", "дня", "дней"])} подряд</span>
        </span>
      ) : (
        <span className="text-sm font-bold text-stone-700">Начни серию</span>
      )}
    </div>
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
