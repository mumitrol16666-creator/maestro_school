"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { ChevronRight, Gauge, Info, ShieldCheck, Sparkles, Star, X } from "lucide-react";
import type {
  ProductLevelItem,
  ProductLevelProgress,
  ProductLevelTone,
} from "@/types/api";

const toneStyles: Record<ProductLevelTone, {
  ring: string;
  glow: string;
  progress: string;
  accent: string;
}> = {
  graphite: { ring: "#a1a1aa", glow: "rgba(161,161,170,.22)", progress: "bg-zinc-400", accent: "text-zinc-300" },
  silver: { ring: "#4ade80", glow: "rgba(74,222,128,.22)", progress: "bg-green-400", accent: "text-green-300" },
  green: { ring: "#22c55e", glow: "rgba(34,197,94,.24)", progress: "bg-green-500", accent: "text-green-300" },
  emerald: { ring: "#10b981", glow: "rgba(16,185,129,.24)", progress: "bg-emerald-500", accent: "text-emerald-300" },
  gold: { ring: "#facc15", glow: "rgba(250,204,21,.24)", progress: "bg-yellow-400", accent: "text-yellow-300" },
  amber: { ring: "#f59e0b", glow: "rgba(245,158,11,.25)", progress: "bg-amber-500", accent: "text-amber-300" },
  orange: { ring: "#fb923c", glow: "rgba(251,146,60,.26)", progress: "bg-orange-400", accent: "text-orange-300" },
  fire_orange: { ring: "#f97316", glow: "rgba(249,115,22,.28)", progress: "bg-orange-500", accent: "text-orange-200" },
  crimson: { ring: "#f43f5e", glow: "rgba(244,63,94,.28)", progress: "bg-rose-500", accent: "text-rose-300" },
  red: { ring: "#ef233c", glow: "rgba(239,35,60,.38)", progress: "bg-red-500", accent: "text-red-300" },
};

const fallbackLevels: ProductLevelItem[] = [
  { level: 1, code: "level_1", title: "LEVEL 1", minPoints: 0, tone: "graphite", emblem: "disc" },
  { level: 2, code: "level_2", title: "LEVEL 2", minPoints: 300, tone: "silver", emblem: "square" },
  { level: 3, code: "level_3", title: "LEVEL 3", minPoints: 800, tone: "green", emblem: "diamond" },
  { level: 4, code: "level_4", title: "LEVEL 4", minPoints: 1_500, tone: "emerald", emblem: "hexagon" },
  { level: 5, code: "level_5", title: "LEVEL 5", minPoints: 2_500, tone: "gold", emblem: "pentagon" },
  { level: 6, code: "level_6", title: "LEVEL 6", minPoints: 3_800, tone: "amber", emblem: "shield" },
  { level: 7, code: "level_7", title: "LEVEL 7", minPoints: 5_400, tone: "orange", emblem: "octagon" },
  { level: 8, code: "level_8", title: "LEVEL 8", minPoints: 7_300, tone: "fire_orange", emblem: "notched" },
  { level: 9, code: "level_9", title: "LEVEL 9", minPoints: 9_500, tone: "crimson", emblem: "crest" },
  { level: 10, code: "level_10", title: "LEVEL 10", minPoints: 12_000, tone: "red", emblem: "crown" },
];

const badgeSizes = {
  small: { outer: "h-10 w-10", inner: "text-xs" },
  medium: { outer: "h-14 w-14", inner: "text-base" },
  large: { outer: "h-20 w-20", inner: "text-xl" },
} as const;

export function LevelBadge({
  level,
  size = "medium",
  muted = false,
}: {
  level: ProductLevelItem;
  size?: keyof typeof badgeSizes;
  muted?: boolean;
}) {
  const tone = toneStyles[level.tone];
  const dimensions = badgeSizes[size];
  const ringStyle: CSSProperties = {
    background: `conic-gradient(from 215deg, ${tone.ring} 0deg 292deg, #30322f 292deg 360deg)`,
    boxShadow: level.level === 10 ? `0 0 24px ${tone.glow}` : `0 8px 18px ${tone.glow}`,
  };
  return (
    <span
      className={`relative inline-grid shrink-0 place-items-center rounded-full p-[3px] ${dimensions.outer} ${muted ? "opacity-[0.45]" : ""}`}
      style={ringStyle}
      title={`${level.title}: от ${level.minPoints.toLocaleString("ru-RU")} баллов`}
      aria-label={`${level.title}, от ${level.minPoints.toLocaleString("ru-RU")} баллов`}
      data-testid={`level-badge-${level.level}`}
    >
      <span className="absolute inset-[4px] rounded-full border border-white/10 bg-[#111310] shadow-inner" />
      <span className={`relative z-10 font-black ${dimensions.inner}`} style={{ color: tone.ring }}>{level.level}</span>
    </span>
  );
}

function levelRange(levels: ProductLevelItem[], index: number) {
  const start = levels[index].minPoints.toLocaleString("ru-RU");
  const next = levels[index + 1];
  return next
    ? `${start}–${(next.minPoints - 1).toLocaleString("ru-RU")} баллов`
    : `от ${start} баллов`;
}

export function LevelProgressDialog({
  progress,
  onClose,
}: {
  progress: ProductLevelProgress;
  onClose: () => void;
}) {
  const levels = progress.levels?.length === 10 ? progress.levels : fallbackLevels;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-stone-950/65 p-0 backdrop-blur-sm sm:items-center sm:p-5" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="level-dialog-title" data-testid="level-progress-dialog" className="flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#171813] text-white shadow-2xl sm:max-h-[88dvh] sm:rounded-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-7 sm:py-5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gold">Постоянный прогресс</p>
            <h2 id="level-dialog-title" className="font-display mt-1.5 text-3xl sm:text-4xl">Уровни Maestro</h2>
          </div>
          <button type="button" autoFocus onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/15 text-white/65 transition hover:bg-white/10 hover:text-white" aria-label="Закрыть уровни">
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto overscroll-contain p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:p-7">
          <div className="grid gap-5 border-b border-white/10 pb-6 md:grid-cols-[minmax(0,1fr)_minmax(260px,0.65fr)] md:items-center">
            <div className="flex items-center gap-4">
              <LevelBadge level={progress.level} size="large" />
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/45">Ваш уровень</p>
                <p className="font-display mt-1 text-3xl">{progress.level.title}</p>
                <p className="mt-1 text-sm text-white/55">{progress.points.toLocaleString("ru-RU")} баллов</p>
              </div>
            </div>
            <div>
              <div className="flex items-end justify-between gap-3 text-xs text-white/55">
                <span>{progress.progressPercent}% уровня</span>
                <span className="text-right">{progress.next ? `${progress.pointsToNext.toLocaleString("ru-RU")} до ${progress.next.title}` : "Максимальный уровень"}</span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10">
                <div className={`h-full rounded-full ${toneStyles[progress.level.tone].progress}`} style={{ width: `${progress.progressPercent}%` }} />
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 rounded-xl border border-white/10 bg-white/[0.045] p-4 text-sm leading-6 text-white/65 sm:grid-cols-2">
            <p className="flex gap-2"><Star size={16} className="mt-1 shrink-0 text-gold" />Баллы показывают постоянный результат обучения и не сгорают каждую неделю.</p>
            <p className="flex gap-2"><Info size={16} className="mt-1 shrink-0 text-gold" />Недельный XP считается отдельно для лиги, а Coins используются в магазине наград.</p>
          </div>

          <div className="mt-6">
            <div className="mb-3 flex items-end justify-between gap-3">
              <h3 className="font-display text-2xl">Шкала уровней</h3>
              <span className="text-xs text-white/35">10 уровней</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {levels.map((level, index) => {
                const current = level.level === progress.level.level;
                const achieved = level.level < progress.level.level;
                const next = level.level === progress.level.level + 1;
                return (
                  <div key={level.code} data-testid="level-scale-row" className={`flex min-w-0 items-center gap-3 rounded-xl border px-3 py-3 ${current ? "border-white/25 bg-white/10" : "border-white/[0.07] bg-white/[0.025]"}`}>
                    <LevelBadge level={level} size="small" muted={!current && !achieved && !next} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-black">{level.title}</p>
                        <span className={`text-[9px] font-black uppercase tracking-[0.1em] ${current ? "text-gold" : achieved ? "text-emerald-300" : next ? "text-white/60" : "text-white/25"}`}>
                          {current ? "Текущий" : achieved ? "Получен" : next ? "Следующий" : "Закрыт"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-white/40">{levelRange(levels, index)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export function LevelSummary({
  progress,
  compact = false,
}: {
  progress: ProductLevelProgress;
  compact?: boolean;
}) {
  const tone = toneStyles[progress.level.tone];
  const [detailsOpen, setDetailsOpen] = useState(false);
  return (
    <section data-testid="level-summary" className={`overflow-hidden rounded-[28px] bg-[#171813] text-white shadow-soft ${compact ? "p-5" : "p-6 sm:p-8"}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className={`flex items-center gap-2 text-xs font-black uppercase ${tone.accent}`}>
            <ShieldCheck size={16} />
            Постоянный уровень
          </p>
          <h2 className={`font-display mt-3 ${compact ? "text-3xl" : "text-4xl sm:text-5xl"}`}>
            {progress.level.title}
          </h2>
          <p className="mt-2 text-sm text-white/55">
            {progress.points.toLocaleString("ru-RU")} баллов
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-3">
          <LevelBadge level={progress.level} size={compact ? "medium" : "large"} />
          {!compact ? (
            <button type="button" onClick={() => setDetailsOpen(true)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-xs font-bold text-white/65 transition hover:bg-white/10 hover:text-white">
              Все уровни <ChevronRight size={14} />
            </button>
          ) : null}
        </div>
      </div>

      <div className={compact ? "mt-5" : "mt-7"}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-white/55">
          <span className="inline-flex items-center gap-1.5">
            <Gauge size={14} /> {progress.progressPercent}% текущего уровня
          </span>
          <span>
            {progress.next
              ? `${progress.pointsToNext.toLocaleString("ru-RU")} баллов до ${progress.next.title}`
              : "Максимальный уровень достигнут"}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full rounded-full ${tone.progress}`}
            style={{ width: `${progress.progressPercent}%` }}
          />
        </div>
      </div>

      {!compact && progress.next ? (
        <div className="mt-6 flex items-center gap-3 border-t border-white/10 pt-5">
          <LevelBadge level={progress.next} size="small" muted />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase text-white/40">Следующий рубеж</p>
            <p className="mt-1 font-bold">{progress.next.title}</p>
          </div>
          <ChevronRight size={18} className="text-white/30" />
        </div>
      ) : !compact ? (
        <div className="mt-6 flex items-center gap-3 border-t border-white/10 pt-5 text-sm text-white/65">
          <Sparkles size={18} className="text-red-300" />
          Баллы продолжают накапливаться после LEVEL 10.
        </div>
      ) : null}
      {detailsOpen ? <LevelProgressDialog progress={progress} onClose={() => setDetailsOpen(false)} /> : null}
    </section>
  );
}
