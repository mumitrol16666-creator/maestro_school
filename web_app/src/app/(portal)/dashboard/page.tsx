"use client";

import {
  ArrowRight,
  Award,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Coins,
  ListTodo,
  MonitorPlay,
  RotateCcw,
  School,
  Sparkles,
  Star,
  Target,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { ErrorState, LoadingState } from "@/components/data-states";
import { ProgressBar } from "@/components/progress-bar";
import { UnifiedTaskCard } from "@/components/unified-task-card";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api-client";
import { onlineLessonsApi } from "@/lib/online-lessons-api";
import { selectStudentHomeHero, type StudentHomeHero } from "@/lib/student-home-priority";
import { weeklyLeagueApi } from "@/lib/weekly-league-api";
import type { SchoolOfflineLesson } from "@/types/school-offline";
import type { StudentHomeHomework, StudentHomeMonthlyPlan, StudentMonthlyPlansResponse } from "@/types/api";

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
  const resource = useApiResource(() => api.studentHome(), []);
  const taskResource = useApiResource(() => api.studentTasks({ scope: "active", limit: 4 }), []);
  const planResource = useApiResource(() => api.studentMonthlyPlans(), []);
  const onlineLessonResource = useApiResource(() => onlineLessonsApi.myRequests(), []);
  const achievementsResource = useApiResource(() => api.achievements(), []);
  if (resource.loading || taskResource.loading || planResource.loading || onlineLessonResource.loading) {
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
  const onlineLessons = onlineLessonResource.data ?? [];
  const hero = selectStudentHomeHero({
    tasks: actionTasks,
    schoolLessons: upcoming,
    onlineLessons,
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
    .filter((lesson) => hero?.kind !== "school_lesson" || lesson.crmClassId !== hero.id)
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
        <div className="grid w-full grid-cols-3 gap-2 sm:w-auto">
          <MetricChip icon={Star} value={data.dashboard.points.toLocaleString("ru-RU")} label="баллов" />
          <MetricChip icon={Coins} value={(user?.coins ?? 0).toLocaleString("ru-RU")} label="Coins" />
          {earnedAchievements != null ? (
            <MetricChip icon={Award} value={earnedAchievements.toLocaleString("ru-RU")} label="достижений" />
          ) : null}
        </div>
      </header>

      {hero ? <NowHero hero={hero} /> : null}

      <div className={`mt-5 grid items-start gap-5 ${showTaskPanel ? "xl:grid-cols-[minmax(0,1.8fr)_minmax(300px,0.72fr)]" : ""}`}>
        {showTaskPanel ? (
          <div className="order-2 space-y-5 xl:order-1">
            {taskResource.data ? (
              <DashboardTasks
                tasks={visibleTasks}
                actionCount={taskActionCount}
                hiddenInHero={hero?.kind === "task" ? 1 : 0}
                wide
              />
            ) : data.currentHomework ? (
              <HomeworkCard homework={data.currentHomework} lastReview={data.lastHomeworkReview} />
            ) : null}
          </div>
        ) : null}
        <div className="order-1 xl:order-2">
          <LeagueMiniWidget />
        </div>
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
  wide,
}: {
  tasks: Awaited<ReturnType<typeof api.studentTasks>>["data"]["items"];
  actionCount: number;
  hiddenInHero: number;
  wide: boolean;
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
      <div className={wide
        ? `grid gap-3 ${tasks.length > 1 ? "md:grid-cols-2" : ""} ${tasks.length > 2 ? "xl:grid-cols-3" : ""}`
        : "space-y-3"}
      >
        {tasks.slice(0, 3).map((task) => <UnifiedTaskCard key={task.id} task={task} compact />)}
      </div>
    </section>
  );
}

function MetricChip({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Star;
  value: string | number;
  label: string;
}) {
  return (
    <div
      className="flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-2 py-2 shadow-sm sm:min-h-14 sm:justify-start sm:rounded-2xl sm:px-3"
      aria-label={`${value} ${label}`}
      title={`${value} ${label}`}
    >
      <Icon size={17} className="shrink-0 text-gold" />
      <span className="min-w-0 text-xs text-stone-500">
        <strong className="text-base text-ink sm:mr-1">{value}</strong>
        <span className="hidden break-words sm:inline">{label}</span>
      </span>
    </div>
  );
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
    <section className="overflow-hidden rounded-[20px] border border-white/10 bg-[#171813] p-3.5 text-white shadow-soft sm:rounded-[24px] sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-gold sm:h-9 sm:w-9 sm:rounded-xl">
              <Icon size={17} />
            </span>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gold sm:text-xs">{hero.eyebrow}</p>
          </div>
          <h2 className="font-display mt-2 break-words text-2xl leading-tight sm:mt-3 sm:text-3xl">{hero.title}</h2>
          {hero.badge ? (
            <span className={`mt-2 inline-flex min-h-6 items-center rounded-md px-2.5 text-[11px] font-black sm:mt-3 sm:min-h-7 sm:rounded-lg sm:px-3 sm:text-xs ${badgeClass}`}>
              {hero.badge.label}
            </span>
          ) : null}
          {hero.subtitle ? <p className="mt-2 line-clamp-1 break-words text-xs leading-5 text-white/70 sm:mt-3 sm:line-clamp-none sm:text-sm sm:leading-6">{hero.subtitle}</p> : null}
          {hero.detail ? (
            <p className={`mt-2 inline-flex items-start gap-2 text-[13px] leading-5 sm:text-sm sm:leading-6 ${hero.badge?.tone === "danger" ? "rounded-xl border border-red-400/20 bg-red-500/10 p-2.5 text-red-50 sm:p-3" : "text-white/60"}`}>
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
    <section className="rounded-[20px] border border-stone-200 bg-[#171813] p-4 text-white shadow-soft sm:rounded-[28px] sm:p-6">
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
          <Link key={lesson.crmClassId} href="/school-lessons?tab=schedule" className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-stone-100 text-stone-600"><School size={19} /></span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-sm text-stone-800">{lesson.title}</strong>
              <span className="mt-1 block text-xs text-stone-500">{formatLessonDate(lesson.date)} · {lesson.startTime}{lesson.teacherName ? ` · ${lesson.teacherName}` : ""}</span>
            </span>
            <ChevronRight size={18} className="text-stone-300" />
          </Link>
        ))}
      </div>
    </section>
  );
}
