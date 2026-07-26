import {
  Crown,
  Disc3,
  Guitar,
  Medal,
  Mic2,
  Music2,
  Star,
  type LucideIcon,
} from "lucide-react";
import type { StudentRankOverview } from "@/types/api";

type RankMedalVisual = {
  code: string;
  title: string;
  minPoints: number;
  icon: LucideIcon;
  medalClass: string;
  ribbonClass: string;
};

const rankMedals: RankMedalVisual[] = [
  {
    code: "first_strings",
    title: "Первые струны",
    minPoints: 0,
    icon: Music2,
    medalClass: "border-stone-300 bg-gradient-to-br from-stone-100 to-stone-400 text-stone-800",
    ribbonClass: "bg-stone-400",
  },
  {
    code: "rhythm",
    title: "Ритм",
    minPoints: 100,
    icon: Disc3,
    medalClass: "border-orange-300 bg-gradient-to-br from-orange-100 to-orange-500 text-orange-950",
    ribbonClass: "bg-orange-500",
  },
  {
    code: "chord",
    title: "Аккорд",
    minPoints: 300,
    icon: Guitar,
    medalClass: "border-amber-300 bg-gradient-to-br from-amber-100 to-amber-500 text-amber-950",
    ribbonClass: "bg-amber-500",
  },
  {
    code: "musician",
    title: "Музыкант",
    minPoints: 600,
    icon: Medal,
    medalClass: "border-emerald-300 bg-gradient-to-br from-emerald-100 to-emerald-500 text-emerald-950",
    ribbonClass: "bg-emerald-500",
  },
  {
    code: "performer",
    title: "Исполнитель",
    minPoints: 1000,
    icon: Mic2,
    medalClass: "border-violet-300 bg-gradient-to-br from-violet-100 to-violet-500 text-violet-950",
    ribbonClass: "bg-violet-500",
  },
  {
    code: "maestro",
    title: "Маэстро",
    minPoints: 1500,
    icon: Crown,
    medalClass: "border-yellow-200 bg-gradient-to-br from-yellow-100 via-gold to-yellow-600 text-yellow-950",
    ribbonClass: "bg-gold",
  },
];

function RankMedal({
  code,
  size = "large",
  muted = false,
}: {
  code: string;
  size?: "small" | "large";
  muted?: boolean;
}) {
  const visual = rankMedals.find((item) => item.code === code) ?? rankMedals[0];
  const Icon = visual.icon;
  const circleSize = size === "large" ? "h-14 w-14" : "h-8 w-8";
  const iconSize = size === "large" ? 24 : 14;

  return (
    <span
      title={visual.title}
      aria-label={`Медаль ранга «${visual.title}»`}
      className={`relative inline-flex pb-2 ${muted ? "grayscale opacity-30" : ""}`}
    >
      <span className={`absolute bottom-0 left-1/2 h-5 w-3 -translate-x-[85%] rotate-[18deg] rounded-b-sm ${visual.ribbonClass}`} />
      <span className={`absolute bottom-0 left-1/2 h-5 w-3 -translate-x-[15%] -rotate-[18deg] rounded-b-sm ${visual.ribbonClass}`} />
      <span className={`relative z-10 grid place-items-center rounded-full border-2 shadow-lg ring-2 ring-white/15 ${circleSize} ${visual.medalClass}`}>
        <Icon size={iconSize} strokeWidth={2.2} />
      </span>
    </span>
  );
}

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
        <RankMedal code={rank.current.code} />
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
      {!compact ? (
        <div className="mt-6 border-t border-white/10 pt-5">
          <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/40">
            <Star size={13} />
            Линейка рангов
          </div>
          <div className="grid grid-cols-6 gap-1">
            {rankMedals.map((item) => {
              const unlocked = rank.points >= item.minPoints;
              const current = rank.current.code === item.code;
              return (
                <div key={item.code} className="flex min-w-0 flex-col items-center text-center">
                  <RankMedal code={item.code} size="small" muted={!unlocked} />
                  <span className={`mt-1 hidden text-[9px] font-bold leading-tight sm:block ${current ? "text-gold" : "text-white/45"}`}>
                    {item.title}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
