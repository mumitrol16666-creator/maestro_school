"use client";

import {
  ArrowRight,
  Award,
  BookOpenCheck,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  Coins,
  ListTodo,
  MonitorPlay,
  RotateCcw,
  School,
  Sparkles,
  Star,
  Target,
  Trophy,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import { ErrorState, LoadingState } from "@/components/data-states";
import { LevelBadge, LevelProgressDialog } from "@/components/level-summary";
import { ProgressBar } from "@/components/progress-bar";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api-client";
import { selectStudentHomeHero, type StudentHomeHero } from "@/lib/student-home-priority";
import { weeklyLeagueApi } from "@/lib/weekly-league-api";
import type { SchoolOfflineLesson } from "@/types/school-offline";
import type { StudentHomeHomework, StudentHomeMonthlyPlan, StudentMonthlyPlansResponse } from "@/types/api";
import type { UnifiedTask } from "@/types/unified-tasks";

const monthNames = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
];

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

function monthTitle(month: string) {
  const index = Number(month.slice(5, 7)) - 1;
  return monthNames[index] ?? "месяца";
}

function homeworkStatus(homework: StudentHomeHomework) {
  if (homework.status === "needs_revision") return { label: "Нужна доработка", className: "bg-red-50 text-red-800" };
  if (homework.status === "completed") return { label: "Проверено", className: "bg-emerald-50 text-emerald-800" };
  return { label: "Нужно сделать", className: "bg-amber-50 text-amber-900" };
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [levelDialogOpen, setLevelDialogOpen] = useState(false);
  const resource = useApiResource(() => api.studentHome(), []);
  const taskResource = useApiResource(() => api.studentTasks({ scope: "active", limit: 4 }), []);
  const planResource = useApiResource(() => api.studentMonthlyPlans(), []);
  const achievementsResource = useApiResource(() => api.achievements(), []);
  if (resource.loading || taskResource.loading || planResource.loading) {
    return <LoadingState label="Собираем вашу учебную главную" />;
  }
  if (resource.error || !resource.data) {
    return <ErrorState message={resource.error ?? "Не удалось загрузить главную"} retry={resource.reload} />;
  }

  const data = resource.data;
  const school = data.school;
  const upcoming = school?.upcomingLessons ?? [];
  const plans = planResource.data?.plans ?? data.monthlyPlans;
  const planProgress = planResource.data?.aggregateProgress ?? aggregatePlanProgress(plans);
  const actionTasks = taskResource.data?.data.items.filter((task) => task.actionRequired) ?? [];
  const hero = selectStudentHomeHero({
    tasks: actionTasks,
    schoolLessons: upcoming,
    plans,
    dashboard: data.dashboard,
  });
  const visibleTasks = hero?.kind === "task"
    ? actionTasks.filter((task) => task.id !== hero.id).slice(0, 3)
    : actionTasks.slice(0, 3);
  const taskActionCount = taskResource.data?.data.counts.actionRequired ?? 0;
  const showTaskPanel = Boolean(
    (taskResource.data && (taskActionCount === 0 || visibleTasks.length > 0))
    || (!taskResource.data && data.currentHomework),
  );
  const visibleUpcoming = upcoming
    .filter((lesson) => !["school_lesson", "online_lesson"].includes(hero?.kind ?? "") || lesson.crmClassId !== hero?.id)
    .slice(0, 3);
  const earnedAchievements = achievementsResource.data?.meta?.earnedCount;
  const currentCourseLessonHref = data.dashboard.nextAvailableLesson
    ? `/lessons/${data.dashboard.nextAvailableLesson.id}`
    : null;
  const hideCurrentCourse = hero?.kind === "course"
    || (hero?.kind === "task" && currentCourseLessonHref && hero.href.startsWith(currentCourseLessonHref));
  const hasLearningData = Boolean(
    hero
    || data.currentHomework
    || plans.length
    || data.dashboard.currentCourse
    || actionTasks.length,
  );

  return (
    <div className="mx-auto max-w-[1400px]">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 sm:mb-5 sm:gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold sm:text-xs">Твоя учебная неделя</p>
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
        {showTaskPanel ? (
          <div className={`order-2 space-y-5 xl:order-3 ${hero ? "xl:col-span-2" : ""}`}>
            {taskResource.data ? (
              <DashboardTasks
                tasks={visibleTasks}
                actionCount={taskActionCount}
                hiddenInHero={hero?.kind === "task" ? 1 : 0}
              />
            ) : data.currentHomework ? (
              <HomeworkCard homework={data.currentHomework} lastReview={data.lastHomeworkReview} />
            ) : null}
          </div>
        ) : null}
      </div>

      {(plans.length || visibleUpcoming.length) ? (
        <div className={`mt-5 grid items-start gap-5 ${plans.length && visibleUpcoming.length ? "lg:grid-cols-2" : ""}`}>
          {plans.length ? (
            <MonthlyPlanCard
              plans={plans}
              aggregateProgress={planProgress}
              hideCurrentFocus={hero?.kind === "plan"}
            />
          ) : null}
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
          <Sparkles className="mx-auto text-gold" />
          <h2 className="font-display mt-4 text-3xl">Учебный маршрут готовится</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-stone-500">
            После назначения расписания, домашнего задания или плана месяца здесь появятся следующие действия.
          </p>
        </section>
      ) : null}
    </div>
  );
}

function DashboardTasks({
  tasks,
  actionCount,
  hiddenInHero,
}: {
  tasks: Awaited<ReturnType<typeof api.studentTasks>>["data"]["items"];
  actionCount: number;
  hiddenInHero: number;
}) {
  if (actionCount === 0) {
    return (
      <Link href="/tasks" className="flex items-center justify-between gap-4 rounded-[24px] border border-emerald-100 bg-emerald-50/70 p-5 text-emerald-950 shadow-soft">
        <span>
          <span className="block text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Задания</span>
          <span className="font-display mt-1 block text-2xl">Сейчас всё сделано</span>
        </span>
        <CheckCircle2 className="shrink-0 text-emerald-600" />
      </Link>
    );
  }
  if (!tasks.length) return null;

  const visibleActionCount = Math.max(0, actionCount - hiddenInHero);

  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-gold"><ListTodo size={16} /> Ближайшие задания</p>
          <h2 className="font-display mt-1 text-2xl">
            {hiddenInHero ? "Ещё нужно сделать" : "Нужно сделать"} · {visibleActionCount}
          </h2>
        </div>
        <Link
          href="/tasks"
          className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 text-xs font-bold text-stone-600 transition hover:border-gold/40 hover:text-gold"
        >
          Все задания
          <ChevronRight size={18} />
        </Link>
      </div>
      <div className="overflow-hidden rounded-[20px] border border-stone-200 bg-white shadow-soft">
        {tasks.slice(0, 3).map((task) => <DashboardTaskRow key={task.id} task={task} />)}
      </div>
    </section>
  );
}

function dashboardTaskDue(task: UnifiedTask) {
  if (!task.timing.dueAt) return null;
  const value = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Aqtobe",
  }).format(new Date(task.timing.dueAt));
  if (task.timing.overdue) return `Срок прошёл · ${value}`;
  if (task.timing.dueKind === "next_lesson") return `К уроку · ${value}`;
  return `До ${value}`;
}

function DashboardTaskRow({ task }: { task: UnifiedTask }) {
  const isRevision = task.status === "needs_revision";
  const due = dashboardTaskDue(task);
  const sourceLabel = task.source === "offline"
    ? "Урок с преподавателем"
    : task.source === "online"
      ? "Онлайн-урок"
      : "Самостоятельно";
  const statusLabel = isRevision ? "Нужна доработка" : "Нужно сделать";
  const StatusIcon = isRevision ? RotateCcw : Clock3;
  const completion = task.source === "offline" && task.result.completionPercent != null
    ? Math.min(100, Math.max(0, Math.round(task.result.completionPercent)))
    : null;

  return (
    <Link
      href={task.target.href}
      className="group grid min-w-0 gap-3 border-b border-stone-100 p-4 transition last:border-b-0 hover:bg-stone-50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5"
    >
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase text-amber-900">
            <School size={13} /> {sourceLabel}
          </span>
          <span className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase ${isRevision ? "text-red-700" : "text-stone-500"}`}>
            <StatusIcon size={13} /> {statusLabel}
          </span>
          {isRevision && completion != null ? (
            <span className="text-[10px] font-black uppercase text-red-700">Проверено на {completion}%</span>
          ) : null}
        </span>
        <strong className="mt-2 block break-words font-display text-lg leading-tight text-ink sm:text-xl">
          {task.title}
        </strong>
        {task.descriptionPreview ? (
          <span className="mt-1.5 block line-clamp-1 break-words text-sm text-stone-600">{task.descriptionPreview}</span>
        ) : null}
        <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-stone-500">
          {task.context.teacherName ? (
            <span className="inline-flex items-center gap-1.5"><UserRound size={13} /> {task.context.teacherName}</span>
          ) : null}
          {due ? (
            <span className={`inline-flex items-center gap-1.5 ${task.timing.overdue ? "text-red-700" : ""}`}>
              <CalendarClock size={13} /> {due}
            </span>
          ) : null}
        </span>
      </span>
      <span className="inline-flex min-h-10 items-center justify-between gap-3 justify-self-stretch text-sm font-bold text-ink sm:justify-self-end">
        <span>{task.target.actionLabel}</span>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ink text-white transition group-hover:bg-gold group-hover:text-ink">
          <ArrowRight size={16} />
        </span>
      </span>
    </Link>
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
      {leading ?? (Icon ? <Icon size={17} className="shrink-0 text-gold" /> : null)}
      <span className="min-w-0 text-[10px] text-stone-500 sm:text-xs">
        <strong className="mr-1 text-sm text-ink sm:text-base">{value}</strong>
        <span className="break-words">{label}</span>
      </span>
      {interactive ? <ChevronRight size={14} className="hidden shrink-0 text-stone-300 transition group-hover:text-gold sm:block" /> : null}
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
        : BookOpenCheck;
  const badgeClass = hero.badge?.tone === "danger"
    ? "bg-red-500/20 text-red-100"
    : hero.badge?.tone === "success"
      ? "bg-emerald-400/20 text-emerald-100"
      : "bg-gold/20 text-amber-100";
  const DetailIcon = hero.badge?.tone === "danger" ? RotateCcw : CalendarDays;

  return (
    <section className="h-full overflow-hidden rounded-[20px] border border-white/10 bg-[#171813] p-4 text-white shadow-soft sm:p-5">
      <div className="flex h-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-gold">
              <Icon size={17} />
            </span>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gold sm:text-xs">{hero.eyebrow}</p>
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
              <DetailIcon size={16} className="mt-0.5 shrink-0 text-gold" /> {hero.detail}
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
    <section className="h-full rounded-[20px] border border-stone-200 bg-[#171813] p-4 text-white shadow-soft sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gold/15 text-gold sm:h-10 sm:w-10">
            <Trophy size={18} />
          </span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gold">Недельная лига</p>
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
                item.isCurrentStudent ? "bg-gold/20 text-gold" : "bg-white/[0.04] text-white/80"
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <span>{medals[idx]}</span>
                <span className="truncate">{item.displayName} {item.isCurrentStudent ? "(вы)" : ""}</span>
              </div>
              <span className="shrink-0 font-display text-sm text-gold">{item.xp} XP</span>
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

function HomeworkCard({ homework, lastReview }: { homework: StudentHomeHomework; lastReview: StudentHomeHomework | null }) {
  const status = homeworkStatus(homework);
  const separateReview = lastReview && lastReview.sourceLessonId !== homework.sourceLessonId ? lastReview : null;
  return (
    <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-50 text-gold"><BookOpenCheck size={21} /></span>
        <span className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ${status.className}`}>{status.label}</span>
      </div>
      <p className="mt-6 text-xs font-black uppercase tracking-[0.18em] text-stone-400">Текущее домашнее задание</p>
      <h2 className="font-display mt-2 text-3xl leading-tight">{homework.title}</h2>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-stone-600">{homework.description}</p>
      {homework.due ? (
        <p className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-amber-900">
          <CalendarDays size={15} /> К следующему уроку: {formatLessonDate(homework.due.date)}, {homework.due.time}
        </p>
      ) : null}
      {homework.review?.completionPercent != null ? <ReviewLine homework={homework} /> : null}
      {separateReview?.review?.completionPercent != null ? <ReviewLine homework={separateReview} previous /> : null}
      <Link href={homework.href} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-bold text-white">
        {homework.status === "needs_revision" ? "Посмотреть доработку" : "Открыть задание"} <ArrowRight size={16} />
      </Link>
    </section>
  );
}

function ReviewLine({ homework, previous = false }: { homework: StudentHomeHomework; previous?: boolean }) {
  return (
    <div className="mt-4 rounded-2xl bg-stone-50 p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-stone-400">{previous ? "Проверка прошлого ДЗ" : "Оценка преподавателя"}</p>
      <p className="mt-1 text-sm font-bold text-stone-800">Выполнено на {homework.review?.completionPercent}%</p>
      {homework.review?.feedback ? <p className="mt-1 text-xs leading-5 text-stone-600">{homework.review.feedback}</p> : null}
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

function MonthlyPlanCard({
  plans,
  aggregateProgress,
  hideCurrentFocus,
}: {
  plans: StudentHomeMonthlyPlan[];
  aggregateProgress: StudentMonthlyPlansResponse["aggregateProgress"];
  hideCurrentFocus: boolean;
}) {
  const first = plans[0];
  const allItems = plans.flatMap((plan) => plan.items);
  const nextItem = allItems.find((item) => item.status === "in_progress")
    ?? allItems.find((item) => item.status === "planned")
    ?? null;

  return (
    <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-soft sm:p-7">
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-50 text-gold">
          <CircleDot size={22} />
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3.5 py-1.5 text-xs font-black text-amber-950">
          <Sparkles size={13} className="text-gold" />
          {aggregateProgress.percent}% выполнено
        </span>
      </div>

      <p className="mt-5 text-xs font-black uppercase tracking-[0.2em] text-gold">
        План на {monthTitle(first.month)}
      </p>
      <h2 className="font-display mt-2 text-3xl leading-tight text-ink sm:text-4xl">
        {plans.length === 1 ? first.goal : `${plans.length} учебных плана`}
      </h2>
      <div className="mt-5">
        <ProgressBar value={aggregateProgress.percent} />
        <p className="mt-2.5 text-xs font-semibold text-stone-500">
          {aggregateProgress.completed} из {aggregateProgress.total} тем выполнено
        </p>
      </div>

      {!hideCurrentFocus ? (
        <div className="mt-5 border-y border-stone-100 py-4">
          <p className="text-[11px] font-black uppercase tracking-wider text-stone-400">Сейчас в фокусе</p>
          <p className="mt-2 text-sm font-bold leading-6 text-stone-800">
            {nextItem?.title ?? "Все пункты текущего плана выполнены"}
          </p>
        </div>
      ) : null}

      <Link href="/monthly-plan" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-bold text-white">
        Открыть {plans.length === 1 ? "план" : "планы"} <ArrowRight size={16} />
      </Link>
    </section>
  );
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
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-stone-200 text-stone-500 transition hover:border-gold/40 hover:text-gold"
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
