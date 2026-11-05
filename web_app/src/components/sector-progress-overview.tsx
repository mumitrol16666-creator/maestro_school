import { sectorProgress } from "@/lib/sector-progress";
import type { StudentHomeMonthlyPlan } from "@/types/api";

export function SectorProgressOverview({ plan }: { plan: StudentHomeMonthlyPlan }) {
  const progress = sectorProgress(plan.items);
  const circumference = 2 * Math.PI * 52;
  return <section className="mt-5 rounded-2xl border border-amber-200/70 bg-[#fbf8ef] p-4 sm:p-5" data-testid="sector-progress-overview" aria-label="Освоение тем сектора">
    <div className="grid items-center gap-3 grid-cols-[96px_1fr] sm:grid-cols-[144px_1fr] sm:gap-5">
      <div className="relative mx-auto grid h-24 w-24 place-items-center sm:h-36 sm:w-36">
        <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 128 128" role="img" aria-label={`Освоено ${progress.completed} из ${progress.total} тем, ${progress.percent}%`}>
          <circle cx="64" cy="64" r="52" fill="none" stroke="#e8e2d4" strokeWidth="8" />
          <circle cx="64" cy="64" r="52" fill="none" stroke="#aa7a24" strokeWidth="8" strokeLinecap={progress.completed ? "round" : "butt"} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress.percent / 100)} />
        </svg>
        <div className="relative text-center"><p className="text-2xl font-black tabular-nums text-ink sm:text-3xl">{progress.completed}<span className="text-sm font-semibold text-stone-500 sm:text-base"> из {progress.total}</span></p><p className="mx-auto mt-1 max-w-16 text-xs font-bold leading-4 text-stone-600">Освоено тем</p></div>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-wider text-gold-ink">{plan.scope === "group" ? "Совместная работа" : "Твой учебный маршрут"}</p>
        <h3 className="mt-2 break-words text-lg font-bold leading-6 text-ink">{progress.focus ? progress.focus.title : progress.total ? "Все темы освоены" : "Преподаватель добавит темы"}</h3>
        <p className="mt-2 text-sm leading-6 text-stone-600">{plan.scope === "group" ? "Общие материалы для занятий. Личное освоение и экзамен — в твоём секторе." : progress.focus ? "Отрабатывай с преподавателем. Критерий освоения — ниже." : "Дальнейшие занятия и подготовку к экзамену обсуди с преподавателем."}</p>
        <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <div className="flex items-center gap-1.5"><dt className="text-stone-600">Освоено</dt><dd className="font-black tabular-nums text-emerald-800">{progress.completed}</dd></div>
          <div className="flex items-center gap-1.5"><dt className="text-stone-600">В работе</dt><dd className="font-black tabular-nums text-amber-900">{progress.working}</dd></div>
          <div className="flex items-center gap-1.5"><dt className="text-stone-600">Впереди</dt><dd className="font-black tabular-nums text-stone-700">{progress.planned}</dd></div>
        </dl>
      </div>
    </div>
    {plan.scope === "student" ? <p className="mt-4 border-t border-amber-200/70 pt-3 text-xs leading-5 text-stone-600">Диаграмма показывает количество освоенных тем. Готовность к экзамену определяет преподаватель отдельно.</p> : null}
  </section>;
}

