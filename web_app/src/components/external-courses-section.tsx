"use client";

import { ArrowRight, BookOpen, Clock3, GraduationCap } from "lucide-react";
import Link from "next/link";
import { ScreenError } from "@/components/app-error-screen";
import { ScreenSkeleton } from "@/components/screen-skeleton";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api-client";
import { courseAccessApi, type StudentPaymentRequest } from "@/lib/course-access-api";
import {
  courseStateLine,
  isForSale,
  requestStatusLabel,
  saleViewOf,
  type RequestDisplayStatus,
} from "@/lib/course-access-format";
import { formatSchoolDate, formatTenge } from "@/lib/course-payments-format";
import { TRIAL_BOOKING_URL } from "@/lib/trial-booking";
import type { ApiCourseSummary } from "@/types/api";

const REQUEST_TONE: Record<RequestDisplayStatus, string> = {
  pending: "bg-amber-50 text-amber-900",
  confirmed: "bg-emerald-50 text-emerald-800",
  rejected: "bg-red-50 text-red-700",
  refunded: "bg-stone-100 text-stone-600",
};

/** A course belongs to «Мои курсы» when the person started it, holds access to it or waits for it. */
export function isMyCourse(course: Pick<ApiCourseSummary, "enrollmentStatus" | "priceKzt" | "access">): boolean {
  if (course.enrollmentStatus) return true;
  const kind = course.access?.kind;
  return kind === "paid" || kind === "granted" || Boolean(course.access?.pendingPaymentRequest);
}

/**
 * Stage 4, the profile of a student outside the school: the courses they hold with the dates, the
 * requests «Я оплатил» with their state, and the way to a trial lesson.
 *
 * «Записаться на пробный урок» leads to the form on the school site (decision 03.11: a trial is booked
 * only there; `/trial-lesson` itself answers 307 to the same address).
 */
export function ExternalCoursesSection() {
  const resource = useApiResource(async () => {
    const [courses, requests] = await Promise.all([api.courses(), courseAccessApi.myRequests()]);
    return { courses, requests };
  }, []);

  if (resource.loading && !resource.data) return <ScreenSkeleton variant="section" label="Загружаем твои курсы" />;
  if (resource.error && !resource.data) {
    return <ScreenError message={resource.error} code={resource.errorCode} retry={resource.reload} />;
  }

  const mine = (resource.data?.courses ?? []).filter(isMyCourse);
  const requests = resource.data?.requests ?? [];

  return (
    <>
      <section className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8" data-testid="external-my-courses">
        <p className="text-xs font-bold uppercase tracking-[0.17em] text-gold-ink">Обучение</p>
        <h3 className="font-display mt-2 text-3xl">Мои курсы</h3>
        <div className="mt-5 space-y-3">
          {mine.length ? mine.map((course) => {
            const sale = saleViewOf(course);
            const state = courseStateLine(sale);
            return (
              <Link
                key={course.id}
                href={`/courses/${course.id}`}
                className="card-hover flex items-center gap-4 rounded-2xl border border-transparent bg-stone-50 p-4"
                data-testid="external-my-course"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-gold-ink ring-1 ring-gold/10"><BookOpen size={17} /></span>
                <div className="min-w-0 flex-1">
                  <p className="break-words font-bold">{course.title}</p>
                  <p className="mt-1 text-xs text-stone-500">
                    {isForSale(sale) ? state.text : "Бесплатно"}
                    {course.enrollmentStatus ? ` · ${course.progress}% пройдено` : ""}
                  </p>
                </div>
                <ArrowRight size={16} className="shrink-0 text-stone-300" />
              </Link>
            );
          }) : (
            <p className="text-sm leading-6 text-stone-500">
              Ты ещё не начал ни одного курса. <Link href="/courses" className="font-bold text-gold-ink underline">Выбрать курс</Link>
            </p>
          )}
        </div>
      </section>

      {requests.length ? (
        <section className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8" data-testid="external-payment-requests">
          <p className="text-xs font-bold uppercase tracking-[0.17em] text-gold-ink">Оплата</p>
          <h3 className="font-display mt-2 text-3xl">Заявки на оплату</h3>
          <ul className="mt-5 space-y-3">
            {requests.map((request) => <RequestRow key={request.id} request={request} />)}
          </ul>
        </section>
      ) : null}

      <section className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8" data-testid="external-trial">
        <GraduationCap size={22} className="text-gold-ink" />
        <h3 className="font-display mt-3 text-3xl">Хочешь заниматься с преподавателем?</h3>
        <p className="mt-2 text-sm leading-6 text-stone-500">
          Запишись на пробный урок в школе Maestro. Мы получим заявку, свяжемся с тобой и подберём время.
        </p>
        <a
          href={TRIAL_BOOKING_URL}
          className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-bold text-white transition hover:bg-stone-800 sm:w-auto"
        >
          Записаться на пробный урок <ArrowRight size={16} />
        </a>
      </section>
    </>
  );
}

function RequestRow({ request }: { request: StudentPaymentRequest }) {
  return (
    <li className="rounded-2xl border border-stone-200 bg-white p-4" data-testid="external-payment-request" data-status={request.displayStatus}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 break-words font-bold">{request.courseTitle}</p>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${REQUEST_TONE[request.displayStatus]}`}>
          {requestStatusLabel(request.displayStatus)}
        </span>
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
        <span>{formatTenge(request.amountKzt)}</span>
        <span className="inline-flex items-center gap-1"><Clock3 size={12} /> {formatSchoolDate(request.createdAt)}</span>
        {request.paidBy === "parent" ? <span>Оплатил родитель</span> : null}
        {request.displayStatus === "confirmed" && request.access ? <span>Доступ до {formatSchoolDate(request.access.expiresAt)}</span> : null}
      </p>
      {request.displayStatus === "rejected" && request.rejectionReason ? (
        <p className="mt-2 break-words text-sm text-red-800">Причина: {request.rejectionReason}</p>
      ) : null}
      {request.displayStatus === "rejected" ? (
        <Link href={`/courses/${request.courseId}`} className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-gold-ink underline">
          Отправить заявку снова
        </Link>
      ) : null}
    </li>
  );
}
