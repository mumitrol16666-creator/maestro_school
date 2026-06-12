"use client";

import { Award, Flame, Medal, Star, Trophy } from "lucide-react";
import type { StudentAchievementItem } from "@/types/api";

const icons: Record<string, typeof Trophy> = {
  first_lesson: Medal,
  points_100: Star,
  first_module: Award,
  lessons_10: Flame,
};

function AchievementIcon({ code, earned }: { code: string; earned: boolean }) {
  const Icon = icons[code] ?? Trophy;
  return (
    <span
      className={`grid h-12 w-12 place-items-center rounded-2xl ${
        earned ? "bg-gold/15 text-gold ring-1 ring-gold/30" : "bg-stone-100 text-stone-300"
      }`}
    >
      <Icon size={22} />
    </span>
  );
}

interface AchievementsWallProps {
  achievements: StudentAchievementItem[];
  compact?: boolean;
}

export function AchievementsWall({ achievements, compact = false }: AchievementsWallProps) {
  const earned = achievements.filter((item) => item.earned);
  const locked = achievements.filter((item) => !item.earned);
  const items = compact ? [...earned, ...locked].slice(0, 4) : [...earned, ...locked];

  if (!achievements.length) {
    return (
      <p className="text-sm text-stone-500">
        Достижения появятся по мере прохождения уроков.
      </p>
    );
  }

  return (
    <div className={compact ? "grid gap-3 sm:grid-cols-2" : "grid gap-4 sm:grid-cols-2"}>
      {items.map((item) => (
        <article
          key={item.code}
          className={`rounded-[24px] border p-4 ${
            item.earned
              ? "border-gold/20 bg-gradient-to-br from-amber-50 to-white shadow-soft"
              : "border-stone-200 bg-stone-50"
          }`}
        >
          <div className="flex items-start gap-3">
            <AchievementIcon code={item.code} earned={item.earned} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink">{item.title}</p>
              <p className="mt-1 text-xs leading-5 text-stone-500">{item.description}</p>
              {item.earned && item.earnedAt && (
                <p className="mt-2 text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                  Получено {new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(new Date(item.earnedAt))}
                </p>
              )}
              {!item.earned && !compact && (
                <div className="mt-3">
                  <div className="h-1.5 overflow-hidden rounded-full bg-stone-200">
                    <div
                      className="h-full rounded-full bg-gold transition-all"
                      style={{ width: `${item.progressPercent}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-stone-400">{item.progressLabel}</p>
                </div>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
