"use client";

import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { ApiError } from "@/lib/api-client";
import { learningHomeworkApi } from "@/lib/learning-homework-api";
import { homeworkPercentTone } from "@/lib/homework-ui";
import type {
  LearningHomeworkMaterial,
  LearningHomeworkRecipientState,
  StudentLearningHomeworkAssignment,
} from "@/types/learning-homework";

/**
 * A homework given from a lesson, as the student sees it. The student does
 * not send anything from here: the teacher checks the homework at the next
 * lesson and writes down how much of it was done.
 */
const stateView: Record<
  LearningHomeworkRecipientState,
  {
    label: string;
    className: string;
    icon: typeof Clock3;
  }
> = {
  assigned: {
    label: "Нужно подготовить",
    className: "bg-amber-50 text-amber-900",
    icon: BookOpen,
  },
  waiting_review: {
    label: "Проверим на уроке",
    className: "bg-sky-50 text-sky-800",
    icon: Clock3,
  },
  revision: {
    label: "Доработать к уроку",
    className: "bg-red-50 text-red-800",
    icon: RotateCcw,
  },
  accepted: {
    label: "Выполнено",
    className: "bg-emerald-50 text-emerald-800",
    icon: CheckCircle2,
  },
  accepted_with_comment: {
    label: "Выполнено с замечанием",
    className: "bg-emerald-50 text-emerald-800",
    icon: CheckCircle2,
  },
  not_completed: {
    label: "Не выполнено",
    className: "bg-red-50 text-red-700",
    icon: XCircle,
  },
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Aqtobe",
  }).format(new Date(value));
}

function formatBytes(value?: number) {
  if (!value) return "";
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} КБ`;
  return `${(value / 1024 / 1024).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} МБ`;
}

function HomeworkMaterialAction({
  material,
  onError,
}: {
  material: LearningHomeworkMaterial;
  onError: (message: string) => void;
}) {
  const content = (
    <>
      {material.privateFile ? (
        <Download size={13} className="shrink-0 text-gold-ink" />
      ) : (
        <ExternalLink size={13} className="shrink-0 text-gold-ink" />
      )}
      <span className="min-w-0 flex-1 truncate">
        {material.title || "Материал"}
      </span>
      {material.sizeBytes ? (
        <span className="shrink-0 text-[10px] text-stone-400">
          {formatBytes(material.sizeBytes)}
        </span>
      ) : null}
    </>
  );
  const className =
    "inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 text-xs font-bold text-ink hover:border-amber-300";
  if (material.privateFile) {
    return (
      <button
        type="button"
        onClick={() =>
          void learningHomeworkApi
            .downloadMaterial(material)
            .catch((reason) => {
              onError(
                reason instanceof ApiError
                  ? reason.message
                  : "Не удалось скачать файл",
              );
            })
        }
        className={className}
      >
        {content}
      </button>
    );
  }
  return (
    <a
      href={material.url}
      target="_blank"
      rel="noreferrer"
      className={className}
    >
      {content}
    </a>
  );
}

export function LearningHomeworkCard({
  assignment,
  compact = false,
  defaultOpen = false,
}: {
  assignment: StudentLearningHomeworkAssignment;
  /** Kept for callers that refresh after an action; the card itself sends nothing. */
  onSubmitted?: () => Promise<unknown> | unknown;
  compact?: boolean;
  defaultOpen?: boolean;
}) {
  const [detailsOpen, setDetailsOpen] = useState(defaultOpen);
  const [error, setError] = useState<string | null>(null);
  const view = stateView[assignment.state] ?? stateView.assigned;
  const StateIcon = view.icon;
  const latestReview = assignment.latestAttempt?.review;
  const checked = assignment.completionPercent != null;
  const tone = homeworkPercentTone(assignment.completionPercent);
  const open = ["assigned", "waiting_review", "revision"].includes(assignment.state);

  return (
    <article
      id={`homework-${assignment.id}`}
      data-testid="learning-homework-card"
      className={`min-w-0 scroll-mt-28 rounded-2xl border border-stone-200 bg-white ${compact ? "p-3 sm:p-4" : "p-4 shadow-soft sm:p-5"}`}
    >
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-2">
            <BookOpen size={17} className="mt-1 shrink-0 text-gold-ink" />
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase text-stone-400">
                {assignment.topic.direction.title} ·{" "}
                {assignment.topic.scope === "group"
                  ? "Группа"
                  : "Индивидуально"}
              </p>
              <h3
                className={
                  compact
                    ? "mt-1 break-words text-sm font-bold text-ink"
                    : "mt-1 break-words font-display text-xl text-ink sm:text-2xl"
                }
              >
                {assignment.topic.title}
              </h3>
            </div>
          </div>
          <p
            className={`mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-stone-700 ${compact && !detailsOpen ? "line-clamp-2" : ""}`}
          >
            {assignment.instructions}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-stone-500">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays size={13} className="text-gold-ink" />
              {compact ? "" : "Назначено "}
              {formatDate(assignment.assignedAt)}
            </span>
            {assignment.teacherName ? (
              <span>{assignment.teacherName}</span>
            ) : null}
          </div>
        </div>
        <span
          className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 self-start rounded-xl px-3 text-xs font-black ${checked ? tone.className : view.className}`}
        >
          <StateIcon size={14} /> {checked ? `${view.label === "Не выполнено" ? "Не выполнено" : "Выполнено"} · ${tone.label}` : view.label}
        </span>
      </div>

      {checked ? (
        <div className="mt-4">
          <div className="h-2 w-full overflow-hidden rounded-full bg-stone-100">
            <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.max(0, Math.min(100, assignment.completionPercent ?? 0))}%` }} />
          </div>
          <p className="mt-1.5 text-xs font-semibold text-stone-500">
            Преподаватель проверил на уроке{latestReview?.reviewedAt ? ` ${formatDate(latestReview.reviewedAt)}` : ""}
            {assignment.completionPercent ? ` · выполнено на ${assignment.completionPercent}%` : " · не выполнено"}
          </p>
        </div>
      ) : open ? (
        <p className="mt-4 rounded-2xl border border-sky-100 bg-sky-50 px-3 py-2.5 text-sm leading-6 text-sky-950" data-testid="homework-lesson-check-note">
          Отправлять ничего не нужно: преподаватель проверит домашнее задание на следующем уроке и отметит, насколько оно выполнено.
        </p>
      ) : null}

      {latestReview?.comment ? (
        <div
          className={`mt-4 rounded-2xl border p-3 text-sm ${
            assignment.state === "revision" || assignment.state === "not_completed"
              ? "border-red-100 bg-red-50 text-red-950"
              : "border-emerald-100 bg-emerald-50 text-emerald-950"
          }`}
        >
          <p className="text-[10px] font-black uppercase">
            Комментарий преподавателя
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words leading-6">
            {latestReview.comment}
          </p>
        </div>
      ) : null}

      {assignment.materials.length && (!compact || detailsOpen) ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {assignment.materials.map((material, index) => (
            <HomeworkMaterialAction
              key={`${material.url}-${index}`}
              material={{
                ...material,
                title: material.title || `Материал ${index + 1}`,
              }}
              onError={setError}
            />
          ))}
        </div>
      ) : null}

      {compact ? (
        <button
          type="button"
          onClick={() => setDetailsOpen((value) => !value)}
          aria-expanded={detailsOpen}
          className="mt-2 min-h-11 rounded-lg text-xs font-semibold text-stone-600 focus-visible:ring-2 focus-visible:ring-gold"
        >
          {detailsOpen
            ? "Свернуть задание"
            : `Задание и материалы${assignment.materials.length ? ` · ${assignment.materials.length}` : ""}`}
        </button>
      ) : null}

      {error ? (
        <p className="mt-2 text-xs font-semibold text-red-700">{error}</p>
      ) : null}
    </article>
  );
}
