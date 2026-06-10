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
  if (resource.loading) return <LoadingState label="Загружаем прогресс" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data?.enrollments.length) return <EmptyState title="Прогресс пока пуст" description="После начала обучения здесь появятся уроки и история баллов." />;

  const { lessons, points, pointsHistory, enrollments } = resource.data;

  return (
    <>
      <PageHeader eyebrow="Учебный путь" title="Прогресс" description="Статусы уроков и история начисления баллов из Learning Engine." />
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <section className="space-y-6">
          {enrollments.map((enrollment) => {
            const courseLessons = lessons.filter((item) => item.lesson.module.courseId === enrollment.courseId);
            const completed = courseLessons.filter((item) => item.status === "completed").length;
            const percent = courseLessons.length ? Math.round((completed / courseLessons.length) * 100) : 0;
            return (
              <div key={enrollment.id} className="rounded-[30px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
                <div className="mb-6 flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-gold">{enrollment.course.direction.title}</p><Link href={`/courses/${enrollment.courseId}`} className="font-display mt-2 block text-4xl">{enrollment.course.title}</Link></div><p className="text-sm text-stone-400">{completed} из {courseLessons.length} уроков</p></div>
                <div className="grid grid-cols-[1fr_auto] items-center gap-4"><ProgressBar value={percent} /><span className="font-display text-2xl">{percent}%</span></div>
                <div className="mt-8 space-y-3">
                  {courseLessons.map((item) => {
                    const status = normalizeLessonStatus(item.status);
                    return <Link href={status === "locked" ? `/courses/${enrollment.courseId}` : `/lessons/${item.lessonId}`} key={item.lessonId} className="card-hover flex items-center gap-4 rounded-2xl border border-stone-200 p-4"><span className="grid h-11 w-11 place-items-center rounded-xl bg-stone-100">{status === "completed" ? <CheckCircle2 size={18} className="text-emerald-700" /> : <Clock3 size={18} className="text-gold" />}</span><span className="min-w-0 flex-1"><span className="block truncate font-display text-xl">{item.lesson.title}</span><span className="mt-1 block text-xs text-stone-400">{item.lesson.module.title}</span></span><StatusBadge status={status} /></Link>;
                  })}
                </div>
              </div>
            );
          })}
        </section>
        <aside className="space-y-5">
          <div className="rounded-[28px] bg-ink p-6 text-white shadow-soft"><Star size={22} className="text-gold" fill="currentColor" /><p className="font-display mt-8 text-4xl">{points.toLocaleString("ru-RU")}</p><p className="mt-1 text-sm text-white/50">баллов Maestro</p></div>
          <div className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft"><p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">История баллов</p><div className="mt-5 space-y-4">{pointsHistory.length ? pointsHistory.slice(0, 5).map((item) => <div key={item.id} className="flex items-start justify-between gap-3 border-b border-stone-100 pb-4 last:border-0"><div><p className="text-sm font-bold">{item.reason}</p><p className="mt-1 text-xs text-stone-400">{new Date(item.createdAt).toLocaleDateString("ru-RU")}</p></div><span className="text-sm font-bold text-emerald-700">+{item.amount}</span></div>) : <p className="text-sm text-stone-500">Начислений пока нет.</p>}</div></div>
        </aside>
      </div>
    </>
  );
}
