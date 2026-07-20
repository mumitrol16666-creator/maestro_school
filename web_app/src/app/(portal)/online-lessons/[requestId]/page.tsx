"use client";

import { ArrowLeft, ExternalLink, LoaderCircle, Send } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { useApiResource } from "@/hooks/use-api-resource";
import { ApiError } from "@/lib/api-client";
import { attachmentTypeLabels } from "@/lib/homework-ui";
import { onlineLessonStatusClasses, onlineLessonStatusLabels } from "@/lib/online-lessons-ui";
import { notificationsApi } from "@/lib/notifications-api";
import { onlineLessonsApi } from "@/lib/online-lessons-api";
import type { HomeworkAttachmentType } from "@/types/homework";

export default function OnlineLessonDetailPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const resource = useApiResource(() => onlineLessonsApi.myRequest(requestId), [requestId]);
  const [comment, setComment] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void notificationsApi.markAllRead("online_lesson_scheduled").catch(() => undefined);
  }, [requestId]);

  if (resource.loading) return <LoadingState label="Открываем заявку" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data) return <EmptyState title="Заявка не найдена" description="Возможно, она была удалена." />;

  const item = resource.data;
  const assignment = item.assignment;
  const latestSubmission = assignment?.submissions[0] ?? null;
  const canSubmit = item.status === "completed"
    && assignment
    && (!latestSubmission || latestSubmission.status === "returned");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!assignment) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await onlineLessonsApi.submitAssignment(requestId, {
        comment: comment.trim() || undefined,
        attachmentUrl: assignment.submissionFormat === "text" ? undefined : attachmentUrl.trim() || undefined,
        attachmentType: assignment.submissionFormat,
      });
      setMessage("Задание отправлено на проверку.");
      setComment("");
      setAttachmentUrl("");
      await resource.reload();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось отправить задание");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Link href="/online-lessons" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-stone-500">
        <ArrowLeft size={16} /> Все онлайн-уроки
      </Link>

      <div className="rounded-[30px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">Онлайн-урок</p>
            <h1 className="font-display mt-2 text-4xl">{item.directionTitle}</h1>
            <p className="mt-2 text-sm text-stone-500">{item.level} · удобное время: {item.preferredTime}</p>
          </div>
          <span className={`rounded-full px-4 py-2 text-xs font-bold ${onlineLessonStatusClasses[item.status]}`}>
            {onlineLessonStatusLabels[item.status]}
          </span>
        </div>

        {item.comment && (
          <p className="mt-6 rounded-2xl bg-stone-50 p-4 text-sm leading-7 text-stone-600">{item.comment}</p>
        )}

        {item.status === "scheduled" && item.scheduledAt && item.zoomUrl && (
          <div className="mt-6 rounded-2xl border border-indigo-100 bg-indigo-50 p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">Урок назначен</p>
            <p className="mt-2 text-sm font-semibold text-indigo-900">
              {new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(item.scheduledAt))}
            </p>
            <a href={item.zoomUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-bold text-white">
              Открыть Zoom <ExternalLink size={14} />
            </a>
          </div>
        )}

        {item.status === "completed" && (
          <div className="mt-6 space-y-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Итоги урока</p>
            <Summary label="Что проходили" value={item.coveredTopics} />
            <Summary label="Что получилось" value={item.whatWorked} />
            <Summary label="Что доработать" value={item.whatToImprove} />
            {item.completionComment && <Summary label="Комментарий преподавателя" value={item.completionComment} />}
            <p className="text-sm font-semibold text-emerald-800">
              Баллы за урок: {item.lessonPoints}
              {item.lessonCoins > 0 ? ` · Maestro Coins: ${item.lessonCoins}` : ""}
            </p>
          </div>
        )}
      </div>

      {assignment && (
        <section className="mt-7 rounded-[30px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">Домашнее задание</p>
          <h2 className="font-display mt-3 text-3xl">{assignment.title}</h2>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-stone-600">{assignment.description}</p>
          {assignment.dueAt && (
            <p className="mt-3 text-xs font-bold text-amber-700">
              Сдать до {new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(assignment.dueAt))}
            </p>
          )}

          {assignment.materials.length > 0 && (
            <div className="mt-6 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-stone-400">Материалы</p>
              {assignment.materials.map((material) => (
                <div key={material.id} className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm">
                  <p className="font-bold">{material.title}</p>
                  {material.url && (
                    <a href={material.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-gold hover:underline">
                      Открыть <ExternalLink size={12} />
                    </a>
                  )}
                  {material.content && <p className="mt-2 text-stone-600">{material.content}</p>}
                </div>
              ))}
            </div>
          )}

          {latestSubmission && latestSubmission.status !== "returned" && (
            <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-4 text-sm">
              <p className="font-bold">Статус сдачи: {
                latestSubmission.status === "submitted" ? "На проверке"
                  : latestSubmission.status === "approved" ? "Принято"
                    : latestSubmission.status === "approved_with_remarks" ? "Принято с замечаниями"
                      : "Возвращено"
              }</p>
              {latestSubmission.reviewComment && <p className="mt-2 text-stone-600">{latestSubmission.reviewComment}</p>}
              {latestSubmission.reviewPoints != null && (
                <p className="mt-2 font-semibold">Баллы: {latestSubmission.reviewPoints}{latestSubmission.reviewCoins ? ` · Coins: ${latestSubmission.reviewCoins}` : ""}</p>
              )}
            </div>
          )}

          {canSubmit && (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {message && <p className="rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{message}</p>}
              {error && <p className="rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}
              <p className="text-xs font-bold uppercase tracking-wider text-stone-400">
                Формат: {attachmentTypeLabels[assignment.submissionFormat as HomeworkAttachmentType]}
              </p>
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                className="min-h-32 w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
                placeholder="Ваш ответ или комментарий"
                required={assignment.submissionFormat === "text"}
              />
              {assignment.submissionFormat !== "text" && (
                <input
                  type="url"
                  value={attachmentUrl}
                  onChange={(event) => setAttachmentUrl(event.target.value)}
                  className="w-full rounded-2xl border border-stone-200 px-4 py-3 text-sm"
                  placeholder="Ссылка на материал"
                  required
                />
              )}
              <button disabled={submitting} className="inline-flex items-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-bold text-white disabled:opacity-50">
                {submitting ? <LoaderCircle className="animate-spin" size={16} /> : <Send size={16} />}
                Сдать задание
              </button>
            </form>
          )}
        </section>
      )}
    </>
  );
}

function Summary({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">{label}</p>
      <p className="mt-1 text-sm leading-7 text-emerald-900">{value}</p>
    </div>
  );
}
