"use client";

import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Download,
  ExternalLink,
  LoaderCircle,
  MessageSquareText,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { inputClass, primaryButton, secondaryButton } from "@/components/admin-ui";
import { HomeworkAttemptTimeline } from "@/components/homework-attempt-timeline";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { useApiResource } from "@/hooks/use-api-resource";
import { ApiError } from "@/lib/api-client";
import { homeworkReviewApi } from "@/lib/homework-review-api";
import { learningHomeworkApi } from "@/lib/learning-homework-api";
import type { LearningHomeworkMaterial } from "@/types/learning-homework";
import type { LearningHomeworkReviewDetail } from "@/types/homework-review";

type ReviewAction =
  | "approve"
  | "reject"
  | "accepted"
  | "accepted_with_comment"
  | "revision";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Aqtobe",
  }).format(new Date(value));
}

function AttemptMaterial({
  material,
  onError,
}: {
  material: LearningHomeworkMaterial;
  onError: (message: string) => void;
}) {
  const className = "inline-flex min-h-10 max-w-full items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-xs font-bold text-ink";
  if (material.privateFile) {
    return (
      <button
        type="button"
        onClick={() => void learningHomeworkApi.downloadMaterial(material).catch((reason) => {
          onError(reason instanceof ApiError ? reason.message : "Не удалось скачать файл");
        })}
        className={className}
      >
        <Download size={14} className="shrink-0 text-gold" />
        <span className="truncate">{material.title || "Файл ученика"}</span>
      </button>
    );
  }
  return (
    <a href={material.url} target="_blank" rel="noreferrer" className={className}>
      <ExternalLink size={14} className="shrink-0 text-gold" />
      <span className="truncate">{material.title || "Материал ученика"}</span>
    </a>
  );
}

function LearningAttemptHistory({
  item,
  onError,
}: {
  item: LearningHomeworkReviewDetail;
  onError: (message: string) => void;
}) {
  return (
    <section className="mt-8 border-t border-stone-100 pt-6">
      <h2 className="font-display text-2xl">История ответов</h2>
      <div className="mt-4 space-y-3">
        {item.attempts.map((attempt) => (
          <article key={attempt.id} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-black text-ink">
                Ответ ученика
              </p>
              <time className="text-xs font-semibold text-stone-400">{formatDate(attempt.submittedAt)}</time>
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-stone-600">
              {attempt.submissionMode === "ready_for_lesson"
                ? `Ученик подготовился. Проверить выполнение на уроке.${attempt.text ? ` ${attempt.text}` : ""}`
                : attempt.text || "Ученик отправил материал без текстового комментария."}
            </p>
            {attempt.materials.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {attempt.materials.map((material, index) => (
                  <AttemptMaterial
                    key={`${material.url}-${index}`}
                    material={{ ...material, title: material.title || `Материал ${index + 1}` }}
                    onError={onError}
                  />
                ))}
              </div>
            ) : null}
            {attempt.review ? (
              <div className={`mt-3 rounded-xl border p-3 text-sm ${
                attempt.review.decision === "revision"
                  ? "border-red-100 bg-red-50 text-red-950"
                  : "border-emerald-100 bg-emerald-50 text-emerald-950"
              }`}>
                <p className="font-black">
                  {attempt.review.decision === "revision"
                    ? "Возвращено на доработку"
                    : attempt.review.decision === "accepted_with_comment"
                      ? "Принято с замечанием"
                      : "Принято"}
                </p>
                {attempt.review.comment ? <p className="mt-1 whitespace-pre-wrap">{attempt.review.comment}</p> : null}
                <p className="mt-2 text-xs opacity-70">
                  {attempt.review.reviewerName} · {formatDate(attempt.review.reviewedAt)}
                </p>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

export default function HomeworkReviewDetailPage() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const router = useRouter();
  const resource = useApiResource(async () => {
    const item = await homeworkReviewApi.get(submissionId);
    if (item.model === "learning_homework_v2") {
      return { item, legacyAttempts: null };
    }
    const attemptsData = await homeworkReviewApi.attempts(submissionId);
    return { item, legacyAttempts: attemptsData.attempts };
  }, [submissionId]);
  const [reviewComment, setReviewComment] = useState("");
  const [acting, setActing] = useState<ReviewAction | null>(null);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [success, setSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleReview(action: ReviewAction) {
    const item = resource.data?.item;
    if (!item || acting) return;
    const comment = reviewComment.trim();
    if (["reject", "revision", "accepted_with_comment"].includes(action) && !comment) {
      setActionError(
        action === "accepted_with_comment"
          ? "Добавьте замечание преподавателя"
          : "Комментарий обязателен при возврате на доработку",
      );
      return;
    }
    setActing(action);
    setActionError(null);
    setSuccess(null);
    try {
      if (item.model === "learning_homework_v2") {
        const decision = action as "revision" | "accepted" | "accepted_with_comment";
        await homeworkReviewApi.reviewLearning(item.recipientId!, {
          decision,
          comment: comment || null,
          idempotencyKey: requestKey,
        });
        setSuccess(
          decision === "revision"
            ? "Работа возвращена на доработку. Комментарий отправлен ученику."
            : decision === "accepted_with_comment"
              ? "Работа принята с замечанием. Процент темы не изменён."
              : "Работа принята. Процент темы не изменён.",
        );
      } else {
        const legacyAction = action === "approve" ? "approve" : "reject";
        const result = await homeworkReviewApi.review(submissionId, {
          action: legacyAction,
          reviewComment: comment || undefined,
        });
        setSuccess(
          legacyAction === "approve"
            ? `Работа принята. Урок: ${result.lessonStatus}${result.pointsAwarded ? ", баллы начислены" : ""}.`
            : "Работа возвращена на доработку. Урок снова доступен ученику.",
        );
      }
      setRequestKey(crypto.randomUUID());
      await resource.reload();
    } catch (reason) {
      setActionError(reason instanceof ApiError ? reason.message : "Не удалось сохранить решение");
    } finally {
      setActing(null);
    }
  }

  if (resource.loading) return <LoadingState label="Открываем работу" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data) return <EmptyState title="Работа не найдена" description="Возможно, она была удалена." />;

  const { item, legacyAttempts } = resource.data;
  const learningItem = item.model === "learning_homework_v2"
    ? item as LearningHomeworkReviewDetail
    : null;
  const canReview = learningItem
    ? learningItem.canReview
    : item.status === "submitted" || item.status === "under_review";

  return (
    <>
      <Link href="/admin/homework-review" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-stone-500">
        <ArrowLeft size={16} /> Назад к очереди
      </Link>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 rounded-[28px] border border-stone-200 bg-paper p-5 shadow-soft sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">
            {learningItem ? "Школьное домашнее задание" : "Задание курса"}
          </p>
          <h1 className="mt-3 break-words font-display text-3xl sm:text-4xl">{item.studentName}</h1>
          {item.studentEmail ? <p className="mt-1 break-all text-sm text-stone-500">{item.studentEmail}</p> : null}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {learningItem ? (
              <>
                <Info label="Направление" value={learningItem.courseTitle} />
                <Info label="Тема" value={learningItem.moduleTitle} />
                <Info label="Прогресс темы" value={`${learningItem.topicProgressPercent ?? 0}%`} />
                <Info
                  label="Формат ответа"
                  value={learningItem.submissionMode === "ready_for_lesson" ? "Проверить на уроке" : "Материалы ученика"}
                />
              </>
            ) : (
              <>
                <Info label="Курс" value={item.courseTitle} />
                <Info label="Модуль" value={item.moduleTitle} />
                <Info label="Урок" value={item.lessonTitle} />
                <Info label="Прогресс урока" value={item.lessonProgressStatus ?? "—"} />
              </>
            )}
          </div>

          <div className="mt-8">
            <h2 className="font-display text-2xl">Задание</h2>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-stone-600">{item.homeworkDescription}</p>
          </div>

          {learningItem ? (
            <>
              <div className="mt-6 rounded-2xl border border-amber-100 bg-amber-50 p-4">
                <p className="text-[10px] font-black uppercase text-amber-800">Критерий освоения темы</p>
                <p className="mt-2 text-sm leading-6 text-amber-950">{learningItem.masteryCriteria}</p>
              </div>
              <LearningAttemptHistory item={learningItem} onError={setActionError} />
            </>
          ) : (
            <>
              <div className="mt-8">
                <h2 className="font-display text-2xl">Комментарий ученика</h2>
                <p className="mt-3 rounded-2xl bg-stone-50 p-4 text-sm leading-7 text-stone-600">
                  {item.studentComment || "Комментарий не указан"}
                </p>
              </div>
              {item.attachmentUrl ? (
                <a href={item.attachmentUrl} target="_blank" rel="noreferrer" className={`${secondaryButton} mt-5`}>
                  <ExternalLink size={16} /> Открыть материал ученика
                </a>
              ) : null}
              <HomeworkAttemptTimeline attempts={legacyAttempts ?? []} currentSubmissionId={submissionId} />
            </>
          )}
        </section>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <section className="rounded-[28px] border border-stone-200 bg-paper p-5 shadow-soft sm:p-6">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-gold">
                <MessageSquareText size={18} />
              </span>
              <div>
                <p className="text-xs font-black uppercase text-stone-400">Решение</p>
                <p className="mt-1 text-sm font-bold text-ink">
                  {canReview ? "Работа ждёт проверки" : "Решение сохранено"}
                </p>
              </div>
            </div>

            {learningItem ? (
              <p className="mt-4 rounded-xl bg-stone-50 p-3 text-xs font-semibold leading-5 text-stone-600">
                Проверка ДЗ не меняет процент темы. Прогресс фиксируется отдельным действием на уроке.
              </p>
            ) : null}

            <label className="mt-5 block">
              <span className="mb-2 block text-xs font-bold uppercase text-stone-400">Комментарий преподавателя</span>
              <textarea
                value={reviewComment}
                onChange={(event) => setReviewComment(event.target.value)}
                disabled={!canReview || Boolean(acting)}
                placeholder={canReview ? "Обязателен для доработки и принятия с замечанием" : "Работа уже проверена"}
                className={`${inputClass} min-h-28 resize-y`}
              />
            </label>

            <div className="mt-5 grid gap-2">
              {learningItem ? (
                <>
                  <button disabled={!canReview || Boolean(acting)} onClick={() => void handleReview("accepted")} className={`${primaryButton} w-full`}>
                    {acting === "accepted" ? <LoaderCircle className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                    Принять
                  </button>
                  <button disabled={!canReview || Boolean(acting)} onClick={() => void handleReview("accepted_with_comment")} className={`${secondaryButton} w-full`}>
                    {acting === "accepted_with_comment" ? <LoaderCircle className="animate-spin" size={16} /> : <BookOpen size={16} />}
                    Принять с замечанием
                  </button>
                  <button disabled={!canReview || Boolean(acting)} onClick={() => void handleReview("revision")} className={`${secondaryButton} w-full text-red-700`}>
                    {acting === "revision" ? <LoaderCircle className="animate-spin" size={16} /> : <RotateCcw size={16} />}
                    На доработку
                  </button>
                </>
              ) : (
                <>
                  <button disabled={!canReview || Boolean(acting)} onClick={() => void handleReview("approve")} className={`${primaryButton} w-full`}>
                    {acting === "approve" ? <LoaderCircle className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                    Принять работу
                  </button>
                  <button disabled={!canReview || Boolean(acting)} onClick={() => void handleReview("reject")} className={`${secondaryButton} w-full`}>
                    {acting === "reject" ? <LoaderCircle className="animate-spin" size={16} /> : <RotateCcw size={16} />}
                    Вернуть на доработку
                  </button>
                </>
              )}
            </div>
          </section>

          {success ? <Notice tone="success" text={success} /> : null}
          {actionError ? <Notice tone="error" text={actionError} /> : null}
          {!canReview ? (
            <button onClick={() => router.push("/admin/homework-review")} className={`${secondaryButton} w-full`}>
              Вернуться к очереди
            </button>
          ) : null}
        </aside>
      </div>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-stone-50 p-4">
      <p className="text-xs font-bold uppercase text-stone-400">{label}</p>
      <p className="mt-1 break-words text-sm font-bold text-ink">{value}</p>
    </div>
  );
}

function Notice({ tone, text }: { tone: "success" | "error"; text: string }) {
  return (
    <div className={`rounded-2xl border p-4 text-sm font-bold ${
      tone === "success"
        ? "border-emerald-100 bg-emerald-50 text-emerald-800"
        : "border-red-100 bg-red-50 text-red-700"
    }`}>
      {text}
    </div>
  );
}
