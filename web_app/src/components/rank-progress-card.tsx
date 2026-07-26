import { Crown, Sparkles } from "lucide-react";
import type { StudentRankOverview } from "@/types/api";

export function RankProgressCard({
  rank,
  compact = false,
}: {
  rank: StudentRankOverview;
  compact?: boolean;
}) {
  return (
    <section className={`overflow-hidden rounded-[28px] bg-ink text-white shadow-soft ${compact ? "p-5" : "p-6 sm:p-8"}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-gold">
            <Crown size={16} />
            Текущий ранг
          </p>
          <h2 className={`font-display mt-3 ${compact ? "text-3xl" : "text-4xl sm:text-5xl"}`}>
            {rank.current.title}
          </h2>
        </div>
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-gold/20 bg-gold/10 text-gold">
          <Sparkles size={22} />
        </span>
      </div>
      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between gap-3 text-xs text-white/55">
          <span>{rank.points.toLocaleString("ru-RU")} баллов</span>
          <span>
            {rank.next
              ? `До ранга «${rank.next.title}»: ${rank.pointsToNext}`
              : "Высший ранг достигнут"}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gold transition-all duration-500"
            style={{ width: `${rank.progressPercent}%` }}
          />
        </div>
      </div>
    </section>
  );
}
