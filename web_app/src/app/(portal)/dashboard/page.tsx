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
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api-client";
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

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {data.currentHomework ? (
          <HomeworkCard homework={data.currentHomework} lastReview={data.lastHomeworkReview} />
        ) : null}
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
  return (
    <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><CircleDot size={21} /></span>
        <strong className="font-display text-3xl text-gold">{plan.progress.percent}%</strong>
      </div>
      <p className="mt-6 text-xs font-black uppercase tracking-[0.18em] text-stone-400">Фокус {monthTitle(plan.month)}</p>
      <h2 className="font-display mt-2 text-3xl leading-tight">{plan.goal}</h2>
      {plan.expectedResult ? <p className="mt-3 text-sm leading-6 text-stone-600">{plan.expectedResult}</p> : null}
      <div className="mt-5">
        <ProgressBar value={plan.progress.percent} />
        <p className="mt-2 text-xs text-stone-500">
          {plan.progress.completed} из {plan.progress.total} тем освоено
          {plan.progress.inProgress ? ` · ${plan.progress.inProgress} в работе` : ""}
        </p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {plan.items.slice(0, 4).map((item) => (
          <span key={item.id} className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${item.status === "completed" ? "bg-emerald-50 text-emerald-800" : item.status === "in_progress" ? "bg-amber-50 text-amber-900" : "bg-stone-100 text-stone-500"}`}>
            {item.status === "completed" ? "✓ " : ""}{item.title}
          </span>
        ))}
      </div>
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
