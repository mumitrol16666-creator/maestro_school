"use client";

import { submitCourseHomeworkWithFile } from "@/lib/learning-homework-api";
import {
  ArrowRight,
  CheckCircle2,
  Download,
  FileImage,
  FileText,
  Link2,
  LoaderCircle,
  Play,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ScreenError } from "@/components/app-error-screen";
import { EmptyState } from "@/components/data-states";
import { HomeworkAttemptHistory } from "@/components/homework-attempt-history";
import { HomeworkSubmissionForm } from "@/components/homework-submission-form";
import { HomeworkTestForm } from "@/components/homework-test-form";
import { HomeworkTestResult } from "@/components/homework-test-result";
import { LessonEndActions } from "@/components/lesson-end-actions";
import { LessonVideoPlayer } from "@/components/lesson-video-player";
import { usePageBackTarget } from "@/components/back-button";
import { ScreenSkeleton } from "@/components/screen-skeleton";
import { StatusBadge } from "@/components/status-badge";
import { toast } from "@/components/toast";
import { MarkdownContent } from "@/components/markdown-content";
import { useApiResource } from "@/hooks/use-api-resource";
import { flattenCourseLessons, normalizeLessonStatus, toLesson } from "@/lib/adapters";
import { ApiError, api } from "@/lib/api-client";
import { errorToastText } from "@/lib/error-text";
import { lessonStatusHints, testLessonStatusHints } from "@/lib/homework-ui";
import { lessonStatusLabels } from "@/lib/ui";
import { triggerFileDownload } from "@/lib/file-download";
import { formatOutOf, type PluralForms } from "@/lib/plural";
import type { HomeworkAttachmentType } from "@/types/homework";
import type { Lesson } from "@/types";

const CORRECT_OF: PluralForms = ["правильного", "правильных", "правильных"];

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

const STALE_SCREEN_TOAST = "Нет связи. Обнови экран, когда появится интернет";

async function loadLesson(lessonId: string) {
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
    // В-26: «Урок N» is the position in the course (sort_order starts from 0 in the data).
    lessonNumber: currentIndex >= 0 ? currentIndex + 1 : null,
    attempts,
    nextLesson,
    points: progress.points,
  };
}

export default function LessonPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const resource = useApiResource(() => loadLesson(lessonId), [lessonId]);

  const [starting, setStarting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [testNote, setTestNote] = useState<{ text: string; passed: boolean } | null>(null);
  const [showStartPrompt, setShowStartPrompt] = useState(false);

  // В-7: the header «назад» leads from a lesson to its own course, not to the course list.
  usePageBackTarget(resource.data
    ? { href: `/courses/${resource.data.detail.courseId}`, label: resource.data.detail.course.title }
    : null);

  useEffect(() => {
    const attempts = resource.data?.attempts ?? [];
    const latest = attempts.length ? attempts[attempts.length - 1] : null;
    setShowStartPrompt(resource.data?.lesson.status === "available" && latest?.status !== "rejected");
  }, [resource.data?.lesson.id, resource.data?.lesson.status, resource.data?.attempts]);

  useEffect(() => {
    if (!resource.data || window.location.hash !== "#homework-revision") return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("homework-revision")?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [resource.data]);

  if (resource.loading && !resource.data) return <ScreenSkeleton variant="detail" label="Открываем урок" />;
  if (resource.error && !resource.data) return <ScreenError message={resource.error} code={resource.errorCode} retry={resource.reload} />;
  if (!resource.data) return <EmptyState title="Урок не найден" description="Возможно, урок больше недоступен." />;

  const { detail, lesson, lessonNumber, attempts, nextLesson } = resource.data;
  const isTestHomework = detail.homework?.type === "test";
  const testQuestions = detail.homework?.testQuestions ?? [];
  const passingScore = detail.homework?.passingScore ?? 70;
  const locked = lesson.status === "locked";
  const latestAttempt = attempts.length ? attempts[attempts.length - 1] : null;
  const needsRevision = latestAttempt?.status === "rejected";
  const lessonStarted = !locked && (lesson.status !== "available" || needsRevision);
  const statusHints = isTestHomework ? testLessonStatusHints : lessonStatusHints;

  // After a successful action the screen must show the new state: re-read it, and if that fails
  // (no connection), say so instead of silently keeping the old screen.
  async function refreshLesson() {
    try {
      resource.setData(await loadLesson(lessonId));
      return true;
    } catch {
      toast.error(STALE_SCREEN_TOAST);
      return false;
    }
  }

  async function handleStart() {
    setStarting(true);
    try {
      await api.startLesson(lessonId);
      setShowStartPrompt(false);
      if (await refreshLesson()) toast.success("Урок начат");
    } catch (reason) {
      toast.error(errorToastText(reason, "Не получилось начать урок. Попробуй ещё раз"));
    } finally {
      setStarting(false);
    }
  }

  async function handleSubmit(payload: {
    comment?: string;
    attachmentUrl?: string;
    attachmentType?: HomeworkAttachmentType;
    testAnswers?: Record<string, string>;
    file?: File;
  }) {
    if (!lesson.homeworkId) return;
    setSubmitting(true);
    setTestNote(null);
    try {
      const result = payload.file
        ? await submitCourseHomeworkWithFile(lesson.homeworkId, { comment: payload.comment, file: payload.file })
        : await api.submitHomework(lesson.homeworkId, payload);
      if (result.testResult) {
        setTestNote(
          result.testPassed
            ? {
                passed: true,
                text: `Тест пройден: ${result.testResult.score}% (${formatOutOf(result.testResult.correctAnswers, result.testResult.totalQuestions, CORRECT_OF)}). Урок завершён.`,
              }
            : {
                passed: false,
                text: `Набрано ${result.testResult.score}% (${formatOutOf(result.testResult.correctAnswers, result.testResult.totalQuestions, CORRECT_OF)}). Нужно не менее ${passingScore}%. Попробуй ещё раз.`,
              },
        );
      } else {
        toast.success("Задание отправлено на проверку");
      }
      const refreshed = await refreshLesson();
      if (!refreshed) {
        // The answer is saved but the screen could not be re-read: at least move the status.
        resource.setData((current) =>
          current ? { ...current, lesson: { ...current.lesson, status: normalizeLessonStatus(result.lessonProgress) } } : current,
        );
      }
    } catch (reason) {
      toast.error(errorToastText(reason, "Не получилось отправить задание. Попробуй ещё раз"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCompleteWithoutHomework() {
    if (completing) return;
    setCompleting(true);
    setTestNote(null);
    try {
      const result = await api.completeLesson(lessonId);
      if (await refreshLesson()) {
        toast.success(result.courseCompleted ? "Курс завершён" : "Урок завершён. Следующий урок открыт");
      }
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === "LESSON_REQUIRES_HOMEWORK") {
        await refreshLesson();
      }
      toast.error(errorToastText(reason, "Не получилось завершить урок. Попробуй ещё раз"));
    } finally {
      setCompleting(false);
    }
  }

  return (
    <>
      {showStartPrompt && lesson.status === "available" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/75 px-4 py-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-xl rounded-[32px] border border-white/10 bg-paper p-6 shadow-soft sm:p-8">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-gold-ink">Урок готов</p>
                <h2 className="font-display mt-3 text-3xl leading-tight text-ink sm:text-4xl">{lesson.title}</h2>
              </div>
              <StatusBadge status={lesson.status} />
            </div>

            <div className="rounded-[24px] border border-amber-100 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
              Нажмите «Начать урок», чтобы открыть видео, материалы и домашнее задание.
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
              <button
                type="button"
                onClick={() => setShowStartPrompt(false)}
                className="min-h-11 rounded-2xl border border-stone-200 px-5 py-3 text-sm font-bold text-stone-600"
              >
                Сначала посмотреть описание
              </button>
              <button
                type="button"
                onClick={handleStart}
                disabled={starting}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-ink px-6 py-3 text-sm font-bold text-white disabled:opacity-60"
              >
                {starting ? <LoaderCircle size={16} className="animate-spin" /> : <Play size={16} fill="currentColor" />}
                Начать урок
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-7 xl:grid-cols-[1fr_360px]">
        <div>
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wide text-gold-ink">{lessonNumber ? `Урок ${lessonNumber}` : "Урок"}</span>
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
                  <button
                    type="button"
                    onClick={() => {
                      if (material.type === "link") {
                        window.open(material.url ?? material.downloadUrl, "_blank", "noopener,noreferrer");
                        return;
                      }
                      void triggerFileDownload(material.downloadUrl ?? material.url, material.title);
                    }}
                    key={material.id}
                    className="card-hover w-full rounded-2xl border border-stone-200 bg-paper p-4 text-left shadow-soft"
                  >
                    {material.previewUrl ? (
                      <span className="mb-4 block overflow-hidden rounded-xl border border-stone-100 bg-stone-50">
                        <img src={material.previewUrl} alt={material.title} className="max-h-64 w-full object-contain" loading="lazy" />
                      </span>
                    ) : null}
                    <span className="flex items-center gap-4">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-stone-100 text-gold-ink">
                        {materialIcon(material.type)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{material.title}</span>
                        <span className="mt-1 block text-xs text-stone-400">
                          {material.type.toUpperCase()} · {material.type === "link" ? "Открыть" : "Скачать"}
                        </span>
                      </span>
                      <Download size={16} className="shrink-0 text-stone-400" />
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-stone-500">К этому уроку пока нет дополнительных материалов.</p>
            )}
          </section>

          {lessonStarted && !detail.homework && lesson.status === "in_progress" && (
            <section className="mt-9 rounded-[28px] border border-emerald-100 bg-emerald-50 p-6">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Завершение урока</p>
              <h2 className="font-display mt-2 text-3xl text-ink">Материал изучен?</h2>
              <p className="mt-3 text-sm leading-6 text-stone-600">
                У этого урока нет домашнего задания. Подтвердите изучение, чтобы открыть следующий урок.
              </p>
              <button
                type="button"
                onClick={() => void handleCompleteWithoutHomework()}
                disabled={completing}
                className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
              >
                {completing ? <LoaderCircle size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {completing ? "Завершаем…" : "Урок изучен"}
              </button>
            </section>
          )}

          {lessonStarted && lesson.homeworkId && lesson.homeworkDescription && (
            <>
              {needsRevision && (
                <section id="homework-revision" className="mt-9 scroll-mt-32 rounded-[28px] border border-red-100 bg-red-50 p-5 sm:p-6">
                  <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-red-700">
                    <RotateCcw size={15} /> Нужна доработка
                  </p>
                  <h2 className="font-display mt-2 text-2xl text-red-950">
                    {isTestHomework ? "Повторите тест" : "Исправьте работу и отправьте снова"}
                  </h2>
                  {latestAttempt.reviewComment ? (
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-red-900">
                      {latestAttempt.reviewComment}
                    </p>
                  ) : (
                    <p className="mt-3 text-sm leading-7 text-red-900">
                      Откройте предыдущую попытку ниже, внесите исправления и отправьте работу повторно.
                    </p>
                  )}
                  {lesson.status === "available" ? (
                    <button
                      type="button"
                      onClick={() => void handleStart()}
                      disabled={starting}
                      className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-800 px-4 text-sm font-bold text-white disabled:opacity-60"
                    >
                      {starting ? <LoaderCircle size={16} className="animate-spin" /> : <Play size={16} />}
                      Продолжить доработку
                    </button>
                  ) : null}
                </section>
              )}

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
                  key={`${lesson.id}:${latestAttempt?.id ?? "new"}`}
                  homeworkDescription={lesson.homeworkDescription}
                  revision={needsRevision}
                  initialSubmission={needsRevision ? latestAttempt : null}
                  disabled={!canSubmitHomework(lesson)}
                  disabledReason={submitDisabledReason(lesson, false)}
                  submitting={submitting}
                  onSubmit={handleSubmit}
                />
              )}

              <HomeworkAttemptHistory attempts={attempts} isTest={isTestHomework} />
            </>
          )}

          {lessonStarted && detail.endActions?.hasActions && (
            <LessonEndActions
              lessonId={lesson.id}
              lessonTitle={lesson.title}
              endActions={detail.endActions}
              onSignupComplete={(message) => {
                toast.success(message);
                void refreshLesson();
              }}
            />
          )}
        </div>

        <aside className="space-y-5">
          <div className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">Статус урока</p>
            <span className="mt-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-gold-ink">
              <Sparkles size={21} />
            </span>
            <h3 className="font-display mt-5 text-2xl">{lessonStatusLabels[lesson.status]}</h3>
            <p className="mt-3 text-sm leading-6 text-stone-500">{statusHints[lesson.status]}</p>

            {lesson.status === "available" && (
              <button
                onClick={handleStart}
                disabled={starting}
                className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-ink px-4 py-3 text-sm font-bold text-white"
              >
                {starting ? <LoaderCircle size={16} className="animate-spin" /> : <Play size={16} />}
                Начать урок
              </button>
            )}
          </div>

          {testNote && (
            <div
              role="status"
              className={`rounded-[24px] border p-5 text-sm font-bold ${
                testNote.passed ? "border-emerald-100 bg-emerald-50 text-emerald-800" : "border-amber-100 bg-amber-50 text-amber-900"
              }`}
            >
              {testNote.passed ? <CheckCircle2 className="mb-2" size={18} /> : <RotateCcw className="mb-2" size={18} />}
              {testNote.text}
            </div>
          )}

          {nextLesson && lesson.status === "completed" && (
            <Link
              href={`/lessons/${nextLesson.id}`}
              className="card-hover flex items-center justify-between rounded-[28px] border border-stone-200 bg-paper p-5 shadow-soft"
            >
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-gold-ink">Следующий урок</p>
                <p className="font-display mt-2 text-xl">{nextLesson.title}</p>
              </div>
              <ArrowRight size={18} className="text-gold-ink" />
            </Link>
          )}
        </aside>
      </div>
    </>
  );
}
