"use client";

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileImage,
  FileText,
  Link2,
  LoaderCircle,
  Play,
  Sparkles,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { HomeworkAttemptHistory } from "@/components/homework-attempt-history";
import { HomeworkSubmissionForm } from "@/components/homework-submission-form";
import { HomeworkTestForm } from "@/components/homework-test-form";
import { HomeworkTestResult } from "@/components/homework-test-result";
import { LessonVideoPlayer } from "@/components/lesson-video-player";
import { StatusBadge } from "@/components/status-badge";
import { MarkdownContent } from "@/components/markdown-content";
import { useApiResource } from "@/hooks/use-api-resource";
import { flattenCourseLessons, normalizeLessonStatus, toLesson } from "@/lib/adapters";
import { ApiError, api } from "@/lib/api-client";
import { lessonStatusHints, testLessonStatusHints } from "@/lib/homework-ui";
import { lessonStatusLabels } from "@/lib/ui";
import type { HomeworkAttachmentType } from "@/types/homework";
import type { Lesson } from "@/types";

function materialIcon(type: string) {
  if (type === "image") return <FileImage size={19} />;
  if (type === "link") return <Link2 size={19} />;
  return <FileText size={19} />;
}

function canSubmitHomework(lesson: Lesson) {
  return lesson.status === "in_progress";
}

function submitDisabledReason(lesson: Lesson, isTest: boolean) {
  if (lesson.status === "locked") return "Урок закрыт. Сначала завершите предыдущий урок.";
  if (isTest && lesson.status === "completed") return "Тест пройден. Урок завершён.";
  if (!isTest && (lesson.status === "submitted" || lesson.status === "reviewed")) {
    return "Работа отправлена на проверку. Дождитесь ответа преподавателя.";
  }
  if (!isTest && lesson.status === "completed") return "Урок завершён. Повторная отправка недоступна.";
  return undefined;
}

export default function LessonPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const resource = useApiResource(async () => {
    const detail = await api.lesson(lessonId);
    const [progress, course, attempts] = await Promise.all([
      api.progress(detail.courseId),
      api.course(detail.courseId),
      detail.homework?.id ? api.myHomeworkSubmissions(detail.homework.id) : Promise.resolve([]),
    ]);
    const progressItem = progress.lessons.find((item) => item.lessonId === lessonId);
    const lessons = flattenCourseLessons(course, progress.lessons);
    const currentIndex = lessons.findIndex((lesson) => lesson.id === lessonId);
    const nextLesson = lessons.slice(currentIndex + 1).find((lesson) => lesson.status !== "locked") ?? null;
    return {
      detail,
      lesson: toLesson(detail, progressItem?.status),
      attempts,
      nextLesson,
      points: progress.points,
    };
  }, [lessonId]);

  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (resource.loading) return <LoadingState label="Открываем урок" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data) return <EmptyState title="Урок не найден" description="Возможно, урок больше недоступен." />;

  const { detail, lesson, attempts, nextLesson } = resource.data;
  const isTestHomework = detail.homework?.type === "test";
  const testQuestions = detail.homework?.testQuestions ?? [];
  const passingScore = detail.homework?.passingScore ?? 70;
  const locked = lesson.status === "locked";
  const lessonStarted = !locked && lesson.status !== "available";
  const latestAttempt = attempts.length ? attempts[attempts.length - 1] : null;
  const latestReview = [...attempts].reverse().find((attempt) => attempt.reviewComment && (!isTestHomework || attempt.status !== "rejected"));
  const statusHints = isTestHomework ? testLessonStatusHints : lessonStatusHints;

  async function handleStart() {
    setStarting(true);
    setActionError(null);
    try {
      await api.startLesson(lessonId);
      await resource.reload();
      setSuccess("Урок начат. Можно смотреть видео и готовить домашнее задание.");
    } catch (reason) {
      setActionError(reason instanceof ApiError ? reason.message : "Не удалось начать урок");
    } finally {
      setStarting(false);
    }
  }

  async function handleSubmit(payload: {
    comment?: string;
    attachmentUrl?: string;
    attachmentType?: HomeworkAttachmentType;
    testAnswers?: Record<string, string>;
  }) {
    if (!lesson.homeworkId) return;
    setSubmitting(true);
    setActionError(null);
    setSuccess(null);
    try {
      const result = await api.submitHomework(lesson.homeworkId, payload);
      const freshAttempts = await api.myHomeworkSubmissions(lesson.homeworkId);
      resource.setData((current) =>
        current
          ? {
              ...current,
              lesson: { ...current.lesson, status: normalizeLessonStatus(result.lessonProgress) },
              attempts: freshAttempts,
            }
          : current,
      );
      if (result.testResult) {
        setSuccess(
          result.testPassed
            ? `Тест пройден: ${result.testResult.score}% (${result.testResult.correctAnswers} из ${result.testResult.totalQuestions} правильных). Урок завершён.`
            : `Набрано ${result.testResult.score}% (${result.testResult.correctAnswers} из ${result.testResult.totalQuestions} правильных). Нужно не менее ${passingScore}%. Попробуйте ещё раз.`,
        );
      } else {
        setSuccess("Работа отправлена на проверку.");
      }
    } catch (reason) {
      setActionError(reason instanceof ApiError ? reason.message : "Не удалось отправить домашнее задание");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Link
        href={`/courses/${detail.courseId}`}
        className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-stone-500"
      >
        <ArrowLeft size={16} /> {detail.course.title}
      </Link>

      <div className="grid gap-7 xl:grid-cols-[1fr_360px]">
        <div>
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-gold">Урок {lesson.order}</span>
            <StatusBadge status={lesson.status} />
          </div>

          <h1 className="font-display text-5xl leading-tight sm:text-6xl">{lesson.title}</h1>

          {lesson.description && (
            <section className="mt-6">
              <h2 className="font-display text-2xl">Описание урока</h2>
              <MarkdownContent className="mt-3 max-w-3xl">{lesson.description}</MarkdownContent>
            </section>
          )}

          <div className="mt-8">
            <LessonVideoPlayer
              videoUrl={detail.videoUrl}
              title={lesson.title}
              locked={!lessonStarted}
              lockedLabel={lesson.status === "available" ? "Сначала начните урок" : undefined}
              lockedDescription={lesson.status === "available" ? "После старта откроются видео, материалы и задание" : undefined}
            />
          </div>

          <section className="mt-9">
            <h2 className="font-display text-3xl">Материалы урока</h2>
            {!lessonStarted ? (
              <p className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm font-bold text-amber-800">
                Начните урок, чтобы открыть видео, материалы и задание.
              </p>
            ) : lesson.materials.length ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {lesson.materials.map((material) => (
                  <a
                    href={material.url}
                    target="_blank"
                    rel="noreferrer"
                    key={material.id}
                    className="card-hover flex items-center gap-4 rounded-2xl border border-stone-200 bg-paper p-4 text-left shadow-soft"
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-stone-100 text-gold">
                      {materialIcon(material.type)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{material.title}</span>
                      <span className="mt-1 block text-xs text-stone-400">{material.type.toUpperCase()}</span>
                    </span>
                    <Download size={16} className="text-stone-400" />
                  </a>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-stone-500">К этому уроку пока нет дополнительных материалов.</p>
            )}
          </section>

          {lessonStarted && lesson.homeworkId && lesson.homeworkDescription && (
            <>
              {isTestHomework ? (
                testQuestions.length ? (
                  <>
                    {canSubmitHomework(lesson) ? (
                      <>
                        <HomeworkTestResult
                          passingScore={passingScore}
                          latestAttempt={latestAttempt}
                          lessonCompleted={false}
                        />
                        <HomeworkTestForm
                          key={attempts.length}
                          description={lesson.homeworkDescription}
                          questions={testQuestions}
                          passingScore={passingScore}
                          submitting={submitting}
                          onSubmit={(testAnswers) => handleSubmit({ testAnswers })}
                        />
                      </>
                    ) : (
                      <HomeworkTestResult
                        passingScore={passingScore}
                        latestAttempt={latestAttempt}
                        lessonCompleted={lesson.status === "completed"}
                      />
                    )}
                  </>
                ) : (
                  <div className="mt-9 rounded-[30px] border border-amber-100 bg-amber-50 p-6 text-sm font-bold text-amber-800">
                    Тест для этого урока ещё не настроен. Обратитесь к преподавателю.
                  </div>
                )
              ) : (
                <HomeworkSubmissionForm
                  homeworkDescription={lesson.homeworkDescription}
                  disabled={!canSubmitHomework(lesson)}
                  disabledReason={submitDisabledReason(lesson, false)}
                  submitting={submitting}
                  onSubmit={handleSubmit}
                />
              )}

              {latestReview && (lesson.status === "available" || lesson.status === "in_progress") && (
                <div className="mt-6 rounded-[24px] border border-amber-100 bg-amber-50 p-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-amber-700">Комментарий преподавателя</p>
                  <p className="mt-2 text-sm leading-7 text-amber-900">{latestReview.reviewComment}</p>
                  <p className="mt-2 text-xs text-amber-700">Исправьте работу и отправьте новую попытку.</p>
                </div>
              )}

              <HomeworkAttemptHistory attempts={attempts} isTest={isTestHomework} />
            </>
          )}
        </div>

        <aside className="space-y-5">
          <div className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">Статус урока</p>
            <span className="mt-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-gold">
              <Sparkles size={21} />
            </span>
            <h3 className="font-display mt-5 text-2xl">{lessonStatusLabels[lesson.status]}</h3>
            <p className="mt-3 text-sm leading-6 text-stone-500">{statusHints[lesson.status]}</p>

            {lesson.status === "available" && (
              <button
                onClick={handleStart}
                disabled={starting}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-ink px-4 py-3 text-sm font-bold text-white"
              >
                {starting ? <LoaderCircle size={16} className="animate-spin" /> : <Play size={16} />}
                Начать урок
              </button>
            )}
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

          <div className="overflow-hidden rounded-[28px] bg-ink p-6 text-white shadow-soft">
            <Trophy size={22} className="text-gold" />
            <p className="font-display mt-8 text-4xl">+{lesson.pointsReward}</p>
            <p className="mt-1 text-sm text-white/50">баллов за урок</p>
            <div className="mt-6 flex items-center gap-2 text-xs text-white/50">
              <CheckCircle2 size={15} />
              {lesson.status === "completed"
                ? "Баллы начислены"
                : isTestHomework
                  ? "Начислятся после прохождения теста"
                  : "Начислятся после проверки"}
            </div>
          </div>

          {nextLesson && lesson.status === "completed" && (
            <Link
              href={`/lessons/${nextLesson.id}`}
              className="card-hover flex items-center justify-between rounded-[28px] border border-stone-200 bg-paper p-5 shadow-soft"
            >
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-gold">Следующий урок</p>
                <p className="font-display mt-2 text-xl">{nextLesson.title}</p>
              </div>
              <ArrowRight size={18} className="text-gold" />
            </Link>
          )}
        </aside>
      </div>
    </>
  );
}
