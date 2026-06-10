"use client";

import { ArrowLeft, CheckCircle2, ExternalLink, LoaderCircle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { inputClass, primaryButton, secondaryButton } from "@/components/admin-ui";
import { HomeworkAttemptTimeline } from "@/components/homework-attempt-timeline";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { useApiResource } from "@/hooks/use-api-resource";
import { ApiError } from "@/lib/api-client";
import { attachmentTypeLabels } from "@/lib/homework-ui";
import { homeworkReviewApi } from "@/lib/homework-review-api";

export default function HomeworkReviewDetailPage() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const router = useRouter();
  const resource = useApiResource(async () => {
    const [item, attemptsData] = await Promise.all([
      homeworkReviewApi.get(submissionId),
      homeworkReviewApi.attempts(submissionId),
    ]);
    return { item, attempts: attemptsData.attempts };
  }, [submissionId]);
  const [reviewComment, setReviewComment] = useState("");
  const [acting, setActing] = useState<"approve" | "reject" | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleReview(action: "approve" | "reject") {
    if (action === "reject" && !reviewComment.trim()) {
      setActionError("Комментарий обязателен при возврате на доработку");
      return;
    }
    setActing(action);
    setActionError(null);
    setSuccess(null);
    try {
      const result = await homeworkReviewApi.review(submissionId, {
        action,
        reviewComment: reviewComment.trim() || undefined,
      });
      setSuccess(
        action === "approve"
          ? `Работа принята. Урок: ${result.lessonStatus}${result.pointsAwarded ? ", баллы начислены" : ""}.`
          : "Работа возвращена на доработку. Урок снова доступен ученику.",
      );
      await resource.reload();
    } catch (reason) {
      setActionError(reason instanceof ApiError ? reason.message : "Не удалось обновить статус работы");
    } finally {
      setActing(null);
    }
  }

  if (resource.loading) return <LoadingState label="Открываем работу" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data) return <EmptyState title="Работа не найдена" description="Возможно, она была удалена." />;

  const { item, attempts } = resource.data;
  const canReview = item.status === "submitted" || item.status === "under_review";

  return (
    <>
      <Link href="/admin/homework-review" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-stone-500">
        <ArrowLeft size={16} /> Назад к очереди
      </Link>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <section className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">Работа ученика</p>
          <h1 className="font-display mt-3 text-4xl">{item.studentName}</h1>
          <p className="mt-1 text-sm text-stone-500">{item.studentEmail}</p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Info label="Курс" value={item.courseTitle} />
            <Info label="Модуль" value={item.moduleTitle} />
            <Info label="Урок" value={item.lessonTitle} />
            <Info label="Прогресс урока" value={item.lessonProgressStatus ?? "—"} />
          </div>

          <div className="mt-8">
            <h2 className="font-display text-2xl">Задание</h2>
            <p className="mt-3 text-sm leading-7 text-stone-600">{item.homeworkDescription}</p>
          </div>

          <div className="mt-8">
            <h2 className="font-display text-2xl">Комментарий ученика</h2>
            <p className="mt-3 rounded-2xl bg-stone-50 p-4 text-sm leading-7 text-stone-600">
              {item.studentComment || "Комментарий не указан"}
            </p>
          </div>

          {item.homeworkType === "test" && item.testScore != null && (
            <div className={`mt-8 rounded-2xl border p-5 ${
              item.testPassed ? "border-emerald-100 bg-emerald-50" : "border-red-100 bg-red-50"
            }`}>
              <p className="text-xs font-bold uppercase tracking-wider text-stone-500">Результат теста</p>
              <p className="font-display mt-2 text-4xl">{item.testScore}%</p>
              <p className="mt-1 text-sm font-bold">{item.testPassed ? "Проходной балл набран" : "Проходной балл не набран"}</p>
            </div>
          )}

          {item.attachmentUrl && (
            <div className="mt-8">
              <h2 className="font-display text-2xl">Материалы ученика</h2>
              {item.attachmentType && (
                <p className="mt-2 text-xs font-bold uppercase tracking-wider text-stone-400">
                  Тип: {attachmentTypeLabels[item.attachmentType as keyof typeof attachmentTypeLabels] ?? item.attachmentType}
                </p>
              )}
              <a
                href={item.attachmentUrl}
                target="_blank"
                rel="noreferrer"
                className={`${secondaryButton} mt-3`}
              >
                <ExternalLink size={16} /> Открыть ссылку ученика
              </a>
            </div>
          )}

          <HomeworkAttemptTimeline attempts={attempts} currentSubmissionId={submissionId} />

          {item.reviewComment && (
            <div className="mt-8">
              <h2 className="font-display text-2xl">Комментарий преподавателя</h2>
              <p className="mt-3 rounded-2xl border border-stone-200 bg-white p-4 text-sm leading-7 text-stone-600">
                {item.reviewComment}
              </p>
            </div>
          )}
        </section>

        <aside className="space-y-5">
          <div className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">Решение</p>
            {item.pointsReward != null && (
              <p className="mt-4 text-sm text-stone-500">
                За урок: <span className="font-bold text-ink">+{item.pointsReward} баллов</span>
              </p>
            )}

            <label className="mt-5 block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-400">
                Комментарий преподавателя
              </span>
              <textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                disabled={!canReview || !!acting}
                placeholder={canReview ? "Обязателен при возврате на доработку" : "Работа уже проверена"}
                className={`${inputClass} min-h-28`}
              />
            </label>

            <div className="mt-5 space-y-3">
              <button
                disabled={!canReview || acting !== null}
                onClick={() => handleReview("approve")}
                className={`${primaryButton} w-full`}
              >
                {acting === "approve" ? <LoaderCircle className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                Принять работу
              </button>
              <button
                disabled={!canReview || acting !== null}
                onClick={() => handleReview("reject")}
                className={`${secondaryButton} w-full`}
              >
                {acting === "reject" ? <LoaderCircle className="animate-spin" size={16} /> : <RotateCcw size={16} />}
                Вернуть на доработку
              </button>
            </div>
          </div>

          {success && (
            <div className="rounded-[24px] border border-emerald-100 bg-emerald-50 p-5 text-sm font-bold text-emerald-800">
              <CheckCircle2 className="mb-2" size={18} />
              {success}
            </div>
          )}
          {actionError && (
            <div className="rounded-[24px] border border-red-100 bg-red-50 p-5 text-sm font-bold text-red-700">
              {actionError}
            </div>
          )}

          {!canReview && (
            <button onClick={() => router.push("/admin/homework-review")} className={`${secondaryButton} w-full`}>
              Вернуться к очереди
            </button>
          )}
        </aside>
      </div>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-stone-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-stone-400">{label}</p>
      <p className="mt-1 text-sm font-bold text-ink">{value}</p>
    </div>
  );
}
