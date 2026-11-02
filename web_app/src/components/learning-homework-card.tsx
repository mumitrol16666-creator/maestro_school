"use client";

import {
  BookOpen,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  RotateCcw,
  Target,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { LessonMaterialItems } from "@/components/student-lesson-materials";
import { parseHomeworkInstructions } from "@/lib/homework-items";
import { ApiError } from "@/lib/api-client";
import { learningHomeworkApi } from "@/lib/learning-homework-api";
import { homeworkPercentTone } from "@/lib/homework-ui";
import { sameSiteMediaUrl } from "@/lib/media-url";
import { parseVideoUrl, videoFrameClass } from "@/lib/parse-video-url";
import type {
  LearningHomeworkMaterial,
  LearningHomeworkRecipientState,
  StudentLearningHomeworkAssignment,
} from "@/types/learning-homework";
import type { SchoolOfflineLesson } from "@/types/school-offline";

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
    label: "К следующему уроку",
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
  const date = new Date(value);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" as const }),
    timeZone: "Asia/Aqtobe",
  }).format(date);
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
        <span className="shrink-0 text-xs text-stone-500">
          {formatBytes(material.sizeBytes)}
        </span>
      ) : null}
    </>
  );
  const className =
    "inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 text-xs font-bold text-ink hover:border-amber-300";
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
      href={sameSiteMediaUrl(material.url)}
      target="_blank"
      rel="noreferrer"
      className={className}
    >
      {content}
    </a>
  );
}

/** Plan 1.12: YouTube and Vimeo videos from the homework play right in the card. */
function HomeworkVideoEmbeds({ materials }: { materials: LearningHomeworkMaterial[] }) {
  const videos = materials.flatMap((material) => {
    const parsed = material.privateFile ? null : parseVideoUrl(material.url);
    return parsed ? [{ material, parsed }] : [];
  });
  if (!videos.length) return null;
  return (
    <div className="mt-4 grid min-w-0 grid-cols-1 gap-3" data-testid="homework-video-embed">
      {videos.map(({ material, parsed }) => (
        <figure key={material.url} className="min-w-0">
          <div className={`relative overflow-hidden rounded-xl bg-black ${videoFrameClass(parsed)}`}>
            <iframe
              title={material.title || "Видео к заданию"}
              src={parsed.embedUrl}
              className="h-full w-full border-0"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              loading="lazy"
            />
          </div>
          {material.title ? (
            <figcaption className="mt-1.5 text-sm font-semibold text-ink">{material.title}</figcaption>
          ) : null}
        </figure>
      ))}
    </div>
  );
}

export function LearningHomeworkCard({
  assignment,
  compact = false,
  defaultOpen = false,
  lessonMaterials = [],
}: {
  assignment: StudentLearningHomeworkAssignment;
  /** Materials the teacher attached to the lesson itself: the homework shows them too. */
  lessonMaterials?: SchoolOfflineLesson["materials"];
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
  const items = useMemo(() => parseHomeworkInstructions(assignment.instructions), [assignment.instructions]);
  const hasItems = items.goals.length + items.tasks.length + items.carryOver.length > 0;
  // Lesson materials and links typed into the text, minus what the homework already carries.
  const extraMaterials = useMemo(() => {
    const known = new Set(assignment.materials.map((material) => material.url));
    const extra: SchoolOfflineLesson["materials"] = [];
    for (const material of [...lessonMaterials, ...items.links.map((url) => ({ url, type: "link" }))]) {
      if (!material.url || known.has(material.url)) continue;
      known.add(material.url);
      extra.push(material);
    }
    return extra;
  }, [assignment.materials, lessonMaterials, items.links]);
  // Videos play full width right in the card; files and other links keep their download rows.
  const extraVideos: LearningHomeworkMaterial[] = extraMaterials.flatMap((material) =>
    material.url && parseVideoUrl(material.url)
      ? [{ type: "video" as const, url: material.url, title: material.title }]
      : [],
  );
  const extraOther = extraMaterials.filter((material) => !material.url || !parseVideoUrl(material.url));
  const showMaterials = !compact || detailsOpen;
  const visibleTasks = compact && !detailsOpen ? items.tasks.slice(0, 2) : items.tasks;

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
              <p className="text-xs font-black uppercase tracking-wide text-stone-500">
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
        </div>
        <span
          className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 self-start rounded-xl px-3 text-xs font-black ${checked ? tone.className : view.className}`}
        >
          <StateIcon size={14} /> {checked ? `${view.label === "Не выполнено" ? "Не выполнено" : "Выполнено"} · ${tone.label}` : view.label}
        </span>
      </div>

      <div className="mt-4 max-w-prose space-y-4" data-testid="homework-items">
        {items.goals.map((goal) => (
          <div
            key={`${goal.topic}:${goal.text}`}
            className="flex gap-3 rounded-2xl border border-gold/30 bg-gold-bright/10 px-4 py-3"
            data-testid="homework-goal"
          >
            <Target size={18} className="mt-0.5 shrink-0 text-gold-ink" aria-hidden />
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-wide text-gold-ink">
                Цель{goal.topic !== assignment.topic.title ? ` · ${goal.topic}` : ""}
              </p>
              <p className="mt-0.5 break-words text-base font-semibold leading-6 text-ink">{goal.text}</p>
            </div>
          </div>
        ))}

        {visibleTasks.length ? (
          <div>
            <p className="text-[11px] font-black uppercase tracking-wide text-stone-400">Что сделать</p>
            <ul className="mt-2 space-y-2">
              {visibleTasks.map((task) => (
                <li key={task} className="flex gap-3 text-[15px] leading-6 text-ink">
                  <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden />
                  <span className="min-w-0 break-words">{task}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {items.carryOver.length && (!compact || detailsOpen) ? (
          <div>
            <p className="text-[11px] font-black uppercase tracking-wide text-stone-400">С прошлого урока</p>
            <ul className="mt-2 space-y-2">
              {items.carryOver.map((task) => (
                <li key={task} className="flex gap-3 text-[15px] leading-6 text-stone-600">
                  <RotateCcw size={14} className="mt-1 shrink-0 text-stone-400" aria-hidden />
                  <span className="min-w-0 break-words">{task}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {!hasItems && assignment.instructions.trim() ? (
          <p className="whitespace-pre-wrap break-words text-[15px] leading-6 text-ink">
            {assignment.instructions}
          </p>
        ) : null}
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
      ) : null}

      {latestReview?.comment ? (
        <div
          className={`mt-4 rounded-2xl border p-3 text-sm ${
            assignment.state === "revision" || assignment.state === "not_completed"
              ? "border-red-100 bg-red-50 text-red-950"
              : "border-emerald-100 bg-emerald-50 text-emerald-950"
          }`}
        >
          <p className="text-xs font-black uppercase tracking-wide">
            Комментарий преподавателя
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words leading-6">
            {latestReview.comment}
          </p>
        </div>
      ) : null}

      {showMaterials && (assignment.materials.length || extraMaterials.length) ? (
        <div className="mt-5 max-w-prose" data-testid="homework-materials">
          <p className="text-[11px] font-black uppercase tracking-wide text-stone-400">Видео и материалы</p>
          <HomeworkVideoEmbeds materials={assignment.materials} />
          {assignment.materials.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
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
          <HomeworkVideoEmbeds materials={extraVideos} />
          {extraOther.length ? <LessonMaterialItems materials={extraOther} /> : null}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-stone-100 pt-3 text-xs text-stone-400">
        <span>
          Задано {formatDate(assignment.assignedAt)}
          {assignment.teacherName ? ` · ${assignment.teacherName}` : ""}
        </span>
        {open && !checked ? (
          <span data-testid="homework-lesson-check-note">Отправлять ничего не нужно, учитель проверит на уроке</span>
        ) : null}
      </div>

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
