"use client";

import { ArrowRight, CalendarDays, CheckCircle2, Clock3, Flame, Play, Sparkles, Star } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { ProgressBar } from "@/components/progress-bar";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api-client";

export default function DashboardPage() {
  const { user } = useAuth();
  const resource = useApiResource(async () => {
    const [dashboard, news] = await Promise.all([api.dashboard(), api.news()]);
    return { dashboard, news };
  }, []);

  if (resource.loading) return <LoadingState label="Собираем вашу главную страницу" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data?.dashboard.currentCourse) {
    return <EmptyState title="Курс пока не назначен" description="После зачисления на курс здесь появятся уроки, прогресс и баллы." />;
  }

  const { dashboard, news } = resource.data;
  const course = dashboard.currentCourse;
  if (!course) return <EmptyState title="Курс пока не назначен" description="После зачисления на курс здесь появятся уроки, прогресс и баллы." />;
  const nextLesson = dashboard.nextAvailableLesson;
  const latestPost = news[0];
  const firstName = user?.firstName || "ученик";

  return (
    <>
      <div className="mb-9 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-gold">Личный кабинет Maestro</p>
          <h1 className="font-display text-4xl sm:text-5xl">Добрый день, {firstName}</h1>
          <p className="mt-3 text-sm text-stone-500">Продолжим с того места, где остановились?</p>
        </div>
        {nextLesson && (
          <Link href={`/lessons/${nextLesson.id}`} className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-bold text-white">
            Продолжить урок <ArrowRight size={16} />
          </Link>
        )}
      </div>

      <section className="grid gap-5 xl:grid-cols-[1.55fr_0.85fr]">
        <div className="relative min-h-[350px] overflow-hidden rounded-[32px] bg-ink p-7 text-white shadow-soft sm:p-9">
          <div className="noise absolute inset-0 opacity-20" />
          <div className="absolute -bottom-36 -right-24 h-[380px] w-[380px] rounded-full border border-gold/25" />
          <div className="relative flex h-full flex-col">
            <div className="flex items-center justify-between">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/60">{course.direction.title} · {course.difficultyLevel}</span>
              <span className="font-display text-2xl text-gold">{dashboard.progressPercent}%</span>
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
        </div>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
          <div className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft">
            <div className="flex items-start justify-between"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-50 text-gold"><Star size={20} fill="currentColor" /></span><span className="text-xs font-bold text-emerald-700">Реальный баланс</span></div>
            <p className="font-display mt-8 text-4xl">{dashboard.points.toLocaleString("ru-RU")}</p>
            <p className="mt-1 text-sm text-stone-500">баллов Maestro</p>
          </div>
          <div className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft">
            <div className="flex items-start justify-between"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-orange-50 text-orange-500"><Flame size={20} /></span><span className="text-xs font-bold text-stone-400">Пройдено</span></div>
            <p className="font-display mt-8 text-4xl">{dashboard.completedLessonsCount}</p>
            <p className="mt-1 text-sm text-stone-500">завершенных уроков</p>
          </div>
        </div>
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="card-hover rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft">
          <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">Ближайшее занятие</p><CalendarDays size={18} className="text-gold" /></div>
          <p className="font-display mt-8 text-3xl">Расписание появится позже</p>
          <p className="mt-4 text-sm text-stone-500">Модуль расписания пока не подключен.</p>
        </div>
        <div className="card-hover rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft">
          <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">Следующий урок</p><Clock3 size={18} className="text-gold" /></div>
          <p className="font-display mt-8 text-3xl">{nextLesson?.title ?? "Все доступные уроки пройдены"}</p>
          <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-amber-800"><Sparkles size={15} /> {nextLesson?.status ?? "Нет активного урока"}</p>
        </div>
        {latestPost ? (
          <Link href="/board" className="card-hover rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft">
            <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">Последнее на доске</p><ArrowRight size={18} className="text-gold" /></div>
            <p className="font-display mt-8 text-3xl">{latestPost.title}</p>
            <p className="mt-4 line-clamp-2 text-sm leading-6 text-stone-500">{latestPost.excerpt}</p>
          </Link>
        ) : <div className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft"><p className="font-display text-3xl">Новостей пока нет</p></div>}
      </section>

      {nextLesson && (
        <section className="mt-10">
          <div className="mb-5 flex items-center justify-between"><h2 className="font-display text-3xl">Продолжить обучение</h2><Link href="/courses" className="text-sm font-bold">Все курсы</Link></div>
          <Link href={`/lessons/${nextLesson.id}`} className="card-hover flex flex-col gap-5 rounded-[28px] border border-stone-200 bg-paper p-5 shadow-soft sm:flex-row sm:items-center">
            <span className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-[#715844] text-white"><Play fill="currentColor" /></span>
            <div className="flex-1"><p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">Следующий доступный урок</p><h3 className="font-display mt-1 text-2xl">{nextLesson.title}</h3><p className="mt-2 text-sm text-stone-500">Откройте урок, чтобы продолжить обучение.</p></div>
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-700"><CheckCircle2 size={18} /> {nextLesson.status}</div>
          </Link>
        </section>
      )}
    </>
  );
}
