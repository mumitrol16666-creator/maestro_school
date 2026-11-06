"use client";

import { useState } from "react";
import { CheckCircle2, Circle, CircleDot } from "lucide-react";
import { sectorProgress, sectorTopicStage, type SectorTopic, type SectorTopicFilter } from "@/lib/sector-progress";

export function SectorTopicList({ items }: { items: SectorTopic[] }) {
  const progress = sectorProgress(items);
  const [filter, setFilter] = useState<SectorTopicFilter>("all");
  const visible = progress.current.filter(item => filter === "all" || sectorTopicStage(item) === filter);
  const replaced = items.filter(item => !progress.current.includes(item));
  const filters = [{ key: "all", title: "Все темы", count: progress.total }, { key: "working", title: "В работе", count: progress.working }, { key: "completed", title: "Освоено", count: progress.completed }] as const;
  return <section className="mt-6" aria-label="Темы сектора">
    <div className="flex flex-wrap gap-2" aria-label="Фильтр тем">
      {filters.map(item => <button key={item.key} type="button" aria-pressed={filter === item.key} onClick={() => setFilter(item.key)} className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-bold ${filter === item.key ? "border-stone-800 bg-stone-800 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-amber-400"}`}>{item.title} · {item.count}</button>)}
    </div>
    <div className="mt-4 grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {!visible.length ? <p className="py-5 text-sm text-stone-600">В этой категории пока нет тем.</p> : null}
      {visible.map((item, index) => {
        const stage = sectorTopicStage(item);
        const Icon = stage === "completed" ? CheckCircle2 : stage === "working" ? CircleDot : Circle;
        const color = stage === "completed" ? "text-emerald-700" : stage === "working" ? "text-amber-900" : "text-stone-500";
        return <article key={item.id} className={`flex min-w-0 items-start gap-3 rounded-xl border p-4 ${stage === "completed" ? "border-emerald-200 bg-emerald-50/30" : stage === "working" ? "border-amber-200 bg-amber-50/30" : "border-stone-200 bg-white"}`} data-testid="sector-topic">
          <span className={`mt-0.5 shrink-0 ${color}`}><Icon size={20} aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-bold leading-6 text-stone-800">{item.title}</p>
            <p className={`mt-1 text-xs font-semibold ${color}`}>{stage === "completed" ? "Освоено" : stage === "working" ? "В работе" : "Впереди"}{typeof item.progressPercent === "number" ? ` · ${item.progressPercent}%` : ""}</p>
            {typeof item.progressPercent === "number" ? <div className="mt-3 h-1 overflow-hidden rounded-full bg-stone-100"><div className={`h-full rounded-full ${stage === "completed" ? "bg-emerald-600" : "bg-amber-600"}`} style={{ width: `${Math.max(0, Math.min(100, item.progressPercent))}%` }} /></div> : null}
            {item.masteryCriteria ? <details className="mt-1" key={`${filter}-${index}-${item.id}`}>
              <summary className="inline-flex min-h-11 cursor-pointer items-center text-xs font-bold text-stone-600 underline decoration-stone-300 underline-offset-4">Критерий освоения</summary>
              <p className="mb-1 break-words rounded-lg bg-stone-50 px-3 py-2 text-sm leading-6 text-stone-600">{item.masteryCriteria}</p>
            </details> : null}
          </div>
        </article>;
      })}
    </div>
    {replaced.length ? <details className="mt-3"><summary className="min-h-11 cursor-pointer py-3 text-xs font-bold text-stone-500">Заменённые темы · {replaced.length}</summary><ul className="grid gap-2 text-sm text-stone-500">{replaced.map(item => <li key={item.id}>{item.title} · заменена</li>)}</ul></details> : null}
  </section>;
}
