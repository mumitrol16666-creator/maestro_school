"use client";

import {
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Coins,
  MapPin,
  ListTodo,
  School,
  Sparkles,
  Star,
  Trophy,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { ErrorState, LoadingState } from "@/components/data-states";
import { ProgressBar } from "@/components/progress-bar";
import { UnifiedTaskCard } from "@/components/unified-task-card";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api-client";
import { weeklyLeagueApi } from "@/lib/weekly-league-api";
import { currentAqtobeMonth } from "@/lib/aqtobe-month";
import type { SchoolOfflineLesson } from "@/types/school-offline";
import type { StudentHomeHomework, StudentHomeMonthlyPlan } from "@/types/api";

const monthNames = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
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
  const taskResource = useApiResource(() => api.studentTasks({ scope: "active", limit: 3 }), []);
  if (resource.loading) return <LoadingState label="Собираем вашу учебную главную" />;
  if (resource.error || !resource.data) {
    return <ErrorState message={resource.error ?? "Не удалось загрузить главную"} retry={resource.reload} />;
  }

  const data = resource.data;
  const school = data.school;
  const upcoming = school?.upcomingLessons ?? [];
  const nearestLesson = upcoming[0] ?? null;
  const plan = data.monthlyPlans[0] ?? null;
  const hasLearningData = Boolean(nearestLesson || data.currentHomework || plan || data.dashboard.currentCourse);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-gold">Твоя учебная неделя</p>
          <h1 className="font-display mt-2 text-4xl leading-tight sm:text-5xl">
            Привет, {user?.firstName || "ученик"}!
          </h1>
          <p className="mt-2 text-sm text-stone-500">Здесь только то, что важно сейчас.</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <span className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-700">
            <Trophy size={15} className="text-gold" />
            {data.dashboard.rank.current.title}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-700">
            <Star size={15} className="text-gold" fill="currentColor" />
            {data.dashboard.points.toLocaleString("ru-RU")} баллов
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-700">
            <Coins size={15} className="text-amber-600" />
            {(user?.coins ?? 0).toLocaleString("ru-RU")} Coins
          </span>
        </div>
      </header>

      {nearestLesson ? <NearestLessonCard lesson={nearestLesson} /> : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-2 items-start">
        <div className="space-y-5">
          {taskResource.data ? (
            <DashboardTasks
              tasks={taskResource.data.data.items.filter((task) => task.actionRequired)}
              actionCount={taskResource.data.data.counts.actionRequired}
            />
          ) : data.currentHomework ? (
            <HomeworkCard homework={data.currentHomework} lastReview={data.lastHomeworkReview} />
          ) : null}
          <LeagueMiniWidget />
        </div>
        {plan ? <MonthlyPlanCard plan={plan} /> : null}
      </div>

      {upcoming.length > 1 ? <UpcomingLessons lessons={upcoming.slice(1, 4)} /> : null}

      {data.dashboard.currentCourse ? (
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
}: {
  tasks: Awaited<ReturnType<typeof api.studentTasks>>["data"]["items"];
  actionCount: number;
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

  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-gold"><ListTodo size={16} /> Ближайшие задания</p>
          <h2 className="font-display mt-1 text-2xl">Нужно сделать · {actionCount}</h2>
        </div>
        <Link href="/tasks" className="text-xs font-black text-stone-500">Все задания →</Link>
      </div>
      <div className="space-y-3">
        {tasks.slice(0, 3).map((task) => <UnifiedTaskCard key={task.id} task={task} compact />)}
      </div>
    </section>
  );
}

function NearestLessonCard({ lesson }: { lesson: SchoolOfflineLesson }) {
  return (
    <Link href="/school-lessons?tab=schedule" className="group block overflow-hidden rounded-[30px] bg-ink p-6 text-white shadow-soft sm:p-8">
      <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-gold">{formatLessonDate(lesson.date)} · урок в школе</p>
          <h2 className="font-display mt-3 text-4xl leading-tight sm:text-5xl">{lesson.title}</h2>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/70">
            <span className="inline-flex items-center gap-2"><CalendarDays size={16} /> {lesson.startTime}–{lesson.endTime}</span>
            {lesson.teacherName ? <span className="inline-flex items-center gap-2"><UserRound size={16} /> {lesson.teacherName}</span> : null}
            {lesson.roomName ? <span className="inline-flex items-center gap-2"><MapPin size={16} /> {lesson.roomName}</span> : null}
          </div>
        </div>
        <span className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-gold px-5 text-sm font-black text-ink transition group-hover:translate-x-1">
          Детали урока <ChevronRight size={18} />
        </span>
      </div>
    </Link>
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
    <section className="rounded-[28px] border border-stone-200 bg-[#171813] p-6 text-white shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gold/15 text-gold">
            <Trophy size={20} />
          </span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gold">Недельная лига</p>
            <h3 className="font-display text-lg">Лидеры недели</h3>
          </div>
        </div>
        <Link
          href="/league"
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-white/80 transition hover:bg-white/10 hover:text-white"
        >
          Таблица →
        </Link>
      </div>

      {top3.length > 0 ? (
        <div className="mt-4 space-y-2">
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
        <p className="mt-4 text-xs text-white/50">Неделя только началась. Сделай первое действие!</p>
      )}

      <div className="mt-4 border-t border-white/10 pt-3">
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

function MonthlyPlanCard({ plan }: { plan: StudentHomeMonthlyPlan }) {
  const currentMonth = currentAqtobeMonth();
  const isFuture = plan.month > currentMonth;

  return (
    <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-soft sm:p-7">
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-50 text-gold">
          <CircleDot size={22} />
        </span>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-black ${
          isFuture ? "bg-violet-50 text-violet-900 border border-violet-200" : "bg-amber-50 text-amber-950"
        }`}>
          <Sparkles size={13} className={isFuture ? "text-violet-600" : "text-gold"} />
          {isFuture ? "План на следующий месяц" : `${plan.progress.percent}% освоено`}
        </span>
      </div>

      <p className="mt-5 text-xs font-black uppercase tracking-[0.2em] text-gold">
        Учебный план · {monthTitle(plan.month)} {isFuture ? "(Старт скоро)" : ""}
      </p>
      <h2 className="font-display mt-2 text-3xl leading-tight text-ink sm:text-4xl">
        {plan.goal}
      </h2>

      {!isFuture ? (
        <div className="mt-5">
          <ProgressBar value={plan.progress.percent} />
          <div className="mt-2.5 flex items-center justify-between text-xs font-semibold text-stone-500">
            <span>{plan.progress.completed} из {plan.progress.total} тем освоено</span>
            {plan.progress.inProgress ? (
              <span className="text-amber-900 font-bold">{plan.progress.inProgress} в активной работе</span>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs font-semibold text-violet-800">
          Преподаватель заранее подготовил программу на {monthTitle(plan.month).toLowerCase()}. Всего в плане {plan.progress.total} тем.
        </p>
      )}

      {plan.items.length ? (
        <div className="mt-5 space-y-2">
          <p className="text-[11px] font-black uppercase tracking-wider text-stone-400">Темы и произведения:</p>
          <div className="grid gap-2">
            {plan.items.map((item) => (
              <div
                key={item.id}
                className={`flex items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5 text-xs font-bold transition ${
                  item.status === "completed"
                    ? "border border-emerald-100 bg-emerald-50/70 text-emerald-900"
                    : item.status === "in_progress"
                    ? "border border-amber-200 bg-amber-50/70 text-amber-950"
                    : "border border-stone-100 bg-stone-50 text-stone-600"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-black ${
                    item.status === "completed"
                      ? "bg-emerald-600 text-white"
                      : item.status === "in_progress"
                      ? "bg-amber-500 text-white"
                      : "bg-stone-200 text-stone-600"
                  }`}>
                    {item.status === "completed" ? "✓" : item.status === "in_progress" ? "⏳" : "·"}
                  </span>
                  <span className="truncate">{item.title}</span>
                </div>
                <span className="shrink-0 text-[10px] font-extrabold uppercase">
                  {item.status === "completed"
                    ? "Освоено"
                    : item.status === "in_progress"
                    ? "В работе"
                    : "Запланировано"}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {plan.checkpoint ? (
        <div className="mt-5 rounded-2xl border border-amber-100 bg-amber-50/50 p-4">
          <p className="text-[10px] font-black uppercase tracking-wider text-amber-900">
            🏁 Финал месяца (к чему идём):
          </p>
          <p className="mt-1 text-xs font-semibold leading-5 text-amber-950">
            {plan.checkpoint}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function UpcomingLessons({ lessons }: { lessons: SchoolOfflineLesson[] }) {
  return (
    <section className="mt-6 rounded-[28px] border border-stone-200 bg-white p-6 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-stone-400">Дальше по расписанию</p>
          <h2 className="font-display mt-1 text-3xl">Ближайшие уроки</h2>
        </div>
        <Link href="/school-lessons?tab=schedule" className="text-sm font-bold text-gold">Все уроки</Link>
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
