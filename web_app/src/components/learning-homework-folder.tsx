"use client";

import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  LoaderCircle,
  Paperclip,
  RotateCcw,
  Send,
  X,
} from "lucide-react";
import { type ChangeEvent, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { ApiError } from "@/lib/api-client";
import { learningHomeworkApi } from "@/lib/learning-homework-api";
import type {
  LearningHomeworkMaterial,
  LearningHomeworkRecipientState,
  StudentLearningHomeworkAssignment,
} from "@/types/learning-homework";

const stateView: Record<LearningHomeworkRecipientState, {
  label: string;
  className: string;
  icon: typeof Clock3;
}> = {
  assigned: {
    label: "Нужно подготовить",
    className: "bg-amber-50 text-amber-900",
    icon: BookOpen,
  },
  waiting_review: {
    label: "Ожидает проверки",
    className: "bg-sky-50 text-sky-800",
    icon: Clock3,
  },
  revision: {
    label: "На доработке",
    className: "bg-red-50 text-red-800",
    icon: RotateCcw,
  },
  accepted: {
    label: "Принято",
    className: "bg-emerald-50 text-emerald-800",
    icon: CheckCircle2,
  },
  accepted_with_comment: {
    label: "Принято с замечанием",
    className: "bg-emerald-50 text-emerald-800",
    icon: CheckCircle2,
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
      {material.privateFile ? <Download size={13} className="shrink-0 text-gold" /> : <ExternalLink size={13} className="shrink-0 text-gold" />}
      <span className="min-w-0 flex-1 truncate">{material.title || "Материал"}</span>
      {material.sizeBytes ? <span className="shrink-0 text-[10px] text-stone-400">{formatBytes(material.sizeBytes)}</span> : null}
    </>
  );
  const className = "inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 text-xs font-bold text-ink hover:border-amber-300";
  if (material.privateFile) {
    return (
      <button
        type="button"
        onClick={() => void learningHomeworkApi.downloadMaterial(material).catch((reason) => {
          onError(reason instanceof ApiError ? reason.message : "Не удалось скачать файл");
        })}
        className={className}
      >
        {content}
      </button>
    );
  }
  return (
    <a href={material.url} target="_blank" rel="noreferrer" className={className}>
      {content}
    </a>
  );
}

function LearningHomeworkCard({
  assignment,
  onSubmitted,
}: {
  assignment: StudentLearningHomeworkAssignment;
  onSubmitted: () => Promise<unknown> | unknown;
}) {
  const [answerOpen, setAnswerOpen] = useState(false);
  const [submissionMode, setSubmissionMode] = useState<"materials" | "ready_for_lesson">("ready_for_lesson");
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const view = stateView[assignment.state];
  const StateIcon = view.icon;
  const maySubmit = ["assigned", "revision", "waiting_review"].includes(assignment.state);
  const previousAttemptId = assignment.latestAttempt?.id ?? null;
  const latestReview = assignment.latestAttempt?.review;

  function openAnswer(mode: "materials" | "ready_for_lesson") {
    setSubmissionMode(mode);
    setAnswerOpen(true);
    setError(null);
  }

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    setFiles((current) => [...current, ...selected].slice(0, 5));
    event.target.value = "";
  }

  async function submitAnswer() {
    const hasContent = Boolean(text.trim() || link.trim() || files.length);
    if (saving || (submissionMode === "materials" && !hasContent)) return;
    setSaving(true);
    setError(null);
    try {
      await learningHomeworkApi.submit(assignment.id, {
        submissionMode,
        text: text.trim() || null,
        materials: link.trim()
          ? [{ type: "link", url: link.trim(), title: "Ссылка ученика" }]
          : [],
        files,
        previousAttemptId,
        idempotencyKey: requestKey,
      });
      setText("");
      setLink("");
      setFiles([]);
      setAnswerOpen(false);
      setRequestKey(crypto.randomUUID());
      await onSubmitted();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось отправить ответ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article id={`homework-${assignment.id}`} className="min-w-0 scroll-mt-28 rounded-[24px] border border-stone-200 bg-white p-4 shadow-soft sm:p-5">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-2">
            <BookOpen size={17} className="mt-1 shrink-0 text-gold" />
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase text-stone-400">
                {assignment.topic.direction.title} · {assignment.topic.scope === "group" ? "Группа" : "Индивидуально"}
              </p>
              <h3 className="mt-1 break-words font-display text-xl text-ink sm:text-2xl">
                {assignment.topic.title}
              </h3>
            </div>
          </div>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-stone-700">
            {assignment.instructions}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-stone-500">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays size={13} className="text-gold" />
              Назначено {formatDate(assignment.assignedAt)}
            </span>
            {assignment.dueAt ? (
              <span className="inline-flex items-center gap-1.5">
                <Clock3 size={13} /> До {formatDate(assignment.dueAt)}
              </span>
            ) : null}
            {assignment.teacherName ? <span>{assignment.teacherName}</span> : null}
          </div>
        </div>
        <span className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 self-start rounded-xl px-3 text-xs font-black ${view.className}`}>
          <StateIcon size={14} /> {view.label}
        </span>
      </div>

      {latestReview?.comment ? (
        <div className={`mt-4 rounded-2xl border p-3 text-sm ${
          assignment.state === "revision"
            ? "border-red-100 bg-red-50 text-red-950"
            : "border-emerald-100 bg-emerald-50 text-emerald-950"
        }`}>
          <p className="text-[10px] font-black uppercase">Комментарий преподавателя</p>
          <p className="mt-1 whitespace-pre-wrap break-words leading-6">{latestReview.comment}</p>
        </div>
      ) : null}

      {assignment.materials.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {assignment.materials.map((material, index) => (
            <HomeworkMaterialAction
              key={`${material.url}-${index}`}
              material={{ ...material, title: material.title || `Материал ${index + 1}` }}
              onError={setError}
            />
          ))}
        </div>
      ) : null}

      {maySubmit ? (
        <div className="mt-4 border-t border-stone-100 pt-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              disabled={saving}
              onClick={() => openAnswer(
                assignment.state === "waiting_review"
                  ? assignment.latestAttempt?.submissionMode ?? "ready_for_lesson"
                  : "ready_for_lesson",
              )}
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition disabled:opacity-50 ${
                assignment.state === "waiting_review"
                  ? "border border-stone-200 bg-white text-ink hover:bg-stone-50"
                  : "bg-ink text-white hover:bg-stone-800"
              }`}
            >
              {assignment.state === "waiting_review" ? <Send size={15} /> : <CheckCircle2 size={16} />}
              {assignment.state === "waiting_review" ? "Обновить ответ" : "Я подготовил"}
            </button>
          </div>

          {answerOpen ? (
            <div className="mt-3 grid min-w-0 gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-3 sm:p-4">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-black text-ink">
                    {submissionMode === "ready_for_lesson" ? "Отправить на проверку" : "Добавить ответ"}
                  </p>
                  <p className="mt-0.5 text-xs text-stone-500">
                    {submissionMode === "ready_for_lesson" ? "Комментарий и материалы необязательны" : "Добавьте комментарий, ссылку или файл"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAnswerOpen(false)}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-stone-400 hover:bg-stone-200 hover:text-ink"
                  aria-label="Закрыть форму ответа"
                  title="Закрыть"
                >
                  <X size={15} />
                </button>
              </div>
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={3}
                maxLength={10_000}
                placeholder="Сопроводительный комментарий"
                className="w-full resize-y rounded-xl border border-stone-200 bg-white p-3 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
              />
              <input
                type="url"
                value={link}
                onChange={(event) => setLink(event.target.value)}
                placeholder="Ссылка на видео, аудио или файл"
                className="h-11 w-full min-w-0 rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none focus:border-amber-400"
              />
              {files.length ? (
                <div className="flex min-w-0 flex-wrap gap-2">
                  {files.map((file, index) => (
                    <span key={`${file.name}-${file.size}-${index}`} className="inline-flex max-w-full items-center gap-2 rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-xs font-semibold text-stone-700">
                      <Paperclip size={13} className="shrink-0 text-gold" />
                      <span className="min-w-0 truncate">{file.name}</span>
                      <span className="shrink-0 text-[10px] text-stone-400">{formatBytes(file.size)}</span>
                      <button
                        type="button"
                        onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                        className="grid h-5 w-5 shrink-0 place-items-center rounded text-stone-400 hover:bg-stone-100 hover:text-red-700"
                        aria-label={`Убрать файл ${file.name}`}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-4 text-sm font-bold text-ink hover:bg-stone-100">
                  <Paperclip size={15} />
                  Прикрепить файлы
                  <input
                    type="file"
                    multiple
                    accept="image/*,audio/*,video/*,application/pdf"
                    className="sr-only"
                    onChange={selectFiles}
                    disabled={saving || files.length >= 5}
                  />
                </label>
                <button
                  type="button"
                  disabled={saving || (submissionMode === "materials" && !text.trim() && !link.trim() && !files.length)}
                  onClick={() => void submitAnswer()}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 text-sm font-black text-ink hover:bg-amber-300 disabled:opacity-45"
                >
                  {saving ? <LoaderCircle size={15} className="animate-spin" /> : <Send size={15} />}
                  {assignment.state === "waiting_review" ? "Обновить ответ" : "Отправить преподавателю"}
                </button>
              </div>
            </div>
          ) : null}
          {assignment.state === "waiting_review" ? (
            <p className="mt-3 text-xs font-semibold text-sky-800">
              Отправлено преподавателю. Проверим на уроке или заранее.
            </p>
          ) : null}
          {error ? <p className="mt-2 text-xs font-semibold text-red-700">{error}</p> : null}
        </div>
      ) : null}

      {assignment.attempts.length ? (
        <details className="mt-4 border-t border-stone-100 pt-3">
          <summary className="cursor-pointer text-xs font-bold text-stone-500">
            История ответов · {assignment.attempts.length}
          </summary>
          <div className="mt-3 space-y-2">
            {assignment.attempts.map((attempt) => (
              <div key={attempt.id} className="rounded-xl bg-stone-50 p-3 text-xs text-stone-600">
                <p className="font-bold text-ink">
                  Ответ отправлен · {formatDate(attempt.submittedAt)}
                </p>
                <p className="mt-1">
                  {attempt.submissionMode === "ready_for_lesson"
                    ? `Проверить на уроке${attempt.text ? ` · ${attempt.text}` : ""}`
                    : attempt.text || "Отправлен материал"}
                </p>
                {attempt.materials.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {attempt.materials.map((material, index) => (
                      <HomeworkMaterialAction
                        key={`${attempt.id}-${material.url}-${index}`}
                        material={material}
                        onError={setError}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </article>
  );
}

export function LearningHomeworkFolder({
  assignments,
  loading,
  error,
  onReload,
}: {
  assignments: StudentLearningHomeworkAssignment[];
  loading: boolean;
  error: string | null;
  onReload: () => Promise<unknown> | unknown;
}) {
  if (loading) return <LoadingState label="Загружаем новые домашние задания" />;
  if (error) return <ErrorState message={error} retry={onReload} />;
  if (!assignments.length) {
    return (
      <EmptyState
        title="Новых заданий пока нет"
        description="Преподаватель назначит их из текущего учебного плана."
      />
    );
  }
  return (
    <div className="space-y-4">
      {assignments.map((assignment) => (
        <LearningHomeworkCard
          key={assignment.id}
          assignment={assignment}
          onSubmitted={onReload}
        />
      ))}
    </div>
  );
}
