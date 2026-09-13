"use client";

import { AlertTriangle, CheckCircle2, Inbox } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { UnifiedTaskCard } from "@/components/unified-task-card";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api-client";
import { isHistoricalTask } from "@/lib/task-presentation";
import type { UnifiedTaskSource } from "@/types/unified-tasks";

type View = "action" | "waiting" | "completed";
const views = [
  { key: "action", label: "Нужно сделать" },
  { key: "waiting", label: "На проверке" },
  { key: "completed", label: "Выполнено" },
] as const;
const sources: Array<{ key: "all" | UnifiedTaskSource; label: string }> = [
  { key: "all", label: "Все" }, { key: "offline", label: "С преподавателем" },
  { key: "course", label: "Курсы" }, { key: "online", label: "Онлайн" },
];
const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700";

function TasksContent() {
  const params = useSearchParams();
  const router = useRouter();
  const rawView = params.get("view");
  const rawSource = params.get("source");
  const view: View = rawView === "waiting" || rawView === "completed" ? rawView : "action";
  const source = rawSource === "course" || rawSource === "offline" || rawSource === "online" ? rawSource : "all";
  const filterKey = `${view}:${source}`;
  const resource = useApiResource(async () => ({
    key: filterKey,
    response: await api.studentTasks({
      scope: view === "completed" ? "completed" : "active",
      status: view === "waiting" ? "waiting_review" : undefined,
      source: source === "all" ? undefined : source, limit: 100,
    }),
  }), [view, source]);

  function setFilters(next: { view?: View; source?: "all" | UnifiedTaskSource }) {
    const query = new URLSearchParams(params.toString());
    const nextView = next.view ?? view;
    const nextSource = next.source ?? source;
    if (nextView === "action") query.delete("view"); else query.set("view", nextView);
    if (nextSource === "all") query.delete("source"); else query.set("source", nextSource);
    router.replace(`/tasks${query.toString() ? `?${query.toString()}` : ""}`, { scroll: false });
  }

  // Never show the previous filter's items or numbers under a newly selected tab.
  const response = resource.data?.key === filterKey && !resource.error ? resource.data.response : null;
  const busy = resource.loading || (!response && !resource.error);
  const counts = response?.data.filteredCounts ?? (source === "all" ? response?.data.counts : undefined);
  const meta = response?.meta;
  const partial = Boolean(meta?.partial && (source === "all" || meta.sources[source]?.status === "unavailable"));
  const items = response?.data.items.filter(task => view !== "action" || task.actionRequired) ?? [];
  const current = items.filter(task => !isHistoricalTask(task));
  const historical = items.filter(isHistoricalTask);
  const empty = view === "waiting"
    ? { title: "Нет заданий на проверке", description: "Здесь появятся отправленные преподавателю работы." }
    : view === "completed"
      ? { title: "Выполненных заданий пока нет", description: "Принятые работы сохранятся здесь." }
      : { title: "Незавершённых заданий нет", description: "Новые задания появятся после назначения преподавателем или открытия урока курса." };

  return (
    <div className="mx-auto max-w-6xl" data-testid="tasks-workspace">
      <header className="mb-6">
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-amber-800">Моё обучение</p>
        <h1 className="font-display mt-2 text-4xl leading-tight text-ink">Задания</h1>
        <p className="mt-2 text-sm leading-6 text-stone-600">Подготовка к урокам и задания из курсов.</p>
      </header>

      <section data-testid="task-state-filters" aria-label="Состояние заданий"
        className="mb-3 grid grid-cols-3 gap-1 rounded-xl border border-stone-200 bg-white p-1">
        {views.map(({ key, label }) => {
          const count = key === "action" ? counts?.actionRequired : key === "waiting" ? counts?.waitingReview : counts?.completed;
          return <button key={key} type="button" aria-pressed={view === key} onClick={() => setFilters({ view: key })}
            className={`flex min-h-12 min-w-0 flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-lg px-1.5 py-2 text-xs font-semibold transition-colors sm:px-3 sm:text-sm ${focus} ${view === key ? "bg-ink text-white" : "text-stone-600 hover:bg-stone-50"}`}>
            <span>{label}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${view === key ? "bg-gold text-ink" : "bg-stone-100 text-stone-700"}`}>
              {busy || count == null ? "—" : `${partial ? "≥ " : ""}${count}`}
            </span>
          </button>;
        })}
      </section>

      <div data-testid="task-source-filters" role="group" aria-label="Источник заданий" className="mb-5 flex flex-wrap gap-2">
        {sources.map(({ key, label }) => <button key={key} type="button" aria-pressed={source === key} onClick={() => setFilters({ source: key })}
          className={`min-h-11 rounded-full border px-3 text-xs font-semibold transition-colors sm:px-4 ${focus} ${source === key ? "border-gold bg-amber-50 text-amber-950" : "border-stone-200 text-stone-600 hover:bg-white"}`}>{label}</button>)}
      </div>

      <div data-testid="task-results" aria-busy={busy}>
        {busy ? <Loading /> : resource.error ? (
          <Notice title="Не удалось загрузить задания" description="Не можем проверить список. Попробуйте ещё раз." retry={resource.reload} />
        ) : (
          <>
            {partial && <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">
              <span>Часть заданий недоступна. Счётчики показывают только загруженные работы.</span>
              <button type="button" onClick={resource.reload} className={`min-h-11 font-bold underline underline-offset-4 ${focus}`}>Повторить</button>
            </div>}
            {items.length ? (
              <div className="space-y-3">
                {current.map(task => <UnifiedTaskCard key={task.id} task={task} />)}
                {historical.length > 0 && <section aria-label="Из прошлых уроков" className={current.length ? "pt-3" : ""}>
                  <h2 className="mb-1 text-[11px] font-black uppercase tracking-[0.13em] text-amber-800">Из прошлых уроков</h2>
                  <p className="mb-3 text-xs leading-5 text-stone-600">Задания и оценки из отчётов по занятиям. Это не новые назначения.</p>
                  <div className="space-y-3">{historical.map(task => <UnifiedTaskCard key={task.id} task={task} />)}</div>
                </section>}
              </div>
            ) : partial ? (
              <Notice title="Полный список пока недоступен" description="Пока нельзя сказать, что все задания выполнены." />
            ) : (
              <section className="flex items-start gap-3 rounded-xl border border-stone-200 bg-white p-5 sm:p-6" aria-label="Пустой список">
                {view === "action" ? <CheckCircle2 className="mt-1 shrink-0 text-emerald-700" aria-hidden="true" /> : <Inbox className="mt-1 shrink-0 text-stone-500" aria-hidden="true" />}
                <div><h2 className="font-display text-2xl">{empty.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-stone-600">{source !== "all" ? "В выбранном разделе. " : ""}{empty.description}</p>
                </div>
              </section>
            )}
            {meta?.truncated && <p className="mt-4 text-xs leading-5 text-stone-600">Показаны первые 100 заданий. Счётчики учитывают весь выбранный раздел.</p>}
          </>
        )}
      </div>
    </div>
  );
}

function Loading() {
  return <p role="status" className="py-6 text-sm text-stone-600">Загружаем задания…</p>;
}
function Notice({ title, description, retry }: { title: string; description: string; retry?: () => void }) {
  return <section className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-5" role="alert">
    <AlertTriangle className="mt-1 shrink-0 text-amber-800" aria-hidden="true" />
    <div><h2 className="font-display text-2xl">{title}</h2><p className="mt-2 text-sm leading-6 text-stone-600">{description}</p>
      {retry && <button type="button" onClick={retry} className={`mt-3 min-h-11 rounded-lg border border-amber-300 px-4 text-sm font-bold ${focus}`}>Повторить</button>}
    </div>
  </section>;
}
export default function TasksPage() {
  return <Suspense fallback={<Loading />}><TasksContent /></Suspense>;
}
