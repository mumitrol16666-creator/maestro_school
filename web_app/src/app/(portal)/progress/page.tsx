"use client";

import { CheckCircle2, Clock3, Star } from "lucide-react";
import Link from "next/link";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { ProgressBar } from "@/components/progress-bar";
import { StatusBadge } from "@/components/status-badge";
import { useApiResource } from "@/hooks/use-api-resource";
import { normalizeLessonStatus } from "@/lib/adapters";
import { api } from "@/lib/api-client";

export default function ProgressPage() {
  const resource = useApiResource(() => api.progress(), []);

  if (resource.loading) return <LoadingState label="Загружаем историю обучения" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data) return null;

  const { lessons, points, pointsHistory, enrollments } = resource.data;
  if (!enrollments.length && !pointsHistory.length) {
    return (
      <EmptyState
        title="История пока пустая"
        description="После начала обучения здесь появятся курсы, пройденные уроки и начисления баллов."
      />
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Обучение"
        title="История обучения"
        description="Онлайн-курсы и последние начисления учебных баллов."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="space-y-6" aria-label="Курсы и уроки">
          {enrollments.length ? enrollments.map((enrollment) => {
            const courseLessons = lessons.filter((item) => item.lesson.module.courseId === enrollment.courseId);
            const completed = courseLessons.filter((item) => item.status === "completed").length;
            const percent = courseLessons.length ? Math.round((completed / courseLessons.length) * 100) : 0;

            return (
              <article key={enrollment.id} className="rounded-[30px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
                <div className="flex flex-col gap-3 border-b border-stone-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-widest text-gold">
                      {enrollment.course.direction.title}
                    </p>
                    <h2 className="font-display mt-2 text-3xl text-pretty sm:text-4xl">
                      <Link href={`/courses/${enrollment.courseId}`} className="hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold">
                        {enrollment.course.title}
                      </Link>
                    </h2>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-stone-500">
                    {completed} из {courseLessons.length} уроков
                  </p>
                </div>

                <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
                  <ProgressBar value={percent} />
                  <span className="font-display text-2xl tabular-nums">{percent}%</span>
                </div>

                {courseLessons.length ? (
                  <div className="mt-7 divide-y divide-stone-200 border-y border-stone-200">
                    {courseLessons.map((item) => {
                      const status = normalizeLessonStatus(item.status);
                      const href = status === "locked"
                        ? `/courses/${enrollment.courseId}`
                        : `/lessons/${item.lessonId}`;

                      return (
                        <Link
                          href={href}
                          key={item.lessonId}
                          className="group flex min-w-0 items-center gap-3 py-4 transition-colors hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold sm:gap-4"
                        >
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-stone-100 text-gold">
                            {status === "completed"
                              ? <CheckCircle2 size={18} aria-hidden="true" />
                              : <Clock3 size={18} aria-hidden="true" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-display text-lg text-ink group-hover:text-gold sm:text-xl">
                              {item.lesson.title}
                            </span>
                            <span className="mt-1 block truncate text-xs text-stone-500">
                              {item.lesson.module.title}
                            </span>
                          </span>
                          <StatusBadge status={status} />
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-7 border-y border-stone-200 py-6 text-sm text-stone-500">
                    Уроки курса ещё не открыты.
                  </p>
                )}
              </article>
            );
          }) : (
            <div className="border-y border-stone-200 py-8">
              <h2 className="font-display text-2xl">Онлайн-курсы пока не начаты</h2>
              <p className="mt-2 text-sm leading-6 text-stone-500">
                История начислений учебных баллов остаётся доступной ниже.
              </p>
            </div>
          )}
        </section>

        <aside className="self-start overflow-hidden rounded-[28px] border border-stone-200 bg-paper shadow-soft" data-testid="learning-points-history">
          <div className="bg-ink p-6 text-white">
            <Star size={22} className="text-gold" fill="currentColor" aria-hidden="true" />
            <p className="font-display mt-6 text-4xl tabular-nums">{points.toLocaleString("ru-RU")}</p>
            <p className="mt-1 text-sm text-white/60">учебных баллов</p>
          </div>
          <div className="p-6">
            <div className="flex items-end justify-between gap-3">
              <h2 className="font-display text-2xl">Начисления</h2>
              <span className="text-xs font-bold text-stone-400">Последние 10</span>
            </div>
            <div className="mt-4 divide-y divide-stone-200 border-y border-stone-200">
              {pointsHistory.length ? pointsHistory.slice(0, 10).map((item) => {
                const positive = item.amount >= 0;
                return (
                  <div key={item.id} className="flex items-start justify-between gap-3 py-4">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-bold text-ink">{item.reason}</p>
                      <time dateTime={item.createdAt} className="mt-1 block text-xs text-stone-400">
                        {new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" }).format(new Date(item.createdAt))}
                      </time>
                    </div>
                    <span className={`shrink-0 text-sm font-black tabular-nums ${positive ? "text-emerald-700" : "text-red-700"}`}>
                      {positive ? "+" : "−"}{Math.abs(item.amount)}
                    </span>
                  </div>
                );
              }) : (
                <p className="py-6 text-sm text-stone-500">Начислений пока нет.</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
