"use client";

import { ArrowRight, CheckCircle2, Clock3, Coins, Flame, Play, Sparkles, Star, Trophy } from "lucide-react";
import { AchievementsWall } from "@/components/achievements-wall";
import { DashboardWelcome } from "@/components/dashboard-welcome";
import { FounderMessage } from "@/components/founder-message";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { ProgressBar } from "@/components/progress-bar";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api-client";
import { lessonStatusLabels } from "@/lib/ui";
import { difficultyLabel, normalizeLessonStatus, toCourse } from "@/lib/adapters";
import { getSchoolAlertCounts } from "@/lib/student-school-alerts";

export default function DashboardPage() {
  const { user } = useAuth();
  const resource = useApiResource(async () => {
    const [dashboard, news, achievements, courses, offlineSummary] = await Promise.all([
      api.dashboard(),
      api.news(),
      api.achievements(),
      api.courses(),
      api.studentOfflineSummary().catch(() => null),
    ]);
    return {
      dashboard,
      news,
      achievements,
      courses: courses.map((course, index) => toCourse(course, index)),
      offlineSummary,
    };
  }, []);

  if (resource.loading) return <LoadingState label="Собираем вашу главную страницу" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  const data = resource.data;
  if (!data) return <ErrorState message="Не удалось загрузить данные" retry={resource.reload} />;
  if (!data.dashboard.currentCourse) {
    const { dashboard, news, achievements, courses } = data;
    return (
      <DashboardWelcome
        points={dashboard.points}
        courses={courses}
        news={news}
        achievements={achievements.data}
        earnedCount={achievements.meta?.earnedCount ?? 0}
        totalAchievements={achievements.meta?.totalCount ?? achievements.data.length}
      />
    );
  }

  const { dashboard, news, achievements, offlineSummary } = data;
  const course = dashboard.currentCourse;
  if (!course) return <EmptyState title="Курс пока не назначен" description="После зачисления на курс здесь появятся уроки, прогресс и баллы." />;
  const nextLesson = dashboard.nextAvailableLesson;
  const latestPost = news[0];
  const firstName = user?.firstName || "ученик";

  const schoolAlerts = user && offlineSummary ? getSchoolAlertCounts(user.id, offlineSummary) : null;

  return (
    <>
      {schoolAlerts && schoolAlerts.homework > 0 && (
        <div className="mb-6 rounded-[24px] border border-amber-200 bg-amber-50 p-5 flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-amber-100 text-gold flex-shrink-0">
              <Trophy size={20} />
            </span>
            <div>
              <p className="text-sm font-bold text-amber-950">Новые домашние задания!</p>
              <p className="text-xs text-stone-500 mt-1">
                Преподаватели оставили вам {schoolAlerts.homework} новых домашних заданий по офлайн-урокам.
              </p>
            </div>
          </div>
          <Link
            href="/school-lessons"
            className="rounded-xl bg-gold px-4 py-2.5 text-xs font-bold text-white transition hover:bg-gold/80 flex-shrink-0"
          >
            Посмотреть ДЗ
          </Link>
        </div>
      )}

      <div className="mb-9 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-gold">Личный кабинет Maestro</p>
          <h1 className="font-display text-4xl sm:text-5xl">Добрый день, {firstName}</h1>
          <p className="mt-3 text-sm text-stone-500">Продолжим с того места, где остановились?</p>
        </div>
        {nextLesson && (
          <Link href={`/lessons/${nextLesson.id}`} className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-stone-800 hover:shadow-soft">
            Продолжить урок <ArrowRight size={16} />
          </Link>
        )}
      </div>

      <section className="grid gap-5 xl:grid-cols-[1.55fr_0.85fr]">
        <Link href={`/courses/${course.id}`} className="card-hover group relative block min-h-[350px] overflow-hidden rounded-[32px] bg-ink p-7 text-white shadow-soft sm:p-9">
          <div className="noise absolute inset-0 opacity-20" />
          <div className="absolute -bottom-36 -right-24 h-[380px] w-[380px] rounded-full border border-gold/25" />
          <div className="relative flex h-full flex-col">
            <div className="flex items-center justify-between">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/60">{course.direction.title} · {difficultyLabel(course.difficultyLevel)}</span>
              <span className="flex items-center gap-2 font-display text-2xl text-gold">
                {dashboard.progressPercent}%
                <ArrowRight size={18} className="opacity-0 transition group-hover:opacity-100" />
              </span>
            </div>
            <div className="my-auto max-w-xl py-10">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-gold">Текущий курс</p>
              <h2 className="font-display text-5xl leading-none sm:text-6xl">{course.title}</h2>
              <p className="mt-5 max-w-lg text-sm leading-6 text-white/55">{course.description}</p>
            </div>
            <div>
              <div className="mb-3 flex justify-between text-xs text-white/50"><span>Прогресс курса</span><span>{dashboard.completedLessonsCount} из {dashboard.totalLessonsCount} уроков</span></div>
              <ProgressBar value={dashboard.progressPercent} dark />
            </div>
          </div>
        </Link>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
          <div className="premium-surface rounded-[28px] p-6 shadow-soft">
            <div className="flex items-start justify-between"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-50 text-gold ring-1 ring-gold/10"><Star size={20} fill="currentColor" /></span><span className="text-xs font-bold text-emerald-700">Баланс</span></div>
            <p className="font-display mt-8 text-4xl">{dashboard.points.toLocaleString("ru-RU")}</p>
            <p className="mt-1 text-sm text-stone-500">баллов Maestro</p>
            <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900">
              <Coins size={14} />
              {(user?.coins ?? 0).toLocaleString("ru-RU")} Maestro Coins
            </p>
          </div>
          <div className="premium-surface rounded-[28px] p-6 shadow-soft">
            <div className="flex items-start justify-between"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-orange-50 text-orange-500 ring-1 ring-orange-200/60"><Flame size={20} /></span><span className="text-xs font-bold text-stone-400">Пройдено</span></div>
            <p className="font-display mt-8 text-4xl">{dashboard.completedLessonsCount}</p>
            <p className="mt-1 text-sm text-stone-500">завершённых уроков</p>
          </div>
        </div>
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-2">
        {nextLesson ? (
          <Link href={`/lessons/${nextLesson.id}`} className="card-hover rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft">
            <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">Следующий урок</p><ArrowRight size={18} className="text-gold" /></div>
            <p className="font-display mt-8 text-3xl">{nextLesson.title}</p>
            <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-amber-800"><Sparkles size={15} /> {lessonStatusLabels[normalizeLessonStatus(nextLesson.status)]}</p>
          </Link>
        ) : (
          <div className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft">
            <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">Следующий урок</p><Clock3 size={18} className="text-stone-300" /></div>
            <p className="font-display mt-8 text-3xl">Все доступные уроки пройдены</p>
            <p className="mt-4 text-sm text-stone-500">Нет активного урока</p>
          </div>
        )}
        {latestPost ? (
          <Link href="/board" className="card-hover rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft">
            <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">Последнее на доске</p><ArrowRight size={18} className="text-gold" /></div>
            <p className="font-display mt-8 text-3xl">{latestPost.title}</p>
            <p className="mt-4 line-clamp-2 text-sm leading-6 text-stone-500">{latestPost.excerpt}</p>
          </Link>
        ) : <div className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft"><p className="font-display text-3xl">Новостей пока нет</p></div>}
      </section>

      <section className="mt-10 rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-50 text-gold">
              <Trophy size={20} />
            </span>
            <div>
              <h2 className="font-display text-3xl">Достижения</h2>
              <p className="mt-1 text-sm text-stone-500">
                {achievements.meta?.earnedCount ?? 0} из {achievements.meta?.totalCount ?? achievements.data.length} получено
              </p>
            </div>
          </div>
          <Link href="/progress" className="text-sm font-bold text-gold hover:underline">
            Все достижения
          </Link>
        </div>
        <AchievementsWall achievements={achievements.data} compact />
      </section>

      {nextLesson && (
        <section className="mt-10">
          <div className="mb-5 flex items-center justify-between"><h2 className="font-display text-3xl">Продолжить обучение</h2><Link href="/courses" className="text-sm font-bold">Все курсы</Link></div>
          <Link href={`/lessons/${nextLesson.id}`} className="card-hover flex flex-col gap-5 rounded-[28px] border border-stone-200 bg-paper p-5 shadow-soft sm:flex-row sm:items-center">
            <span className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-[#715844] text-white"><Play fill="currentColor" /></span>
            <div className="flex-1"><p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">Следующий доступный урок</p><h3 className="font-display mt-1 text-2xl">{nextLesson.title}</h3><p className="mt-2 text-sm text-stone-500">Откройте урок, чтобы продолжить обучение.</p></div>
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-700"><CheckCircle2 size={18} /> {lessonStatusLabels[normalizeLessonStatus(nextLesson.status)]}</div>
          </Link>
        </section>
      )}

      <FounderMessage className="mt-10" />
    </>
  );
}
