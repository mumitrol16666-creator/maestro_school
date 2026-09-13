"use client";
import { ChevronDown, RotateCcw } from "lucide-react";
import { useState } from "react";
import { LessonMaterialItems } from "@/components/student-lesson-materials";
import {
  schoolDateLabel as formatLessonDate,
  studentLessonTitle,
} from "@/lib/student-lesson-display";
import type { SchoolHomeworkReviewState } from "@/lib/school-homework-state";
import type { SchoolOfflineLesson } from "@/types/school-offline";

const decisionLabels = { accepted: "Принято преподавателем", continue: "Продолжить работу", obsolete: "Неактуально" };

const homeworkResultLabels = {
  completed: "Выполнено",
  partial: "Выполнено частично",
  not_completed: "Не выполнено",
} as const;

const homeworkResultStyles = {
  completed: {
    panel: "border-emerald-100 bg-emerald-50/60",
    label: "text-emerald-700",
    bar: "bg-emerald-500",
  },
  partial: {
    panel: "border-amber-100 bg-amber-50/60",
    label: "text-amber-800",
    bar: "bg-amber-400",
  },
  not_completed: {
    panel: "border-red-100 bg-red-50/60",
    label: "text-red-700",
    bar: "bg-red-500",
  },
} as const;

function HomeworkProgress({
  result,
  reviewState,
}: {
  result: SchoolOfflineLesson["homeworkResult"];
  reviewState: SchoolHomeworkReviewState;
}) {
  const label = result
    ? homeworkResultLabels[result.status]
    : reviewState === "missing_review"
      ? "Результат уточняется"
      : "Ждёт проверки";
  return (
    <span
      className={`rounded-lg px-2 py-1 text-xs font-medium ${result?.status === "completed" ? "bg-emerald-50 text-emerald-800" : result?.status === "not_completed" ? "bg-red-50 text-red-700" : "bg-stone-100 text-stone-600"}`}
    >
      {label}
      {result?.completionPercent != null
        ? ` · ${result.completionPercent}%`
        : ""}
    </span>
  );
}

function HomeworkPoints({ lesson }: { lesson: SchoolOfflineLesson }) {
  if (lesson.lessonPointsAwarded == null) return null;

  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-violet-50 px-2 py-1 text-xs text-violet-800">
      <span className="font-semibold">
        {lesson.lessonPointsAwarded > 0 ? "+" : ""}
        {lesson.lessonPointsAwarded}
      </span>
      <span>баллов за занятие</span>
    </span>
  );
}

export function LegacySchoolHomework({
  lesson,
  reviewState,
  defaultOpen = false,
}: {
  lesson: SchoolOfflineLesson;
  reviewState: SchoolHomeworkReviewState;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const resultStyle = lesson.homeworkResult
    ? homeworkResultStyles[lesson.homeworkResult.status]
    : null;
  const needsRevision =
    !lesson.legacyResolution && (lesson.homeworkResult?.status === "partial" ||
    lesson.homeworkResult?.status === "not_completed");
  const revisionComment =
    lesson.homeworkReview?.difficulties?.trim() ||
    lesson.homeworkReview?.notCompletedReason?.trim() ||
    null;
  const displayTitle = studentLessonTitle(lesson);

  return (
    <article
      id={`homework-${lesson.crmClassId}`}
      className="rounded-2xl border border-stone-200 bg-white"
    >
      <div className="p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="break-words text-sm font-bold">
              <button
                type="button"
                onClick={() => setOpen(!open)}
                aria-expanded={open}
                className="rounded text-left focus-visible:ring-2 focus-visible:ring-gold"
              >
                {displayTitle}
              </button>
            </h3>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              {formatLessonDate(lesson.date)}
              {lesson.teacherName ? ` · ${lesson.teacherName}` : ""}
            </p>
          </div>
          <button
            type="button"
            aria-label={`${open ? "Скрыть" : "Открыть"} задание: ${displayTitle}`}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-stone-500 hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-gold"
          >
            <ChevronDown size={18} className={open ? "rotate-180" : ""} />
          </button>
        </div>
        {!open ? (
          <p className="mt-2 line-clamp-2 break-words text-sm leading-6 text-stone-600">
            {lesson.homework}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {lesson.legacyResolution ? <span className="rounded-lg bg-stone-100 px-2 py-1 text-xs font-medium text-stone-700">{decisionLabels[lesson.legacyResolution.decision]}</span> : <HomeworkProgress
            result={lesson.homeworkResult}
            reviewState={reviewState}
          />}
          <HomeworkPoints lesson={lesson} />
        </div>
      </div>

      {open && (
        <div className="grid gap-3 border-t border-amber-100 p-4 lg:grid-cols-2">
          <div
            className={`rounded-2xl border p-4 ${
              resultStyle?.panel ?? "border-stone-200 bg-stone-50"
            }`}
          >
            <p
              className={`text-xs font-bold uppercase tracking-wider ${
                resultStyle?.label ?? "text-stone-400"
              }`}
            >
              Результат проверки
            </p>
            {lesson.legacyResolution ? <div className="mt-2 text-sm leading-6 text-stone-700">
              <p className="font-semibold">{decisionLabels[lesson.legacyResolution.decision]}</p>
              {lesson.legacyResolution.comment && <p className="mt-2 whitespace-pre-wrap break-words">{lesson.legacyResolution.comment}</p>}
              <p className="mt-2 text-xs text-stone-500">{formatLessonDate(lesson.legacyResolution.updatedAt)}</p>
            </div> : lesson.homeworkResult ? (
              <>
                <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold text-stone-700">
                    {homeworkResultLabels[lesson.homeworkResult.status]}
                  </span>
                  <strong className="text-lg text-ink">
                    {lesson.homeworkResult.completionPercent == null
                      ? "Без процента"
                      : `${lesson.homeworkResult.completionPercent}%`}
                  </strong>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                  <div
                    className={`h-full rounded-full ${resultStyle?.bar ?? "bg-stone-300"}`}
                    style={{
                      width: `${lesson.homeworkResult.completionPercent ?? 0}%`,
                    }}
                  />
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm leading-6 text-stone-500">
                {reviewState === "missing_review"
                  ? "Преподаватель ещё не отметил результат проверки."
                  : "Преподаватель отметит результат на следующем занятии."}
              </p>
            )}
          </div>

          {needsRevision ? (
            <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
              <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-red-700">
                <RotateCcw size={14} /> Что повторить к следующему уроку
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-red-950">
                {revisionComment ||
                  "Повторите домашнее задание с учётом результата проверки преподавателя."}
              </p>
            </div>
          ) : null}

          <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-800">
              Домашнее задание
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-950">
              {lesson.homework}
            </p>
          </div>

          {lesson.materials.length > 0 ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-4 lg:col-span-2">
              <p className="text-xs font-bold uppercase tracking-wider text-stone-400">
                Материалы
              </p>
              <LessonMaterialItems materials={lesson.materials} />
            </div>
          ) : null}
        </div>
      )}
    </article>
  );
}
