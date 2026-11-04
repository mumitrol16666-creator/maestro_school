"use client";

import { useState } from "react";
import { apiRequest } from "@/lib/api-client";
import { useApiResource } from "@/hooks/use-api-resource";

type History = { id: string; sequence: number; direction: string; status: string; startedAt: string | null; readyAt: string | null; studyFinishedAt: string | null; observedLessons: number; studyDays: number | null; examWaitingDays: number | null; attemptsCompleted: number };
const date = (value: string) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Aqtobe" }).format(new Date(value));

export function SectorStatistics({ endpoint }: { endpoint: string }) {
  const [open, setOpen] = useState(false);
  return <details className="mt-5 rounded-2xl border border-stone-200 bg-white p-4" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer py-2 text-base font-bold">История и сроки прохождения секторов</summary>
    {open ? <HistoryRows endpoint={endpoint} /> : null}
  </details>;
}

function HistoryRows({ endpoint }: { endpoint: string }) {
  const resource = useApiResource(() => apiRequest<History[]>(endpoint), [endpoint]);
  if (!resource.data) return <p className="text-sm text-stone-600">{resource.error ?? "Загружаем историю…"}</p>;
  return <div className="grid gap-3">
    <p className="text-sm text-stone-500">Занятия учитываются, когда в подтверждённом отчёте отмечена работа над сектором. Старые уроки без такой отметки в число занятий не входят.</p>
    {!resource.data.length ? <p className="text-sm text-stone-500">Личные секторы ещё не опубликованы.</p> : null}
    {resource.data.map(row => <div key={row.id} className="rounded-xl bg-stone-50 p-4 text-sm leading-6">
      <p className="font-bold">{row.direction} · сектор {row.sequence}</p>
      <p>{row.startedAt ? `Первое зафиксированное занятие: ${date(row.startedAt)}` : "Дата начала пока не зафиксирована"}</p>
      <p>Занятий в истории: {row.observedLessons}</p>
      {row.readyAt ? <p>Готов к экзамену: {date(row.readyAt)}</p> : null}
      {row.studyFinishedAt ? <p>Переход дальше: {date(row.studyFinishedAt)}</p> : null}
      {row.studyDays !== null ? <p>Календарных дней обучения: {row.studyDays}</p> : null}
      {row.examWaitingDays !== null ? <p>Дней ожидания экзамена: {row.examWaitingDays}</p> : null}
      <p>Завершённых попыток экзамена: {row.attemptsCompleted}</p>
      <p className="text-stone-500">{row.status === "awaiting_exam" ? "Обучение по сектору завершено, экзамен ещё не подтверждён" : row.status === "closed" ? "Сектор завершён" : "Обучение продолжается"}</p>
    </div>)}
  </div>;
}
