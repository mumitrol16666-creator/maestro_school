"use client";

import { ArrowLeft, BookOpen, Check, ChevronRight, LoaderCircle, LockKeyhole, Play, Trophy } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { ProgressBar } from "@/components/progress-bar";
import { StatusBadge } from "@/components/status-badge";
import { useApiResource } from "@/hooks/use-api-resource";
import { difficultyLabel, flattenCourseLessons } from "@/lib/adapters";
import { api } from "@/lib/api-client";
import { ApiError } from "@/lib/api-client";
import { useState } from "react";

export default function CourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const resource = useApiResource(async () => {
    const course = await api.course(courseId);
    const progress = course.enrollmentStatus ? await api.progress(courseId) : null;
    return { course, progress, lessons: flattenCourseLessons(course, progress?.lessons ?? []) };
  }, [courseId]);
  const [enrolling, setEnrolling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (resource.loading) return <LoadingState label="Открываем курс" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data) return <EmptyState title="Курс не найден" description="Возможно, курс больше недоступен." />;

  const { course, progress, lessons } = resource.data;
  const enrolled = Boolean(course.enrollmentStatus);
  const completedCount = lessons.filter((lesson) => lesson.status === "completed").length;
  const progressPercent = progress?.courseProgressPercent ?? course.progress ?? 0;

  async function handleEnroll() {
    setEnrolling(true);
    setActionError(null);
    try {
      await api.enroll(courseId);
      await resource.reload();
    } catch (reason) {
      setActionError(reason instanceof ApiError ? reason.message : "Не удалось начать обучение");
    } finally {
      setEnrolling(false);
    }
  }

  return (
    <>
      <Link href="/courses" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-stone-500"><ArrowLeft size={16} /> Назад к курсам</Link>
      <section className="relative overflow-hidden rounded-[34px] bg-ink p-7 text-white shadow-soft sm:p-10">
        <div className="noise absolute inset-0 opacity-20" />
        <div className="relative grid gap-10 lg:grid-cols-[1fr_300px] lg:items-end">
          <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-gold">{difficultyLabel(course.difficultyLevel)} · {course.modules.length} модуля</p><h1 className="font-display mt-4 text-5xl sm:text-6xl">{course.title}</h1><p className="mt-5 max-w-2xl text-sm leading-6 text-white/55">{course.description}</p></div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            {enrolled ? (
              <>
            <div className="mb-3 flex items-end justify-between"><span className="text-sm text-white/55">Прогресс курса</span><span className="font-display text-3xl text-gold">{progressPercent}%</span></div>
            <ProgressBar value={progressPercent} dark />
            <div className="mt-5 grid grid-cols-2 gap-3 text-xs text-white/55"><span className="flex items-center gap-2"><BookOpen size={14} /> {lessons.length} уроков</span><span className="flex items-center gap-2"><Trophy size={14} /> {progress?.points ?? 0} баллов</span></div>
              </>
            ) : (
              <>
                <p className="text-sm leading-6 text-white/60">Просмотрите программу и начните обучение, когда будете готовы.</p>
                <button onClick={handleEnroll} disabled={enrolling} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gold px-5 py-3 text-sm font-bold text-white disabled:opacity-60">
                  {enrolling ? <LoaderCircle size={16} className="animate-spin" /> : <Play size={16} fill="currentColor" />}
                  Начать обучение
                </button>
              </>
            )}
          </div>
        </div>
      </section>
      {actionError && <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{actionError}</p>}

      {course.modules.length ? course.modules.map((module) => {
        const moduleLessons = lessons.filter((lesson) => lesson.moduleId === module.id);
        return (
          <section className="mt-10" key={module.id}>
            <div className="mb-5 flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-gold">Модуль {module.sortOrder}</p><h2 className="font-display mt-2 text-3xl">{module.title}</h2></div><span className="text-sm text-stone-400">{completedCount} из {lessons.length} уроков</span></div>
            <div className="space-y-3">
              {moduleLessons.map((lesson) => {
                const locked = lesson.status === "locked";
                return (
                  <Link href={locked ? `/courses/${course.id}` : `/lessons/${lesson.id}`} key={lesson.id} className={`card-hover flex items-center gap-4 rounded-[24px] border border-stone-200 bg-paper p-4 shadow-soft sm:p-5 ${locked ? "opacity-55" : ""}`}>
                    <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${lesson.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-stone-100"}`}>{locked ? <LockKeyhole size={18} /> : lesson.status === "completed" ? <Check size={18} /> : <span className="font-display text-lg">{lesson.order}</span>}</span>
                    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-display text-xl">{lesson.title}</h3><StatusBadge status={lesson.status} /></div><p className="mt-1 line-clamp-1 text-sm text-stone-500">{lesson.description}</p></div>
                    <ChevronRight size={18} className="text-stone-300" />
                  </Link>
                );
              })}
            </div>
          </section>
        );
      }) : <div className="mt-8"><EmptyState title="В курсе пока нет уроков" description="Материалы появятся после публикации." /></div>}
    </>
  );
}
