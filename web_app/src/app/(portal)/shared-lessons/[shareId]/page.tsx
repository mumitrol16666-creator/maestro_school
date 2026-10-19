"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ErrorState, LoadingState } from "@/components/data-states";
import { LessonVideoPlayer } from "@/components/lesson-video-player";
import { MarkdownContent } from "@/components/markdown-content";
import { LessonMaterialItems } from "@/components/student-lesson-materials";
import { useApiResource } from "@/hooks/use-api-resource";
import { materialsApi } from "@/lib/materials-api";

/** Plan 1.12: the bare course lesson a teacher sent — to watch; nothing to submit, course progress stays. */
export default function SharedLessonPage() {
  const { shareId } = useParams<{ shareId: string }>();
  const share = useApiResource(() => materialsApi.studentShare(shareId), [shareId]);
  if (share.loading && !share.data) return <LoadingState label="Открываем урок" />;
  if (share.error || !share.data) return <ErrorState message={share.error ?? "Урок не найден"} retry={share.reload} />;
  const data = share.data;
  return (
    <article className="grid min-w-0 gap-5" data-testid="shared-lesson">
      <Link href="/shared-lessons" className="text-sm font-bold text-gold-ink hover:underline">← Все уроки от преподавателя</Link>
      <header className="min-w-0">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-stone-500">{data.lesson.courseTitle} · {data.lesson.moduleTitle}</p>
        <h1 className="font-display mt-2 break-words text-3xl leading-tight text-ink">{data.lesson.title}</h1>
        {data.teacherName ? <p className="mt-1 text-sm font-semibold text-stone-500">Прислал(а) {data.teacherName}</p> : null}
      </header>
      {data.note ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">{data.note}</p>
      ) : null}
      {data.content.videoUrl ? <LessonVideoPlayer videoUrl={data.content.videoUrl} title={data.lesson.title} /> : null}
      {data.content.description ? (
        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <MarkdownContent>{data.content.description}</MarkdownContent>
        </section>
      ) : null}
      {data.content.materials.length ? (
        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-black uppercase tracking-wider text-stone-500">Материалы урока</h2>
          <LessonMaterialItems
            materials={data.content.materials.map((material) => ({
              type: material.type,
              url: material.url,
              title: material.title,
            }))}
          />
        </section>
      ) : null}
      <p className="text-xs text-stone-500">Это урок для просмотра: сдавать ничего не нужно, прогресс курса не меняется.</p>
    </article>
  );
}
