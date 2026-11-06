import { sectorProgress } from "@/lib/sector-progress";
import type { StudentHomeMonthlyPlan } from "@/types/api";

export function SectorProgressOverview({ plan }: { plan: StudentHomeMonthlyPlan }) {
  const p = sectorProgress(plan.items);
  return <section className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-y border-stone-100 py-4" data-testid="sector-progress-overview" aria-label="Прогресс пунктов">
    <div className="min-w-40 flex-1">
      <p className="text-sm font-bold text-ink">{p.completed} из {p.total} пунктов освоено</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100" role="progressbar" aria-label="Освоенные пункты" aria-valuemin={0} aria-valuemax={p.total || 1} aria-valuenow={p.completed}>
        <div className="h-full rounded-full bg-emerald-600" style={{ width: `${p.percent}%` }} />
      </div>
    </div>
    <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
      <div className="flex items-center gap-1.5"><dt className="text-stone-500">В работе</dt><dd className="font-bold text-amber-900">{p.working}</dd></div>
      <div className="flex items-center gap-1.5"><dt className="text-stone-500">Впереди</dt><dd className="font-bold text-stone-700">{p.planned}</dd></div>
    </dl>
  </section>;
}

