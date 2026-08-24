"use client";

import { AlertTriangle, CheckCircle2, Clock3, RotateCcw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { UnifiedTaskCard } from "@/components/unified-task-card";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api-client";
import type { UnifiedTaskSource } from "@/types/unified-tasks";

type View = "action" | "waiting" | "completed";

const views: Array<{ key: View; label: string; icon: typeof Clock3 }> = [
  { key: "action", label: "Нужно сделать", icon: RotateCcw },
  { key: "waiting", label: "На проверке", icon: Clock3 },
  { key: "completed", label: "Выполнено", icon: CheckCircle2 },
];

const sources: Array<{ key: "all" | UnifiedTaskSource; label: string }> = [
  { key: "all", label: "Все" },
  { key: "course", label: "Курсы" },
  { key: "offline", label: "В школе" },
  { key: "online", label: "Онлайн" },
];

const sourceUnavailableLabel: Record<UnifiedTaskSource, string> = {
  course: "курсов",
  offline: "школы",
  online: "онлайн-уроков",
};

function TasksContent() {
  const params = useSearchParams();
  const router = useRouter();
  const rawView = params.get("view");
  const rawSource = params.get("source");
  const view: View = rawView === "waiting" || rawView === "completed" ? rawView : "action";
  const source: "all" | UnifiedTaskSource = rawSource === "course" || rawSource === "offline" || rawSource === "online"
    ? rawSource
    : "all";

  const resource = useApiResource(() => api.studentTasks({
    scope: view === "completed" ? "completed" : "active",
    status: view === "waiting" ? "waiting_review" : undefined,
    source: source === "all" ? undefined : source,
    limit: 100,
  }), [view, source]);

  function setFilters(next: { view?: View; source?: "all" | UnifiedTaskSource }) {
    const query = new URLSearchParams(params.toString());
    const nextView = next.view ?? view;
    const nextSource = next.source ?? source;
    if (nextView === "action") query.delete("view"); else query.set("view", nextView);
    if (nextSource === "all") query.delete("source"); else query.set("source", nextSource);
    router.replace(`/tasks${query.toString() ? `?${query.toString()}` : ""}`, { scroll: false });
  }

  if (resource.loading) return <LoadingState label="Собираем задания из всех разделов" />;
  if (resource.error || !resource.data) {
    return <ErrorState message={resource.error ?? "Не удалось загрузить задания"} retry={resource.reload} />;
  }

  const { data, meta } = resource.data;
  const items = view === "action" ? data.items.filter((task) => task.actionRequired) : data.items;
  const unavailable = (Object.entries(meta?.sources ?? {}) as Array<[UnifiedTaskSource, { status: string }]>)
    .filter(([, state]) => state.status === "unavailable")
    .map(([key]) => sourceUnavailableLabel[key]);
  const empty = view === "waiting"
    ? { title: "Нет заданий на проверке", description: "Отправленные работы появятся здесь, пока преподаватель их проверяет." }
    : view === "completed"
      ? { title: "Выполненных заданий пока нет", description: "После проверки готовые работы сохранятся в этом разделе." }
      : { title: "Сейчас всё сделано", description: "Новые задания появятся после уроков или внутри курса." };

  return (
    <>
      <PageHeader
        eyebrow="Единая учебная очередь"
        title="Задания"
        description="Всё, что нужно сделать по курсам и занятиям с преподавателем."
      />

      <section className="mb-6 rounded-[26px] border border-stone-200 bg-white p-4 shadow-soft sm:p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Summary label="Требуют действия" value={data.counts.actionRequired} accent="text-red-700" />
          <Summary label="На проверке" value={data.counts.waitingReview} accent="text-blue-700" />
          <Summary label="Выполнено" value={data.counts.completed} accent="text-emerald-700" />
        </div>
      </section>

      <div className="mb-5 space-y-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {views.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilters({ view: key })}
              className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-bold transition ${
                view === key ? "bg-ink text-white" : "border border-stone-200 bg-white text-stone-600"
              }`}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {sources.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilters({ source: key })}
              className={`min-h-9 shrink-0 rounded-full px-4 text-xs font-black transition ${
                source === key ? "bg-amber-100 text-amber-950" : "border border-stone-200 bg-white text-stone-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {meta?.partial ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <span className="inline-flex items-center gap-2 font-semibold">
            <AlertTriangle size={17} /> Не удалось обновить задания из {unavailable.join(" и ")}. Остальные задания показаны.
          </span>
          <button type="button" onClick={() => void resource.reload()} className="font-black underline underline-offset-4">Повторить</button>
        </div>
      ) : null}

      {items.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((task) => <UnifiedTaskCard key={task.id} task={task} />)}
        </div>
      ) : meta?.partial ? (
        <div className="rounded-[26px] border border-dashed border-amber-300 bg-white p-8 text-center">
          <AlertTriangle className="mx-auto text-amber-600" />
          <h2 className="font-display mt-3 text-2xl">Часть заданий временно недоступна</h2>
          <p className="mt-2 text-sm text-stone-500">Повторите загрузку, чтобы проверить недоступный источник.</p>
        </div>
      ) : (
        <EmptyState title={source === "all" ? empty.title : `${empty.title} в выбранном разделе`} description={empty.description} />
      )}

      {meta?.truncated ? (
        <p className="mt-5 text-center text-xs font-semibold text-stone-400">Показаны первые 100 заданий по выбранному фильтру.</p>
      ) : null}
    </>
  );
}

function Summary({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-2xl bg-stone-50 p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-stone-400">{label}</p>
      <p className={`font-display mt-1 text-3xl ${accent}`}>{value}</p>
    </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={<LoadingState label="Открываем задания" />}>
      <TasksContent />
    </Suspense>
  );
}
