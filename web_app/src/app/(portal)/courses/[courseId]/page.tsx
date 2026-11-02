"use client";

import { BookOpen, Check, ChevronRight, CreditCard, LoaderCircle, LockKeyhole, Play, Trophy } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ScreenError } from "@/components/app-error-screen";
import { useAuth } from "@/components/auth-provider";
import { CoursePaywall } from "@/components/course-paywall";
import { EmptyState } from "@/components/data-states";
import { MarkdownContent } from "@/components/markdown-content";
import { ProgressBar } from "@/components/progress-bar";
import { ScreenSkeleton } from "@/components/screen-skeleton";
import { StatusBadge } from "@/components/status-badge";
import { toast } from "@/components/toast";
import { useApiResource } from "@/hooks/use-api-resource";
import { difficultyLabel, flattenCourseLessons } from "@/lib/adapters";
import { api } from "@/lib/api-client";
import { courseAccessApi } from "@/lib/course-access-api";
import {
  courseRewardLine,
  courseStateLine,
  freeLessonsNote,
  isForSale,
  isFreeLesson,
  lessonLockBadge,
  lessonLockHref,
  lessonLockLabel,
  mergeLessonLock,
  saleViewOf,
} from "@/lib/course-access-format";
import { errorToastText } from "@/lib/error-text";
import { formatCount, formatOutOf } from "@/lib/plural";
import { useState } from "react";

const LESSON_FORMS = ["урок", "урока", "уроков"] as const;

async function loadCourse(courseId: string) {
  const course = await api.course(courseId);
  const progress = course.enrollmentStatus ? await api.progress(courseId) : null;
  return { course, progress, lessons: flattenCourseLessons(course, progress?.lessons ?? []) };
}

export default function CourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const resource = useApiResource(() => loadCourse(courseId), [courseId]);
  const [enrolling, setEnrolling] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const { user } = useAuth();

  if (resource.loading && !resource.data) return <ScreenSkeleton variant="detail" label="Открываем курс" />;
  if (resource.error && !resource.data) return <ScreenError message={resource.error} code={resource.errorCode} retry={resource.reload} />;
  if (!resource.data) return <EmptyState title="Курс не найден" description="Возможно, курс больше недоступен." />;

  const { course, progress, lessons } = resource.data;
  const enrolled = Boolean(course.enrollmentStatus);
  const progressPercent = progress?.courseProgressPercent ?? course.progress ?? 0;
  const sale = saleViewOf(course);
  const state = courseStateLine(sale);
  const freeNote = freeLessonsNote(sale);
  const rewardLine = courseRewardLine(user?.productFeatures?.rewardEconomyV2);
  // Stage 4: the server closes lessons for the payment (`locked`); the order of the course is the progress.
  const paymentLocked = new Set(course.modules.flatMap((module) => module.lessons.filter((lesson) => lesson.locked).map((lesson) => lesson.id)));
  const canPay = isForSale(sale) && sale.access?.kind === "none" && !sale.access.fullAccess && !sale.access.pendingPaymentRequest;

  async function handleEnroll() {
    setEnrolling(true);
    try {
      await api.enroll(courseId);
      try {
        resource.setData(await loadCourse(courseId));
        toast.success("Курс добавлен в обучение");
      } catch {
        // Enrolled, but the screen could not be re-read: say so instead of keeping the old state silently.
        toast.error("Нет связи. Обнови экран, когда появится интернет");
      }
    } catch (reason) {
      toast.error(errorToastText(reason, "Не получилось начать обучение. Попробуй ещё раз"));
    } finally {
      setEnrolling(false);
    }
  }

  return (
    <>
      <section className="relative overflow-hidden rounded-[28px] bg-ink p-5 text-white shadow-soft sm:rounded-[34px] sm:p-10">
        <div className="noise absolute inset-0 opacity-20" />
        <div className="relative grid gap-10 lg:grid-cols-[1fr_300px] lg:items-end">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-gold-ink">{difficultyLabel(course.difficultyLevel)} · {formatCount(course.modules.length, ["модуль", "модуля", "модулей"])}</p>
            <h1 className="font-display mt-4 break-words text-4xl leading-tight sm:text-6xl">{course.title}</h1>
            {course.description && (
              <MarkdownContent className="mt-5 max-w-2xl break-words text-white/65 [&_h2]:break-words [&_h2]:text-white [&_h3]:break-words [&_h3]:text-white [&_h4]:break-words [&_h4]:text-white [&_strong]:text-white">
                {course.description}
              </MarkdownContent>
            )}
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
            <p
              className="mb-4 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-gold-ink"
              data-testid="course-state"
              data-tone={state.tone}
            >
              {state.text}
            </p>
            {freeNote ? <p className="-mt-2 mb-4 text-xs font-semibold text-white/55" data-testid="course-free-note">{freeNote}</p> : null}
            {enrolled ? (
              <>
                <div className="mb-3 flex items-end justify-between"><span className="text-sm text-white/55">Прогресс курса</span><span className="font-display text-3xl text-gold-ink">{progressPercent}%</span></div>
                <ProgressBar value={progressPercent} dark />
                <div className="mt-5 flex items-center gap-2 text-xs text-white/55"><BookOpen size={14} /> {formatCount(lessons.length, LESSON_FORMS)}</div>
              </>
            ) : (
              <>
                <p className="text-sm leading-6 text-white/60">Просмотрите программу и начните обучение, когда будете готовы.</p>
                <button onClick={handleEnroll} disabled={enrolling} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-gold px-5 py-3 text-sm font-bold text-white disabled:opacity-60">
                  {enrolling ? <LoaderCircle size={16} className="animate-spin" /> : <Play size={16} fill="currentColor" />}
                  Начать обучение
                </button>
              </>
            )}
            {rewardLine ? <p className="mt-4 flex items-center gap-2 text-xs text-white/55" data-testid="course-reward"><Trophy size={14} className="shrink-0" /> {rewardLine}</p> : null}
            {canPay ? (
              <button
                type="button"
                onClick={() => setShowPaywall((value) => !value)}
                aria-expanded={showPaywall}
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-gold/60 px-5 py-3 text-sm font-bold text-gold-ink transition hover:bg-white/5"
                data-testid="course-pay"
              >
                <CreditCard size={16} /> Оплатить курс
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {showPaywall ? (
        <div className="mt-6" id="course-paywall">
          <CoursePaywall
            courseKey={course.id}
            voice="ty"
            load={() => courseAccessApi.access(course.id)}
            submit={(body) => courseAccessApi.requestPayment(course.id, body)}
            onChanged={() => void resource.reload()}
          />
        </div>
      ) : null}

      {course.modules.length ? course.modules.map((module, moduleIndex) => {
        const moduleLessons = lessons.filter((lesson) => lesson.moduleId === module.id);
        const moduleCompleted = moduleLessons.filter((lesson) => lesson.status === "completed").length;
        return (
          <section className="mt-10" key={module.id}>
            <div className="mb-5 flex items-end justify-between gap-3"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-widest text-gold-ink">Модуль {moduleIndex + 1}</p><h2 className="font-display mt-2 text-3xl">{module.title}</h2></div><span className="shrink-0 whitespace-nowrap text-sm text-stone-500">{formatOutOf(moduleCompleted, moduleLessons.length, ["урока", "уроков", "уроков"])}</span></div>
            <div className="space-y-3">
              {moduleLessons.map((lesson) => {
                const position = lessons.indexOf(lesson) + 1;
                const lock = mergeLessonLock({ paymentLocked: paymentLocked.has(lesson.id), progressStatus: lesson.status, enrolled });
                const locked = lock !== null;
                const lockLabel = lessonLockLabel(lock);
                const lockBadge = lessonLockBadge(lock);
                const free = isFreeLesson({ paymentLocked: paymentLocked.has(lesson.id), course: sale });
                return (
                  <Link
                    // Only the payment alone opens the paywall; a lesson the order still holds leads back to the course.
                    href={lessonLockHref(lock, { courseId: course.id, lessonId: lesson.id })}
                    key={lesson.id}
                    data-testid="course-lesson"
                    data-lock={lock ?? "open"}
                    className={`card-hover flex items-center gap-3 rounded-[24px] border border-stone-200 bg-paper p-4 shadow-soft sm:gap-4 sm:p-5 ${locked ? "opacity-70" : ""}`}
                  >
                    <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${lesson.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-stone-100"}`}>{locked ? <LockKeyhole size={18} /> : lesson.status === "completed" ? <Check size={18} /> : <span className="font-display text-lg">{position}</span>}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display min-w-0 break-words text-xl">{lesson.title}</h3>
                        {free ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800" data-testid="lesson-free-label">бесплатно</span> : null}
                        {lockLabel ? (
                          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-900" data-testid="lesson-lock-label">{lockLabel}</span>
                        ) : (
                          <StatusBadge status={lesson.status} />
                        )}
                        {lockBadge ? <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-600" data-testid="lesson-paid-label">{lockBadge}</span> : null}
                      </div>
                      <p className="mt-1 line-clamp-2 break-words text-sm text-stone-500 sm:line-clamp-1">{lesson.description}</p>
                    </div>
                    <ChevronRight size={18} className="shrink-0 text-stone-300" />
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
