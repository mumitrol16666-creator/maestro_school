"use client";

import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Award,
  Bolt,
  CheckCircle2,
  Clock3,
  Flame,
  Sparkles,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { weeklyLeagueApi } from "@/lib/weekly-league-api";
import type { WeeklyLeagueStanding } from "@/types/weekly-league";

const podiumStyles = [
  "border-amber-300 bg-gradient-to-br from-amber-50 to-white",
  "border-stone-300 bg-gradient-to-br from-stone-100 to-white",
  "border-orange-200 bg-gradient-to-br from-orange-50 to-white",
];

const podiumMedals = ["🥇", "🥈", "🥉"];

function countdownLabel(seconds: number) {
  const safe = Math.max(0, seconds);
  const days = Math.floor(safe / 86_400);
  const hours = Math.floor(safe % 86_400 / 3_600);
  const minutes = Math.floor(safe % 3_600 / 60);
  if (days > 0) return `${days} дн ${hours} ч`;
  if (hours > 0) return `${hours} ч ${minutes} мин`;
  return `${minutes} мин`;
}

function RankMovement({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="text-stone-400">Новое участие</span>;
  if (delta > 0) return <span className="inline-flex items-center gap-1 text-emerald-700"><ArrowUp size={13} /> на {delta}</span>;
  if (delta < 0) return <span className="inline-flex items-center gap-1 text-red-600"><ArrowDown size={13} /> на {Math.abs(delta)}</span>;
  return <span className="text-stone-400">Без изменений</span>;
}

function PodiumCard({ entry, index }: { entry: WeeklyLeagueStanding; index: number }) {
  return (
    <article className={`rounded-[26px] border p-5 shadow-soft ${podiumStyles[index]}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="text-4xl" aria-label={`${entry.position} место`}>{podiumMedals[index]}</span>
        <span className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-black text-stone-500">
          {entry.eventCount} действий
        </span>
      </div>
      <p className="mt-6 text-xs font-black uppercase tracking-[0.16em] text-stone-400">{entry.position} место</p>
      <h3 className="font-display mt-1 truncate text-2xl">{entry.displayName}</h3>
      <p className="font-display mt-4 text-4xl">{entry.xp} <span className="text-base text-gold">XP</span></p>
      <p className="mt-2 text-xs font-bold"><RankMovement delta={entry.rankDelta} /></p>
    </article>
  );
}

export default function WeeklyLeaguePage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const resource = useApiResource(
    () => weeklyLeagueApi.studentOverview(weekOffset),
    [weekOffset],
  );
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    setRemaining(resource.data?.week.secondsRemaining ?? 0);
  }, [resource.data?.week.secondsRemaining]);

  useEffect(() => {
    if (weekOffset !== 0) return;
    const countdown = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1_000);
    const liveRefresh = window.setInterval(() => {
      void weeklyLeagueApi.studentOverview(0).then(resource.setData).catch(() => undefined);
    }, 5_000);
    return () => {
      window.clearInterval(countdown);
      window.clearInterval(liveRefresh);
    };
  }, [weekOffset, resource.setData]);

  const podium = useMemo(() => resource.data?.standings.slice(0, 3) ?? [], [resource.data]);
  const table = useMemo(() => resource.data?.standings.slice(3) ?? [], [resource.data]);

  if (resource.loading && !resource.data) return <LoadingState label="Считаем места в лиге" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data) return null;
  const data = resource.data;
  const me = data.currentStudent;

  return (
    <>
      <PageHeader
        eyebrow="Недельная лига Maestro"
        title="Учимся вместе. Счёт идёт сейчас."
        description="Каждый понедельник начинается новое соревнование. XP недели обнуляется, а ваши постоянные баллы, Coins и ранг остаются."
        action={(
          <div className="inline-flex rounded-2xl border border-stone-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className={`min-h-10 rounded-xl px-4 text-xs font-black transition ${weekOffset === 0 ? "bg-ink text-white" : "text-stone-500"}`}
            >
              Эта неделя
            </button>
            <button
              type="button"
              onClick={() => setWeekOffset(1)}
              className={`min-h-10 rounded-xl px-4 text-xs font-black transition ${weekOffset === 1 ? "bg-ink text-white" : "text-stone-500"}`}
            >
              Прошлая
            </button>
          </div>
        )}
      />

      <section className="relative overflow-hidden rounded-[32px] bg-[#171813] p-6 text-white shadow-2xl sm:p-8">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gold/15 blur-3xl" />
        <div className="relative grid gap-7 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-black text-emerald-300">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                {data.week.isCurrent ? "Счёт обновляется в реальном времени" : "Неделя завершена"}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs font-bold text-white/60">
                <Users size={13} /> {data.participantCount} участников
              </span>
            </div>
            <p className="mt-6 text-xs font-black uppercase tracking-[0.18em] text-gold">{data.week.label}</p>
            <h2 className="font-display mt-2 text-4xl sm:text-5xl">
              {me?.position ? `${me.position} место` : me?.eligible ? "Ваш старт — впереди" : "Участие выключено"}
            </h2>
            <div className="mt-5 flex flex-wrap gap-x-7 gap-y-3 text-sm text-white/60">
              <span className="inline-flex items-center gap-2"><Bolt size={16} className="text-gold" /> <strong className="text-white">{me?.xp ?? 0} XP</strong> за неделю</span>
              <span className="inline-flex items-center gap-2"><Flame size={16} className="text-orange-400" /> серия <strong className="text-white">{me?.streakWeeks ?? 0} нед.</strong></span>
              {data.week.isCurrent ? (
                <span className="inline-flex items-center gap-2"><Clock3 size={16} className="text-gold" /> до финиша <strong className="text-white">{countdownLabel(remaining)}</strong></span>
              ) : null}
            </div>
          </div>
          <div className="min-w-[230px] rounded-[24px] border border-white/10 bg-white/[0.06] p-5">
            <div className="flex items-center justify-between text-xs font-bold text-white/55">
              <span>Личная цель</span>
              <span>{me?.xp ?? 0} / {me?.goalXp ?? 80} XP</span>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${me?.goalProgress ?? 0}%` }} />
            </div>
            <p className="mt-4 flex items-center gap-2 text-sm font-bold">
              {(me?.goalProgress ?? 0) >= 100 ? <CheckCircle2 size={17} className="text-emerald-400" /> : <Target size={17} className="text-gold" />}
              {(me?.goalProgress ?? 0) >= 100 ? "Цель выполнена: +3 Coins" : `До награды ещё ${Math.max(0, (me?.goalXp ?? 80) - (me?.xp ?? 0))} XP`}
            </p>
          </div>
        </div>
      </section>

      {!me?.eligible ? (
        <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
          Ваш аккаунт пока не участвует в лиге. Учебный прогресс продолжает сохраняться; включить участие может администратор.
        </section>
      ) : null}

      <section className="mt-9">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-gold">Лидеры</p>
            <h2 className="font-display mt-2 text-3xl">Топ недели</h2>
          </div>
          {data.highlights.breakthrough ? (
            <p className="hidden text-right text-xs font-bold text-stone-500 sm:block">
              Прорыв: <span className="text-ink">{data.highlights.breakthrough.displayName}</span> +{data.highlights.breakthrough.gain} XP
            </p>
          ) : null}
        </div>

        {podium.length ? (
          <div className="grid gap-4 md:grid-cols-3">
            {podium.map((entry, index) => <PodiumCard key={`${entry.position}-${entry.displayName}`} entry={entry} index={index} />)}
          </div>
        ) : (
          <div className="rounded-[28px] border border-dashed border-stone-300 bg-white/50 p-10 text-center">
            <Trophy className="mx-auto text-gold" size={34} />
            <h3 className="font-display mt-4 text-2xl">Неделя только началась</h3>
            <p className="mt-2 text-sm text-stone-500">Первое учебное действие сразу появится в таблице.</p>
          </div>
        )}

        {table.length ? (
          <div className="mt-5 overflow-hidden rounded-[26px] border border-stone-200 bg-paper shadow-soft">
            {table.map((entry) => (
              <div key={`${entry.position}-${entry.displayName}`} className={`grid grid-cols-[44px_1fr_auto] items-center gap-3 border-b border-stone-100 px-4 py-4 last:border-0 sm:px-6 ${entry.isCurrentStudent ? "bg-amber-50" : ""}`}>
                <span className="font-display text-2xl text-stone-400">{entry.position}</span>
                <div className="min-w-0">
                  <p className="truncate font-bold">{entry.displayName}{entry.isCurrentStudent ? " · это вы" : ""}</p>
                  <p className="mt-1 text-xs font-bold"><RankMovement delta={entry.rankDelta} /></p>
                </div>
                <span className="font-display text-2xl">{entry.xp} <span className="text-xs text-gold">XP</span></span>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {me?.position && me.position > 10 ? (
        <section className="mt-5 flex items-center gap-4 rounded-[24px] border border-gold/30 bg-amber-50 p-5">
          <span className="font-display text-3xl">{me.position}</span>
          <div className="min-w-0 flex-1">
            <p className="font-bold">Ваше место</p>
            <p className="mt-1 text-xs font-bold"><RankMovement delta={me.rankDelta} /></p>
          </div>
          <span className="font-display text-2xl">{me.xp} XP</span>
        </section>
      ) : null}

      <div className="mt-9 grid gap-5 lg:grid-cols-2">
        <section className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-gold">Ваш XP</p>
              <h2 className="font-display mt-2 text-3xl">Из чего сложился счёт</h2>
            </div>
            <Award size={26} className="text-gold" />
          </div>
          {me?.breakdown.length ? (
            <div className="mt-6 space-y-3">
              {me.breakdown.map((item) => (
                <div key={item.sourceType} className="flex items-center justify-between gap-4 rounded-2xl bg-stone-50 px-4 py-3">
                  <span className="text-sm font-semibold text-stone-600">{item.label}</span>
                  <strong>+{item.xp} XP</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-6 text-sm leading-6 text-stone-500">Пока пусто. Посетите урок, сдайте ДЗ или пройдите тест — XP появится здесь автоматически.</p>
          )}
        </section>

        <section className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-gold">Правила</p>
              <h2 className="font-display mt-2 text-3xl">Как заработать XP</h2>
            </div>
            <Sparkles size={26} className="text-gold" />
          </div>
          <div className="mt-6 space-y-3">
            {data.rules.map((rule) => (
              <div key={rule.sourceType} className="flex items-center justify-between gap-4 text-sm">
                <span className="text-stone-600">{rule.label}</span>
                <strong className="shrink-0">+{rule.xp} XP</strong>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            Топ-3 получает <strong>15 / 10 / 7 Coins</strong>. За личную цель {data.prizes.personalGoal.xp} XP — ещё <strong>+{data.prizes.personalGoal.coins} Coins</strong>.
          </div>
          <Link href="/rewards" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-ink hover:text-gold">
            Посмотреть награды за Coins <ArrowRight size={15} />
          </Link>
        </section>
      </div>
    </>
  );
}
