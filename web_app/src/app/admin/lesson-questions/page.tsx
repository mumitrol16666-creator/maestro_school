"use client";

import { ArrowRight, CheckCircle2, MessageCircleQuestion, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { AdminPendingHomeworkBadge } from "@/components/admin-pending-homework-badge";
import { PageControls, secondaryButton } from "@/components/admin-ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { usePendingLessonQuestionsCount } from "@/hooks/use-pending-lesson-questions-count";
import { lessonQuestionsApi } from "@/lib/lesson-questions-api";

const filters = [
  { value: "", label: "Все" },
  { value: "pending", label: "Новые" },
  { value: "answered", label: "Отвечены" },
] as const;

export default function LessonQuestionsPage() {
  const [status, setStatus] = useState<"" | "pending" | "answered">("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { count: pendingCount, reload: reloadPendingCount } = usePendingLessonQuestionsCount();

  const resource = useApiResource(
    () => lessonQuestionsApi.list({
      status: status || undefined,
      search: search || undefined,
      page,
      limit: 20,
    }),
    [status, search, page],
  );

  useEffect(() => {
    if (!resource.loading) {
      void reloadPendingCount();
    }
  }, [resource.loading, resource.data, reloadPendingCount]);

  async function markAnswered(id: string) {
    await lessonQuestionsApi.markAnswered(id);
    await Promise.all([resource.reload(), reloadPendingCount()]);
  }

  return (
    <>
      <PageHeader
        eyebrow="Обучение"
        title="Вопросы по урокам"
        description="Сообщения учеников из кнопки «Задать вопрос преподавателю» на странице урока."
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {filters.map((item) => (
          <button
            key={item.label}
            onClick={() => {
              setStatus(item.value);
              setPage(1);
            }}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold ${
              status === item.value ? "bg-ink text-white" : "border border-stone-200 bg-white text-stone-600"
            }`}
          >
            {item.label}
            {item.value === "pending" && pendingCount != null && pendingCount > 0 && (
              <AdminPendingHomeworkBadge count={pendingCount} />
            )}
          </button>
        ))}
      </div>

      <div className="mb-5 flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3">
        <Search size={16} className="text-stone-400" />
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Поиск по ученику, уроку или тексту вопроса"
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>

      {resource.loading && !resource.data ? <LoadingState label="Загружаем вопросы" /> : null}
      {resource.error ? <ErrorState message={resource.error} retry={resource.reload} /> : null}

      {resource.data && !resource.data.data?.length ? (
        <EmptyState title="Вопросов пока нет" description="Когда ученик отправит вопрос с урока, он появится здесь." />
      ) : null}

      {resource.data?.data?.length ? (
        <div className="space-y-4">
          {resource.data.data.map((item) => (
            <article key={item.id} className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-soft">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-50 text-amber-700">
                    <MessageCircleQuestion size={20} />
                  </span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-gold">
                      {item.lesson.module.course.title} → {item.lesson.title}
                    </p>
                    <p className="mt-1 text-sm font-bold text-ink">
                      {item.student.firstName} {item.student.lastName}
                    </p>
                    <p className="text-xs text-stone-500">{item.student.email}</p>
                  </div>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                  item.status === "pending" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"
                }`}>
                  {item.status === "pending" ? "Новый" : "Отвечен"}
                </span>
              </div>

              <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-stone-700">{item.message}</p>
              <p className="mt-3 text-xs text-stone-400">
                {new Intl.DateTimeFormat("ru-RU", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(item.createdAt))}
              </p>

              {item.status === "pending" && (
                <button
                  type="button"
                  onClick={() => void markAnswered(item.id)}
                  className={`${secondaryButton} mt-4`}
                >
                  <CheckCircle2 size={14} /> Отметить как отвеченный
                </button>
              )}
            </article>
          ))}
        </div>
      ) : null}

      {resource.data?.meta && resource.data.meta.pages > 1 && (
        <PageControls
          page={page}
          pages={resource.data.meta.pages}
          onChange={setPage}
        />
      )}
    </>
  );
}
