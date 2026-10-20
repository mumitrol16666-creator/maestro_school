"use client";

import { sectorTitle } from "@/lib/sector-label";
import {
  ArrowRight,
  Award,
  BookOpenCheck,
  CalendarDays,
  ChevronRight,
  Coins,
  GraduationCap,
  MonitorPlay,
  RotateCcw,
  School,
  Sparkles,
  Star,
  Target,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import { ErrorState, LoadingState } from "@/components/data-states";
import { LevelBadge, LevelProgressDialog } from "@/components/level-summary";
import { ProgressBar } from "@/components/progress-bar";
import { useApiResource } from "@/hooks/use-api-resource";
import { invalidateStudentHome, loadStudentHome } from "@/lib/student-home";
import { selectStudentHomeHero, type StudentHomeHero } from "@/lib/student-home-priority";
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
  if (resource.loading) {
    return <LoadingState label="Собираем вашу учебную главную" />;
  }
  if (resource.error || !resource.data) {
    return <ErrorState message={resource.error ?? "Не удалось загрузить главную"} retry={() => { invalidateStudentHome(); return resource.reload(); }} />;
  }

  const data = resource.data;
  const school = data.school;
  const upcoming = school?.upcomingLessons ?? [];
  const plans = data.monthlyPlans;
  const planProgress = aggregatePlanProgress(plans);
  const actionTasks = data.tasks?.items.filter((task) => task.actionRequired) ?? [];
  const hero = selectStudentHomeHero({
    tasks: actionTasks,
    schoolLessons: upcoming,
    plans,
    dashboard: data.dashboard,
  });
  const visibleUpcoming = upcoming
    .filter((lesson) => !["school_lesson", "online_lesson"].includes(hero?.kind ?? "") || lesson.crmClassId !== hero?.id)
    .slice(0, 3);
  const earnedAchievements = data.achievementsEarned;
  const currentCourseLessonHref = data.dashboard.nextAvailableLesson
    ? `/lessons/${data.dashboard.nextAvailableLesson.id}`
    : null;
  const hideCurrentCourse = hero?.kind === "course"
    || (hero?.kind === "task" && currentCourseLessonHref && hero.href.startsWith(currentCourseLessonHref));
  const hasLearningData = Boolean(
    hero
    || plans.length
    || data.dashboard.currentCourse
    || actionTasks.length,
  );

  return (
    <div className="mx-auto max-w-[1400px]">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 sm:mb-5 sm:gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-ink sm:text-xs">Твоя учебная неделя</p>
          <h1 className="font-display mt-1.5 text-[32px] leading-tight sm:mt-2 sm:text-4xl">
            Привет, {user?.firstName || "ученик"}!
          </h1>
          <p className="mt-1 text-[13px] text-stone-500 sm:mt-2 sm:text-sm">Здесь только то, что важно сейчас.</p>
        </div>
        <div className={`grid w-full gap-2 sm:w-auto ${data.dashboard.level ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
          {data.dashboard.level ? (
            <MetricChip
              leading={<LevelBadge level={data.dashboard.level.level} size="small" />}
              value={data.dashboard.level.level.title}
              label=""
              onClick={() => setLevelDialogOpen(true)}
              testId="dashboard-level-chip"
            />
          ) : null}
          <MetricChip icon={Star} value={data.dashboard.points.toLocaleString("ru-RU")} label="баллов" onClick={data.dashboard.level ? () => setLevelDialogOpen(true) : undefined} testId="dashboard-points-chip" />
          <MetricChip icon={Coins} value={(user?.coins ?? 0).toLocaleString("ru-RU")} label="Coins" href="/rewards" testId="dashboard-coins-chip" />
          {earnedAchievements != null ? (
            <MetricChip icon={Award} value={earnedAchievements.toLocaleString("ru-RU")} label="достижений" href="/settings#achievements" testId="dashboard-achievements-chip" />
          ) : null}
        </div>
      </header>

      {levelDialogOpen && data.dashboard.level ? (
        <LevelProgressDialog progress={data.dashboard.level} onClose={() => setLevelDialogOpen(false)} />
      ) : null}

      <div className={`grid items-stretch gap-5 ${hero ? "xl:grid-cols-[minmax(0,1.75fr)_minmax(280px,0.65fr)]" : ""}`}>
        {hero ? <div className="order-1"><NowHero hero={hero} /></div> : null}
        <div className="order-3 xl:order-2"><LeagueMiniWidget /></div>
      </div>

      {(plans.length || data.tasks || visibleUpcoming.length) ? (
        <div className={`mt-5 grid items-start gap-5 ${visibleUpcoming.length ? "lg:grid-cols-2" : ""}`}>
          <LearningSummary
            actionCount={data.tasks?.counts.actionRequired ?? null}
            plans={plans}
            planProgress={planProgress}
          />
          {visibleUpcoming.length ? <UpcomingLessons lessons={visibleUpcoming} /> : null}
        </div>
      ) : null}

      {data.dashboard.currentCourse && !hideCurrentCourse ? (
        <section className="mt-6 rounded-[26px] border border-stone-200 bg-white p-5 shadow-soft sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-400">Самостоятельный курс</p>
              <h2 className="font-display mt-2 text-2xl">{data.dashboard.currentCourse.title}</h2>
              <p className="mt-2 text-sm text-stone-500">
                {data.dashboard.completedLessonsCount} из {data.dashboard.totalLessonsCount} уроков · {data.dashboard.progressPercent}%
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
          <h2 className="font-display mt-4 text-3xl">Учебный маршрут готовится</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-stone-500">
            После назначения расписания, домашнего задания или открытия сектора здесь появятся следующие действия.
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
  planProgress,
}: {
  actionCount: number | null;
  plans: StudentHomeMonthlyPlan[];
  planProgress: StudentMonthlyPlansResponse["aggregateProgress"];
}) {
  return (
    <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-soft sm:p-7" data-testid="dashboard-learning-summary">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-gold-ink">Обучение</p>
      <h2 className="font-display mt-2 text-3xl leading-tight text-ink">
        {actionCount == null
          ? "Задания и сектор"
          : actionCount > 0
            ? `${actionCount} ${actionCount === 1 ? "задание ждёт" : actionCount < 5 ? "задания ждут" : "заданий ждут"}`
            : "Все задания сделаны"}
      </h2>
      {plans.length ? (
        <div className="mt-5">
          <p className="text-sm font-bold text-stone-700">
            {plans.length === 1 ? sectorTitle(plans[0]!, "student") : "Мои сектора"} · {planProgress.percent}%
          </p>
          <div className="mt-2"><ProgressBar value={planProgress.percent} /></div>
          <p className="mt-2 text-xs font-semibold text-stone-500">{planProgress.completed} из {planProgress.total} тем закрыто</p>
        </div>
      ) : null}
      <div className="mt-5 flex flex-wrap gap-2">
        <Link href="/learning" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-bold text-white">
          Открыть обучение <ArrowRight size={16} />
        </Link>
        {plans.length ? (
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
      <span className="min-w-0 text-[10px] text-stone-500 sm:text-xs">
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

function NowHero({ hero }: { hero: StudentHomeHero }) {
  const Icon = hero.kind === "school_lesson"
    ? School
    : hero.kind === "online_lesson"
      ? MonitorPlay
      : hero.kind === "plan"
        ? Target
        : hero.kind === "sector_exam"
          ? GraduationCap
          : BookOpenCheck;
  const badgeClass = hero.badge?.tone === "danger"
    ? "bg-red-500/20 text-red-100"
    : hero.badge?.tone === "success"
      ? "bg-emerald-400/20 text-emerald-100"
      : "bg-gold/20 text-amber-100";
  const DetailIcon = hero.badge?.tone === "danger" ? RotateCcw : CalendarDays;

  return (
    <section className="h-full overflow-hidden rounded-[20px] border border-white/10 bg-charcoal p-4 text-white shadow-soft sm:p-5">
      <div className="flex h-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-gold-ink">
              <Icon size={17} />
            </span>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gold-ink sm:text-xs">{hero.eyebrow}</p>
            {hero.badge ? (
              <span className={`inline-flex min-h-6 items-center rounded-md px-2.5 text-[10px] font-black ${badgeClass}`}>
                {hero.badge.label}
              </span>
            ) : null}
          </div>
          <h2 className="font-display mt-3 break-words text-2xl leading-tight sm:text-[28px]">{hero.title}</h2>
          {hero.subtitle ? <p className="mt-2 line-clamp-1 break-words text-xs leading-5 text-white/70 sm:text-sm">{hero.subtitle}</p> : null}
          {hero.detail ? (
            <p className={`mt-2 inline-flex items-start gap-2 text-xs leading-5 sm:text-[13px] ${hero.badge?.tone === "danger" ? "rounded-xl border border-red-400/20 bg-red-500/10 p-2.5 text-red-50" : "text-white/60"}`}>
              <DetailIcon size={16} className="mt-0.5 shrink-0 text-gold-ink" /> {hero.detail}
            </p>
          ) : null}
        </div>
        <Link
          href={hero.href}
          target={hero.external ? "_blank" : undefined}
          rel={hero.external ? "noreferrer" : undefined}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-gold px-4 text-sm font-black text-ink transition hover:bg-amber-400 sm:min-h-11"
        >
          {hero.actionLabel} <ArrowRight size={17} />
        </Link>
      </div>
    </section>
  );
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
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gold-ink">Недельная лига</p>
            <h3 className="font-display text-base sm:text-lg">Лидеры недели</h3>
          </div>
        </div>
        <Link
          href="/league"
          aria-label="Открыть таблицу недельной лиги"
          title="Таблица лиги"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-white/80 transition hover:bg-white/10 hover:text-white"
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
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-stone-200 text-stone-500 transition hover:border-gold/40 hover:text-gold-ink"
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
