"use client";

import { ArrowRight, Search, Video } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AdminPendingHomeworkBadge } from "@/components/admin-pending-homework-badge";
import { PageControls } from "@/components/admin-ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { usePendingOnlineLessonsCount } from "@/hooks/use-pending-online-lessons-count";
import { onlineLessonStatusClasses, onlineLessonStatusLabels } from "@/lib/online-lessons-ui";
import { onlineLessonsApi } from "@/lib/online-lessons-api";

const filters = [
  { value: "", label: "Все" },
  { value: "new", label: "Новые" },
  { value: "assigned", label: "В работе" },
  { value: "scheduled", label: "Назначены" },
  { value: "completed", label: "Завершены" },
] as const;

export default function AdminOnlineLessonsPage() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { count: pendingCount } = usePendingOnlineLessonsCount();

  const resource = useApiResource(
    () => onlineLessonsApi.adminList({ status: status || undefined, search: search || undefined, page, limit: 20 }),
    [status, search, page],
  );

  return (
    <>
      <PageHeader
        eyebrow="Живые занятия"
        title="Онлайн-уроки"
        description="Заявки учеников на индивидуальные уроки в Zoom: взять в работу, назначить ссылку, завершить и выдать ДЗ."
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {filters.map((item) => (
          <button
            key={item.label}
            onClick={() => { setStatus(item.value); setPage(1); }}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold ${
              status === item.value ? "bg-ink text-white" : "border border-stone-200 bg-white text-stone-600"
            }`}
          >
            {item.label}
            {item.value === "new" && pendingCount != null && pendingCount > 0 && (
              <AdminPendingHomeworkBadge count={pendingCount} />
            )}
          </button>
        ))}
      </div>

      <div className="mb-5 flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3">
        <Search size={16} className="text-stone-400" />
        <input
          value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(1); }}
          placeholder="Поиск по ученику или направлению"
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>

      {resource.loading && !resource.data ? <LoadingState label="Загружаем заявки" /> : null}
      {resource.error ? <ErrorState message={resource.error} retry={resource.reload} /> : null}

      {resource.data && !resource.data.data?.length ? (
        <EmptyState title="Заявок нет" description="Новые заявки появятся, когда ученики запишутся на онлайн-урок." />
      ) : null}

      <div className="space-y-3">
        {resource.data?.data?.map((item) => (
          <Link
            key={item.id}
            href={`/admin/online-lessons/${item.id}`}
            className="card-hover flex items-center gap-4 rounded-[24px] border border-stone-200 bg-paper p-5 shadow-soft"
          >
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-700">
              <Video size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-xl">{item.student.firstName} {item.student.lastName}</h2>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${onlineLessonStatusClasses[item.status]}`}>
                  {onlineLessonStatusLabels[item.status]}
                </span>
              </div>
              <p className="mt-1 text-xs font-bold text-gold">{item.directionTitle} · {item.level}</p>
              <p className="mt-2 text-sm text-stone-500">{item.preferredTime}</p>
            </div>
            <ArrowRight size={18} className="text-gold" />
          </Link>
        ))}
      </div>

      {resource.data?.meta && resource.data.meta.pages > 1 && (
        <PageControls page={page} pages={resource.data.meta.pages} onChange={setPage} />
      )}
    </>
  );
}
