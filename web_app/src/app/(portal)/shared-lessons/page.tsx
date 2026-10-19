"use client";

import { MonitorPlay } from "lucide-react";
import Link from "next/link";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { materialsApi } from "@/lib/materials-api";

/** Plan 1.12: course lessons teachers sent to the student, to watch outside the course. */
export default function SharedLessonsPage() {
  const shares = useApiResource(() => materialsApi.studentShares(), []);
  return (
    <div className="grid min-w-0 gap-5">
      <PageHeader eyebrow="Материалы" title="Уроки от преподавателя" description="Уроки из курсов, которые прислал преподаватель. Их можно смотреть в любое время." />
      {shares.loading && !shares.data ? <LoadingState label="Загружаем уроки" /> : null}
      {shares.error ? <ErrorState message={shares.error} retry={shares.reload} /> : null}
      {shares.data && !shares.data.length ? <EmptyState title="Пока ничего" description="Когда преподаватель пришлёт урок, он появится здесь." /> : null}
      <ul className="grid min-w-0 grid-cols-1 gap-2" data-testid="shared-lessons">
        {(shares.data ?? []).map((share) => (
          <li key={share.id}>
            <Link href={`/shared-lessons/${share.id}`} className="flex min-h-16 min-w-0 items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 transition hover:border-amber-300">
              <MonitorPlay size={18} className="shrink-0 text-gold-ink" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-ink">{share.lesson.title}</span>
                <span className="block truncate text-xs text-stone-500">
                  {share.lesson.courseTitle}{share.teacherName ? ` · от ${share.teacherName}` : ""}
                </span>
              </span>
              {!share.viewedAt ? <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-900">новое</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
