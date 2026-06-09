"use client";

import { ArrowRight, ClipboardCheck, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageControls, secondaryButton } from "@/components/admin-ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { homeworkReviewApi } from "@/lib/homework-review-api";
import type { HomeworkReviewFilterStatus } from "@/types/homework-review";

const filters: { value: HomeworkReviewFilterStatus | ""; label: string }[] = [
  { value: "", label: "Все" },
  { value: "submitted", label: "На проверке" },
  { value: "reviewed", label: "Проверяется" },
  { value: "completed", label: "Принято" },
  { value: "rejected", label: "На доработке" },
];

function statusLabel(status: string) {
  return (
    {
      submitted: "Отправлено",
      under_review: "На проверке",
      approved: "Принято",
      rejected: "Доработка",
      pending: "Ожидает",
    }[status] ?? status
  );
}

function statusClass(status: string) {
  if (status === "submitted" || status === "under_review") return "bg-amber-50 text-amber-800";
  if (status === "approved") return "bg-emerald-50 text-emerald-700";
  if (status === "rejected") return "bg-red-50 text-red-700";
  return "bg-stone-100 text-stone-600";
}

export default function HomeworkReviewPage() {
  const [status, setStatus] = useState<HomeworkReviewFilterStatus | "">("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const resource = useApiResource(
    () =>
      homeworkReviewApi.list({
        status: status || undefined,
        search: search || undefined,
        page,
      }),
    [status, search, page],
  );

  return (
    <>
      <PageHeader
        eyebrow="Обучение"
        title="Проверка ДЗ"
        description="Очередь домашних заданий учеников. Принимайте работы или возвращайте на доработку."
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {filters.map((item) => (
          <button
            key={item.label}
            onClick={() => {
              setStatus(item.value);
              setPage(1);
            }}
            className={`rounded-full px-4 py-2 text-xs font-bold ${
              status === item.value ? "bg-ink text-white" : "border border-stone-200 bg-white text-stone-600"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mb-5 flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3">
        <Search size={16} className="text-stone-400" />
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Поиск: ученик, курс, урок"
          className="min-w-0 flex-1 text-sm outline-none"
        />
      </div>

      {resource.loading ? (
        <LoadingState label="Загружаем очередь" />
      ) : resource.error ? (
        <ErrorState message={resource.error} retry={resource.reload} />
      ) : !resource.data?.data.length ? (
        <EmptyState
          title="Очередь пуста"
          description="Новые работы появятся после отправки домашних заданий учениками."
        />
      ) : (
        <div className="space-y-3">
          {resource.data.data.map((item) => (
            <Link
              key={item.submissionId}
              href={`/admin/homework-review/${item.submissionId}`}
              className="card-hover flex flex-col gap-4 rounded-[24px] border border-stone-200 bg-paper p-5 shadow-soft sm:flex-row sm:items-center"
            >
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-50 text-gold">
                <ClipboardCheck size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-xl">{item.studentName}</h2>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusClass(item.status)}`}>
                    {statusLabel(item.status)}
                  </span>
                </div>
                <p className="mt-1 text-xs font-bold text-gold">
                  {item.courseTitle} · {item.moduleTitle} · {item.lessonTitle}
                </p>
                <p className="mt-2 line-clamp-2 text-sm text-stone-500">
                  {item.studentComment || item.homeworkDescription}
                </p>
                <p className="mt-2 text-xs text-stone-400">
                  Отправлено {new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.submittedAt))}
                </p>
              </div>
              <span className={secondaryButton}>
                Открыть <ArrowRight size={15} />
              </span>
            </Link>
          ))}
        </div>
      )}

      {resource.data?.meta && (
        <PageControls page={page} pages={resource.data.meta.pages} onChange={setPage} />
      )}
    </>
  );
}
