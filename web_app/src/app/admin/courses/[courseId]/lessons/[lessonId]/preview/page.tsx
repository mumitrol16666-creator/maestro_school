"use client";

import { ArrowLeft, Download, Eye, FileImage, FileText, Link2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { secondaryButton } from "@/components/admin-ui";
import { ErrorState, LoadingState } from "@/components/data-states";
import { LessonVideoPlayer } from "@/components/lesson-video-player";
import { MarkdownContent } from "@/components/markdown-content";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { lessonPreviewApi } from "@/lib/lesson-preview-api";

function materialIcon(type: string) {
  if (type === "image") return <FileImage size={19} />;
  if (type === "link") return <Link2 size={19} />;
  return <FileText size={19} />;
}

/**
 * The lesson as the student sees it once it is open: video, description, materials and the task or
 * the test (read only, without the answers). Nothing here is saved: no progress, no enrollment.
 */
export default function LessonPreviewPage() {
  const { courseId, lessonId } = useParams<{ courseId: string; lessonId: string }>();
  const resource = useApiResource(() => lessonPreviewApi.get(lessonId), [lessonId]);
  const back = `/admin/courses/${courseId}`;

  if (resource.loading && !resource.data) return <LoadingState label="Открываем урок как ученик" />;
  if (resource.error && !resource.data) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data) return null;
  const lesson = resource.data;
  const homework = lesson.homework;

  return (
    <>
      <PageHeader
        eyebrow="Просмотр глазами ученика"
        title={lesson.title}
        description={`Курс «${lesson.course.title}»`}
        action={<Link href={back} className={`${secondaryButton} w-full sm:w-auto`}><ArrowLeft size={16} />К редактору курса</Link>}
      />
      <p
        data-testid="preview-banner"
        className="mb-6 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold leading-6 text-amber-900"
      >
        <Eye size={16} className="mt-1 shrink-0" />
        <span>Так урок видит ученик, когда он открыт. Это просмотр: ответы не принимаются, прогресс и баллы не меняются.</span>
      </p>

      <div className="max-w-4xl space-y-9">
        <LessonVideoPlayer videoUrl={lesson.videoUrl} title={lesson.title} />

        {lesson.description ? (
          <section>
            <h2 className="font-display text-2xl">Описание урока</h2>
            <MarkdownContent className="mt-3">{lesson.description}</MarkdownContent>
          </section>
        ) : null}

        <section>
          <h2 className="font-display text-2xl">Материалы урока</h2>
          {lesson.materials.length ? (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {lesson.materials.map((material) => (
                <li key={material.id}>
                  <a
                    href={material.media?.url ?? material.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-11 w-full items-center gap-4 rounded-2xl border border-stone-200 bg-paper p-4 shadow-soft"
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-stone-100 text-gold-ink">{materialIcon(material.type)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{material.title}</span>
                      <span className="mt-1 block text-xs text-stone-400">{material.type.toUpperCase()} · {material.type === "link" ? "Открыть" : "Скачать"}</span>
                    </span>
                    <Download size={16} className="shrink-0 text-stone-400" />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-stone-500">К этому уроку материалов нет.</p>
          )}
        </section>

        <section data-testid="preview-homework">
          <h2 className="font-display text-2xl">{homework?.type === "test" ? "Тест после урока" : "Домашнее задание"}</h2>
          {!homework ? (
            <p className="mt-4 text-sm text-stone-500">У урока нет домашнего задания: ученик завершает его кнопкой «Урок изучен».</p>
          ) : (
            <div className="mt-4 space-y-4">
              <MarkdownContent>{homework.description}</MarkdownContent>
              {homework.type === "test" ? (
                <>
                  <p className="text-sm font-semibold text-stone-600">Проходной балл: {homework.passingScore}%.</p>
                  {(homework.testQuestions ?? []).map((question, index) => (
                    <fieldset key={question.id} className="rounded-2xl border border-stone-200 bg-paper p-4">
                      <legend className="px-1 text-sm font-bold">{index + 1}. {question.prompt}</legend>
                      <ul className="mt-2 space-y-2">
                        {question.options.map((option) => (
                          <li key={option.id} className="rounded-xl border border-stone-200 px-3 py-2.5 text-sm text-stone-700">{option.text}</li>
                        ))}
                      </ul>
                    </fieldset>
                  ))}
                </>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
