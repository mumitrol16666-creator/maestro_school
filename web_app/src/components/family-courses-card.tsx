"use client";

import { BookOpen, CreditCard } from "lucide-react";
import { useEffect, useState } from "react";
import { CoursePaywall } from "@/components/course-paywall";
import { ErrorState } from "@/components/data-states";
import { ScreenSkeleton } from "@/components/screen-skeleton";
import { useApiResource } from "@/hooks/use-api-resource";
import { courseAccessApi, type ChildCourse } from "@/lib/course-access-api";
import {
  childCourseSort,
  courseStateLine,
  freeLessonsNote,
  isForSale,
  type CourseStateTone,
} from "@/lib/course-access-format";

const TONE_STYLES: Record<CourseStateTone, string> = {
  free: "bg-emerald-50 text-emerald-800",
  school: "bg-emerald-50 text-emerald-800",
  active: "bg-emerald-50 text-emerald-800",
  pending: "bg-amber-50 text-amber-900",
  price: "bg-stone-100 text-ink",
};

/** A parent can pay for a course the child does not hold and nobody has paid for yet. */
function canPayFor(course: ChildCourse): boolean {
  return isForSale(course) && course.access.kind === "none" && !course.access.fullAccess && !course.access.pendingPaymentRequest;
}

/**
 * Stage 4, the family page: «Курсы {ребёнка}» with the state of every course and «Оплатить курс»,
 * which opens the same paywall as the student's, spoken to the parent («вы»).
 */
export function FamilyCoursesCard({
  child,
  highlighted = false,
}: {
  child: { id: string; firstName: string };
  highlighted?: boolean;
}) {
  const resource = useApiResource(() => courseAccessApi.childCourses(child.id), [child.id]);
  const [openCourseId, setOpenCourseId] = useState<string | null>(null);

  useEffect(() => {
    if (!highlighted || !resource.data) return;
    document.getElementById("family-courses")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [highlighted, resource.data]);

  const courses = [...(resource.data ?? [])].sort(childCourseSort);

  return (
    <section
      id="family-courses"
      className={`scroll-mt-24 border-t-2 border-gold bg-paper p-5 shadow-soft sm:p-7 ${highlighted ? "ring-2 ring-gold" : ""}`}
      data-testid="family-courses"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.17em] text-gold-ink">Онлайн-обучение</p>
          <h2 className="font-display mt-2 break-words text-3xl">Курсы {child.firstName}</h2>
        </div>
        <BookOpen className="shrink-0 text-gold-ink" />
      </div>

      {resource.loading && !resource.data ? (
        <div className="mt-5"><ScreenSkeleton variant="section" label="Загружаем курсы" /></div>
      ) : resource.error && !resource.data ? (
        <div className="mt-5"><ErrorState message={resource.error} retry={resource.reload} /></div>
      ) : courses.length ? (
        <ul className="mt-5 space-y-3">
          {courses.map((course) => {
            const state = courseStateLine(course, "vy");
            const freeNote = freeLessonsNote(course);
            const open = openCourseId === course.id;
            return (
              <li key={course.id} className="rounded-2xl border border-stone-200 bg-white p-3 sm:p-4" data-testid="family-course" data-course-id={course.id}>
                <div className="flex flex-col items-start gap-2 sm:flex-row sm:justify-between sm:gap-3">
                  <div className="min-w-0 sm:flex-1">
                    <p className="break-words font-display text-xl">{course.title}</p>
                    {freeNote ? <p className="mt-1 text-xs font-semibold text-stone-500">{freeNote}</p> : null}
                  </div>
                  <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${TONE_STYLES[state.tone]}`} data-testid="family-course-state" data-tone={state.tone}>
                    {state.text}
                  </span>
                </div>
                {canPayFor(course) ? (
                  <button
                    type="button"
                    onClick={() => setOpenCourseId(open ? null : course.id)}
                    aria-expanded={open}
                    className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-bold text-white transition hover:bg-stone-800 sm:w-auto"
                    data-testid="family-course-pay"
                  >
                    <CreditCard size={16} /> Оплатить курс
                  </button>
                ) : null}
                {open ? (
                  <div className="mt-4">
                    <CoursePaywall
                      courseKey={`${child.id}:${course.id}`}
                      voice="vy"
                      childName={child.firstName}
                      load={() => courseAccessApi.childAccess(child.id, course.id)}
                      submit={(body) => courseAccessApi.requestChildPayment(child.id, course.id, body)}
                      onChanged={() => void resource.reload()}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-5 text-sm leading-6 text-stone-500">Опубликованных курсов пока нет.</p>
      )}
    </section>
  );
}
