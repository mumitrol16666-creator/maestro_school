"use client";

import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Award,
  Bolt,
  BookOpen,
  CheckCircle2,
  CalendarDays,
  ChevronDown,
  Clock3,
  Coins,
  ClipboardCheck,
  Megaphone,
  LoaderCircle,
  MonitorPlay,
  Music,
  Flame,
  School,
  Sparkles,
  Star,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ErrorState, LoadingState } from "@/components/data-states";
import { LevelBadge } from "@/components/level-summary";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { weeklyLeagueApi } from "@/lib/weekly-league-api";
import type {
  LeagueXpSourceType,
  PointsLeaderboardOverview,
  WeeklyLeagueStanding,
  WeeklyLeagueHistoryItem,
} from "@/types/weekly-league";

const podiumStyles = [
  "border-amber-300 bg-gradient-to-br from-amber-50 to-white",
  "border-stone-300 bg-gradient-to-br from-stone-100 to-white",
  "border-orange-200 bg-gradient-to-br from-orange-50 to-white",
];

const sourceIcons: Record<LeagueXpSourceType, typeof School> = {
  offline_lesson: School,
  online_lesson: MonitorPlay,
  learning_homework: BookOpen,
  course_homework: BookOpen,
  online_assignment: ClipboardCheck,
  prepared_test: ClipboardCheck,
  monthly_plan: Music,
  teacher_bonus: Star,
};

function countdownLabel(seconds: number) {
  const safe = Math.max(0, seconds);
  const days = Math.floor(safe / 86_400);
  const hours = Math.floor(safe % 86_400 / 3_600);
  const minutes = Math.floor(safe % 3_600 / 60);
  if (days > 0) return `${days} дн ${hours} ч`;
  if (hours > 0) return `${hours} ч ${minutes} мин`;
  return `${minutes} мин`;
}

function participantCountLabel(count: number) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  const word = mod100 >= 11 && mod100 <= 14
    ? "участников"
    : mod10 === 1
      ? "участник"
      : mod10 >= 2 && mod10 <= 4
        ? "участника"
        : "участников";
  return `${count} ${word}`;
}

function RankMovement({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="text-stone-400">Новое участие</span>;
  if (delta > 0) return <span className="inline-flex items-center gap-1 text-emerald-700"><ArrowUp size={13} /> на {delta}</span>;
  if (delta < 0) return <span className="inline-flex items-center gap-1 text-red-600"><ArrowDown size={13} /> на {Math.abs(delta)}</span>;
  return <span className="text-stone-400">Без изменений</span>;
}

function PodiumCard({ entry, index }: { entry: WeeklyLeagueStanding; index: number }) {
  return (
    <article className={`rounded-[26px] border p-5 shadow-soft ${podiumStyles[index]} ${entry.isCurrentStudent ? "ring-2 ring-gold/50" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-full border border-current text-gold" aria-label={`${entry.position} место`}>
          <Award size={22} />
        </span>
        <span className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-black text-stone-500">
          {entry.eventCount} действий
        </span>
      </div>
      <p className="mt-6 text-xs font-black uppercase tracking-[0.16em] text-stone-400">{entry.position} место</p>
      <h3 className="font-display mt-1 truncate text-2xl">
        {entry.displayName}
        {entry.isCurrentStudent ? <span className="ml-2 text-sm text-gold">(вы)</span> : null}
      </h3>
      <p className="font-display mt-4 text-4xl">{entry.xp} <span className="text-base text-gold">XP</span></p>
      <p className="mt-2 text-xs font-bold"><RankMovement delta={entry.rankDelta} /></p>
    </article>
  );
}

function PointsLeaderboard({ data }: { data: PointsLeaderboardOverview }) {
  if (!data.enabled) return null;
  const currentOutsideTop = data.currentStudent && !data.standings.some(
    (entry) => entry.isCurrentStudent,
  );
  return (
    <section className="mt-9" data-testid="points-leaderboard">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase text-emerald-700">Постоянный результат</p>
          <h2 className="font-display mt-2 text-3xl">Топ по баллам</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
            Общий результат по всем направлениям. Эта таблица не обнуляется по понедельникам и не выдаёт недельные призы.
          </p>
        </div>
        <span className="text-sm font-bold text-stone-500">{participantCountLabel(data.participantCount)}</span>
      </div>

      {data.allBalancesEqual ? (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
          У всех одинаковое количество баллов: ученики делят одну позицию, отдельный лидер не определяется.
        </div>
      ) : null}

      <div className="mt-5 overflow-hidden rounded-[26px] border border-stone-200 bg-white shadow-soft">
        {data.standings.map((entry) => (
          <div
            key={`${entry.position}-${entry.displayName}`}
            data-testid="points-leaderboard-row"
            className={`grid min-h-[76px] grid-cols-[36px_44px_minmax(0,1fr)_auto] items-center gap-3 border-b border-stone-100 px-3 py-3 last:border-0 sm:grid-cols-[48px_52px_minmax(0,1fr)_auto] sm:px-6 ${entry.isCurrentStudent ? "bg-emerald-50" : ""}`}
          >
            <span className="font-display text-2xl text-stone-400">{entry.position}</span>
            <LevelBadge level={entry.level} size="small" />
            <div className="min-w-0">
              <p className="truncate font-bold">{entry.displayName}{entry.isCurrentStudent ? " · (вы)" : ""}</p>
              <p className="mt-1 text-xs font-semibold text-stone-400">{entry.level.title}</p>
            </div>
            <strong className="whitespace-nowrap text-sm sm:text-base">
              {entry.points.toLocaleString("ru-RU")} <span className="text-xs text-emerald-700">баллов</span>
            </strong>
          </div>
        ))}
      </div>

      {currentOutsideTop && data.currentStudent ? (
        <div className="mt-3 grid min-h-[76px] grid-cols-[36px_44px_minmax(0,1fr)_auto] items-center gap-3 rounded-[22px] border border-emerald-300 bg-emerald-50 px-3 py-3 sm:grid-cols-[48px_52px_minmax(0,1fr)_auto] sm:px-6">
          <span className="font-display text-2xl text-emerald-800">{data.currentStudent.position}</span>
          <LevelBadge level={data.currentStudent.level} size="small" />
          <div className="min-w-0">
            <p className="truncate font-bold">Ваша позиция</p>
            <p className="mt-1 text-xs font-semibold text-stone-500">{data.currentStudent.level.title}</p>
          </div>
          <strong className="whitespace-nowrap text-sm sm:text-base">
            {data.currentStudent.points.toLocaleString("ru-RU")} <span className="text-xs text-emerald-700">баллов</span>
          </strong>
        </div>
      ) : null}
    </section>
  );
}

function streakOutcomeLabel(outcome: WeeklyLeagueHistoryItem["streakOutcome"]) {
  if (outcome === "extended") return "Серия продолжена";
  if (outcome === "frozen") return "Неделя защищена";
  return "Серия завершена";
}

function LeagueHistory() {
  const resource = useApiResource(() => weeklyLeagueApi.history(), []);
  const [items, setItems] = useState<WeeklyLeagueHistoryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  useEffect(() => {
    setItems(resource.data?.items ?? []);
    setNextCursor(resource.data?.nextCursor ?? null);
  }, [resource.data]);

  if (resource.loading && !resource.data) return <LoadingState label="Загружаем историю недель" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data?.economyV2Enabled) return null;

  return (
    <section className="mt-9" data-testid="weekly-league-history">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-gold"><CalendarDays size={15} /> Архив</p>
          <h2 className="font-display mt-2 text-3xl">История недель</h2>
        </div>
        <p className="text-sm font-bold text-stone-500">Зафиксированные результаты</p>
      </div>
      {items.length ? (
        <div className="mt-5 overflow-hidden border-y border-stone-200 bg-white">
          {items.map((item) => (
            <details key={item.snapshotId} className="group border-b border-stone-200 last:border-0">
              <summary className="cursor-pointer list-none px-4 py-5 sm:px-6">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-ink">{item.week.label}</p>
                    <p className="mt-1 text-xs text-stone-400">Итог сохранён {new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(new Date(item.week.finalizedAt))}</p>
                  </div>
                  <ChevronDown size={18} className="mt-1 shrink-0 text-stone-400 transition group-open:rotate-180" />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                  <div><p className="font-display text-2xl">#{item.position}</p><p className="text-[11px] font-bold text-stone-400">место</p></div>
                  <div><p className="font-display text-2xl">{item.xp}</p><p className="text-[11px] font-bold text-stone-400">XP</p></div>
                  <div><p className="font-display text-2xl">{item.coinsAwarded}</p><p className="text-[11px] font-bold text-stone-400">Coins</p></div>
                  <div><p className="font-display text-2xl">{item.streakWeeks}</p><p className="text-[11px] font-bold text-stone-400">недель серии</p></div>
                </div>
              </summary>
              <div className="border-t border-stone-100 bg-stone-50 px-4 py-5 sm:px-6">
                <div className="grid gap-6 lg:grid-cols-2">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-stone-400">Ваш результат</p>
                    <p className="mt-3 text-sm font-bold">{streakOutcomeLabel(item.streakOutcome)}{item.goalMet ? ` · цель ${item.goalXp} XP выполнена` : ""}</p>
                    <div className="mt-4 space-y-2">
                      {item.breakdown.map((part) => (
                        <div key={part.sourceType} className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-stone-600">{part.label}</span><strong>+{part.xp} XP</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-stone-400">Топ-3 недели</p>
                    <div className="mt-3 divide-y divide-stone-200">
                      {item.topThree.map((leader) => (
                        <div key={`${leader.position}-${leader.displayName}`} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 py-2.5 text-sm">
                          <span className="font-display text-lg text-gold">{leader.position}</span>
                          <span className="truncate font-semibold">{leader.displayName}{leader.isCurrentStudent ? " · вы" : ""}</span>
                          <strong>{leader.xp} XP</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </details>
          ))}
        </div>
      ) : (
        <p className="mt-5 border-y border-stone-200 py-7 text-sm text-stone-500">Первая завершённая неделя появится здесь после финализации.</p>
      )}
      {moreError ? <p className="mt-3 text-sm font-semibold text-red-700">{moreError}</p> : null}
      {nextCursor ? (
        <button
          type="button"
          disabled={loadingMore}
          onClick={() => {
            setLoadingMore(true);
            setMoreError(null);
            void weeklyLeagueApi.history(nextCursor)
              .then((page) => {
                setItems((current) => [...current, ...page.items]);
                setNextCursor(page.nextCursor);
              })
              .catch(() => setMoreError("Не удалось загрузить следующую страницу истории"))
              .finally(() => setLoadingMore(false));
          }}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 text-sm font-bold text-ink disabled:opacity-50"
        >
          {loadingMore ? <LoaderCircle size={16} className="animate-spin" /> : <CalendarDays size={16} />}
          Загрузить ещё
        </button>
      ) : null}
    </section>
  );
}

const actionRoutes: Array<{ sourceType: LeagueXpSourceType; label: string; href: string; action: string; icon: typeof School }> = [
  { sourceType: "offline_lesson", label: "Подтверждённый урок · первые 2 за неделю", href: "/school-lessons", action: "Расписание", icon: School },
  { sourceType: "learning_homework", label: "Принятое ДЗ · до 3 на направление", href: "/school-lessons?tab=homework", action: "Открыть", icon: BookOpen },
  { sourceType: "prepared_test", label: "Успешный тест · первые 2 за неделю", href: "/tests", action: "Начать", icon: ClipboardCheck },
];

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "только что";
  if (mins < 60) return `${mins} мин назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  return `${days} дн назад`;
}

export default function WeeklyLeaguePage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const resource = useApiResource(
    () => weeklyLeagueApi.studentOverview(weekOffset),
    [weekOffset],
  );
  const pointsResource = useApiResource(() => weeklyLeagueApi.pointsLeaderboard(), []);
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
  const ruleBySource = new Map(data.rules.map((rule) => [rule.sourceType, rule]));

  const top3Threshold = data.standings[2]?.xp ?? 0;
  const xpToTop3 = me?.position && me.position > 3 ? Math.max(0, top3Threshold - (me.xp ?? 0) + 1) : 0;

  return (
    <>
      {/* Header with week switch */}
      <PageHeader
        eyebrow="Соревнование школы"
        title="Недельная лига"
        description="XP показывает учебную активность этой недели. В понедельник начинается новый счёт."
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

      {/* ═══════════════════ Hero card ═══════════════════ */}
      <section className="relative overflow-hidden rounded-[32px] bg-[#171813] p-6 text-white shadow-2xl sm:p-8">
        <div className="relative grid gap-7 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-black text-emerald-300">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                {data.week.phase === "live"
                  ? "Счёт обновляется"
                  : data.week.phase === "finalizing"
                    ? "Подведение итогов"
                    : "Результат зафиксирован"}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs font-bold text-white/60">
                <Users size={13} /> {participantCountLabel(data.participantCount)}
              </span>
              {data.week.isCurrent ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs font-bold text-white/60">
                  <Clock3 size={13} /> {countdownLabel(remaining)}
                </span>
              ) : null}
            </div>
            <p className="mt-6 text-xs font-black uppercase tracking-[0.18em] text-gold">{data.week.label}</p>
            <h2 className="font-display mt-2 text-4xl sm:text-5xl">
              {me?.xp ?? 0} <span className="text-2xl text-gold">/ {me?.goalXp ?? 80} XP</span>
            </h2>
            <div className="mt-3 h-3 w-full max-w-xs overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gold" style={{ width: `${me?.goalProgress ?? 0}%` }} />
            </div>
          </div>
          <div className="min-w-[230px] rounded-[24px] border border-white/10 bg-white/[0.06] p-5">
            <div className="flex items-center justify-between text-xs font-bold text-white/55">
              <span>Личная цель</span>
              <span>{me?.xp ?? 0} / {me?.goalXp ?? 80} XP</span>
            </div>
            <p className="mt-4 flex items-center gap-2 text-sm font-bold">
              {(me?.goalProgress ?? 0) >= 100 ? <CheckCircle2 size={17} className="text-emerald-400" /> : <Target size={17} className="text-gold" />}
              {(me?.goalProgress ?? 0) >= 100
                ? `Цель выполнена · +${data.prizes.personalGoal.coins} Coins`
                : `До цели ещё ${Math.max(0, (me?.goalXp ?? 80) - (me?.xp ?? 0))} XP`}
            </p>
          </div>
        </div>
      </section>

      {/* ═══════════════════ 4 stat cards ═══════════════════ */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-[20px] border border-stone-200 bg-paper p-4 shadow-soft text-center">
          <p className="font-display text-3xl text-ink">{me?.position ? `#${me.position}` : "—"}</p>
          <p className="mt-1 text-[11px] font-bold text-stone-500">{data.week.positionsFinal ? "итоговое место" : "текущее место"}</p>
        </div>
        <div className="rounded-[20px] border border-stone-200 bg-paper p-4 shadow-soft text-center">
          <p className="font-display flex min-h-9 items-center justify-center gap-1 text-3xl text-ink">
            {xpToTop3 > 0 ? xpToTop3 : <Trophy size={28} className="text-gold" />} <span className="text-sm text-gold">{xpToTop3 > 0 ? "XP" : ""}</span>
          </p>
          <p className="mt-1 text-[11px] font-bold text-stone-500">{xpToTop3 > 0 ? "до топ-3" : "в топ-3!"}</p>
        </div>
        <div className="rounded-[20px] border border-stone-200 bg-paper p-4 shadow-soft text-center">
          <p className="font-display text-3xl text-ink">{me?.projectedRewardCoins ?? 0}</p>
          <p className="mt-1 text-[11px] font-bold text-stone-500">Coins за неделю</p>
        </div>
        <div className="rounded-[20px] border border-stone-200 bg-paper p-4 shadow-soft text-center">
          <p className="font-display text-3xl text-ink">{me?.streakWeeks ?? 0}</p>
          <p className="mt-1 text-[11px] font-bold text-stone-500">недель в серии</p>
        </div>
      </div>

      {/* ═══════════════════ What to do now ═══════════════════ */}
      {data.week.isCurrent ? (
        <section className="mt-7 rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft">
          <div className="flex items-center gap-3">
            <Sparkles size={20} className="text-gold" />
            <h2 className="font-display text-xl">Что сделать сейчас</h2>
          </div>
          <div className="mt-5 space-y-2">
            {actionRoutes.map((item) => {
              const Icon = item.icon;
              const rule = ruleBySource.get(item.sourceType);
              return (
                <div key={item.sourceType} className="flex flex-wrap items-center gap-3 rounded-2xl bg-stone-50/80 px-4 py-3 transition hover:bg-stone-100">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-50 text-gold">
                    <Icon size={17} />
                  </span>
                  <span className="min-w-0 flex-[1_1_calc(100%-3rem)] text-sm font-semibold sm:flex-1">{item.label}</span>
                  <span className="ml-12 shrink-0 text-xs font-black text-gold sm:ml-0">
                    {rule ? `+${rule.xp}${rule.retryXp ? ` / +${rule.retryXp}` : ""} XP` : "XP"}
                    {data.economyV2Enabled && item.sourceType === "offline_lesson" ? " · +50 Coins" : ""}
                  </span>
                  <Link href={item.href} className="shrink-0 rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-ink transition hover:border-gold hover:text-gold">
                    {item.action}
                  </Link>
                </div>
              );
            })}
          </div>
          {ruleBySource.has("teacher_bonus") ? (
            <p className="mt-4 border-t border-stone-200 pt-4 text-xs leading-5 text-stone-500">
              За дополнительный учебный вклад преподаватель может начислить бонус XP.
            </p>
          ) : null}
        </section>
      ) : null}

      {me && data.economyV2Enabled ? (
        <section className="mt-7" data-testid="weekly-streak">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-gold"><Flame size={15} /> Серия активности</p>
              <h2 className="font-display mt-2 text-3xl">{me.streakWeeks} недель подряд</h2>
            </div>
            <p className="text-sm font-bold text-stone-500">Лучшая серия: {me.bestStreakWeeks}</p>
          </div>
          {me.streakOutcome === "frozen" ? (
            <p className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-900">
              Эта неделя защищена и не изменяет серию.
            </p>
          ) : null}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {me.streakMilestones.map((milestone) => (
              <article
                key={milestone.weeks}
                className={`min-h-28 rounded-[20px] border p-4 ${milestone.earned ? "border-gold bg-amber-50" : "border-stone-200 bg-paper"}`}
              >
                <Award size={19} className={milestone.earned ? "text-gold" : "text-stone-400"} />
                <p className="font-display mt-4 text-2xl">{milestone.weeks}</p>
                <p className="text-[11px] font-bold text-stone-500">недель · {milestone.coins} Coins</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {!me?.eligible ? (
        <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
          Ваш аккаунт пока не участвует в лиге. Учебный прогресс продолжает сохраняться; включить участие может администратор.
        </section>
      ) : null}

      {/* ═══════════════════ Podium + Table ═══════════════════ */}
      <section className="mt-9">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-gold">
              {data.week.phase === "finalizing" ? "Предварительный результат" : "Лидеры недели"}
            </p>
            <h2 className="font-display mt-2 text-3xl">{data.week.positionsFinal ? "Итоги недели" : "Топ недели"}</h2>
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

      {pointsResource.data ? <PointsLeaderboard data={pointsResource.data} /> : null}
      {pointsResource.error ? (
        <section className="mt-9 rounded-2xl border border-stone-200 bg-white p-5 text-sm text-stone-600">
          Топ по баллам временно не загрузился. {" "}
          <button type="button" onClick={pointsResource.reload} className="font-bold text-emerald-800 hover:underline">Повторить</button>
        </section>
      ) : null}

      <LeagueHistory />

      {/* ═══════════════════ Breakdown + History ═══════════════════ */}
      <details className="group mt-9 border-y border-stone-200">
        <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-gold">Ваш XP</p>
            <h2 className="font-display mt-1 text-2xl">Как начислился XP</h2>
          </div>
          <ChevronDown size={20} className="shrink-0 text-stone-400 transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid gap-5 pb-5 lg:grid-cols-2">
        <section className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-gold">За что начислено</p>
              <h2 className="font-display mt-2 text-3xl">Из чего сложился счёт</h2>
            </div>
            <Award size={26} className="text-gold" />
          </div>
          {me?.breakdown.length ? (
            <div className="mt-6 space-y-3">
              {me.breakdown.map((item) => {
                const Icon = sourceIcons[item.sourceType] ?? Bolt;
                return (
                  <div key={item.sourceType} className="flex items-center gap-3 rounded-2xl bg-stone-50 px-4 py-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-50 text-gold"><Icon size={15} /></span>
                    <span className="min-w-0 flex-1 text-sm font-semibold text-stone-600">{item.label}</span>
                    <strong>+{item.xp} XP</strong>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-6 text-sm leading-6 text-stone-500">Пока пусто. Посетите урок, сдайте ДЗ или пройдите тест — XP появится здесь автоматически.</p>
          )}
        </section>

        {/* Recent XP history */}
        <section className="rounded-[28px] border border-stone-200 bg-paper p-6 shadow-soft">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-gold">История XP</p>
              <h2 className="font-display mt-2 text-3xl">Последние действия</h2>
            </div>
            <Megaphone size={26} className="text-gold" />
          </div>
          {me?.recentEvents.length ? (
            <div className="mt-6 space-y-2">
              {me.recentEvents.map((ev, i) => {
                const Icon = sourceIcons[ev.sourceType] ?? Bolt;
                return (
                  <div key={`${ev.sourceType}-${i}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-stone-50">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><Icon size={15} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{ev.description}</p>
                      <p className="text-[11px] text-stone-400">{timeAgo(ev.createdAt)}</p>
                    </div>
                    <strong className="shrink-0 text-sm text-emerald-700">+{ev.xp} XP</strong>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-6 text-sm leading-6 text-stone-500">Здесь появится лента действий за текущую неделю.</p>
          )}
        </section>
        </div>
      </details>

      {data.prizes.rewardsEnabled ? (
        <section className="mt-5 flex flex-col gap-4 border-y border-stone-200 bg-paper px-1 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-start gap-3">
            <Trophy size={20} className="mt-0.5 shrink-0 text-gold" />
            <p className="text-sm leading-6 text-stone-600">
              Топ-3 получает <strong className="text-ink">{data.prizes.placements.map((item) => item.coins).join(" / ")} Coins</strong>.
              За личную цель {data.prizes.personalGoal.xp} XP — ещё <strong className="text-ink">+{data.prizes.personalGoal.coins} Coins</strong>.
            </p>
          </div>
          <Link href="/rewards" className="inline-flex min-h-10 shrink-0 items-center gap-2 self-start text-sm font-bold text-ink hover:text-gold sm:self-auto">
            Награды за Coins <ArrowRight size={15} />
          </Link>
        </section>
      ) : null}
    </>
  );
}
