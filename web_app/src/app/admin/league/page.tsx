"use client";

import {
  Medal,
  Search,
  ShieldCheck,
  ShieldOff,
  Snowflake,
  Trophy,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { weeklyLeagueApi } from "@/lib/weekly-league-api";

export default function AdminWeeklyLeaguePage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [protectionStudentId, setProtectionStudentId] = useState<string | null>(null);
  const [protectionCategory, setProtectionCategory] = useState<"illness" | "family" | "other">("illness");
  const [protectionComment, setProtectionComment] = useState("");
  const [protectionError, setProtectionError] = useState<string | null>(null);
  const resource = useApiResource(
    () => weeklyLeagueApi.adminOverview(weekOffset),
    [weekOffset],
  );
  const students = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru-RU");
    if (!query) return resource.data?.students ?? [];
    return (resource.data?.students ?? []).filter((student) => (
      student.fullName.toLocaleLowerCase("ru-RU").includes(query)
      || student.login?.toLocaleLowerCase("ru-RU").includes(query)
    ));
  }, [resource.data, search]);

  async function toggleEligibility(studentId: string, eligible: boolean) {
    setBusyId(studentId);
    try {
      await weeklyLeagueApi.setEligibility(studentId, eligible);
      await resource.reload();
    } finally {
      setBusyId(null);
    }
  }

  async function protectStreak(studentId: string) {
    const comment = protectionComment.trim();
    if (comment.length < 3) {
      setProtectionError("Укажите причину подробнее");
      return;
    }
    setBusyId(studentId);
    setProtectionError(null);
    try {
      await weeklyLeagueApi.protectStreak({
        studentId,
        weekDate: resource.data!.week.startAt,
        category: protectionCategory,
        comment,
        idempotencyKey: crypto.randomUUID(),
      });
      setProtectionStudentId(null);
      setProtectionComment("");
      await resource.reload();
    } catch (error) {
      setProtectionError(error instanceof Error ? error.message : "Не удалось защитить серию");
    } finally {
      setBusyId(null);
    }
  }

  if (resource.loading && !resource.data) return <LoadingState label="Загружаем недельную лигу" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data) return null;
  const data = resource.data;
  const economyV2Enabled = data.economyV2Enabled;

  return (
    <>
      <PageHeader
        eyebrow="Геймификация"
        title="Недельная лига"
        description="Счёт меняется сразу после подтверждённых учебных действий. Неактивные и исключённые аккаунты в таблицу не попадают."
        action={(
          <div className="inline-flex rounded-2xl border border-stone-200 bg-white p-1 shadow-sm">
            <button type="button" onClick={() => setWeekOffset(0)} className={`min-h-10 rounded-xl px-4 text-xs font-black ${weekOffset === 0 ? "bg-ink text-white" : "text-stone-500"}`}>Эта неделя</button>
            <button type="button" onClick={() => setWeekOffset(1)} className={`min-h-10 rounded-xl px-4 text-xs font-black ${weekOffset === 1 ? "bg-ink text-white" : "text-stone-500"}`}>Прошлая</button>
          </div>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <section className="rounded-[26px] border border-stone-200 bg-paper p-5 shadow-soft">
          <Trophy size={22} className="text-gold" />
          <p className="font-display mt-5 text-3xl">{data.standings[0]?.displayName ?? "—"}</p>
          <p className="mt-1 text-xs font-bold text-stone-500">Лидер · {data.standings[0]?.xp ?? 0} XP</p>
        </section>
        <section className="rounded-[26px] border border-stone-200 bg-paper p-5 shadow-soft">
          <Users size={22} className="text-violet-600" />
          <p className="font-display mt-5 text-3xl">{data.participantCount}</p>
          <p className="mt-1 text-xs font-bold text-stone-500">участников со счётом</p>
        </section>
        <section className="rounded-[26px] border border-stone-200 bg-paper p-5 shadow-soft">
          <ShieldOff size={22} className="text-stone-500" />
          <p className="font-display mt-5 text-3xl">{data.excludedCount}</p>
          <p className="mt-1 text-xs font-bold text-stone-500">не участвуют</p>
        </section>
      </div>

      <section className="mt-8 overflow-hidden rounded-[28px] border border-stone-200 bg-paper shadow-soft">
        <div className="border-b border-stone-100 p-5 sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-gold">{data.week.label}</p>
          <h2 className="font-display mt-2 text-3xl">Текущая таблица</h2>
        </div>
        {data.standings.length ? data.standings.map((entry) => (
          <div key={entry.studentId} className="grid grid-cols-[44px_1fr_auto] items-center gap-3 border-b border-stone-100 px-5 py-4 last:border-0 sm:px-6">
            <span className="font-display text-2xl text-stone-400">{entry.position}</span>
            <div className="min-w-0">
              <p className="truncate font-bold">{entry.position <= 3 ? `${["🥇", "🥈", "🥉"][entry.position - 1]} ` : ""}{entry.displayName}</p>
              <p className="mt-1 text-xs text-stone-500">{entry.eventCount} учебных действий</p>
            </div>
            <strong className="text-lg">{entry.xp} XP</strong>
          </div>
        )) : (
          <p className="p-8 text-center text-sm text-stone-500">В выбранной неделе ещё нет начислений XP.</p>
        )}
      </section>

      <section className="mt-8 rounded-[28px] border border-stone-200 bg-paper p-5 shadow-soft sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-gold">Допуск</p>
            <h2 className="font-display mt-2 text-3xl">Участники лиги</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
              Отключайте тестовые и служебные аккаунты. Уже заработанный XP хранится в истории, но не показывается в рейтинге, пока участие выключено.
            </p>
          </div>
          <label className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 sm:w-80">
            <Search size={16} className="text-stone-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Имя или логин" className="w-full bg-transparent text-sm outline-none" />
          </label>
        </div>

        <div className="mt-6 space-y-3">
          {students.map((student) => (
            <article key={student.id} className="rounded-2xl border border-stone-100 bg-stone-50 p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${student.effectiveEligible ? "bg-emerald-50 text-emerald-700" : "bg-stone-200 text-stone-500"}`}>
                  {student.effectiveEligible ? <ShieldCheck size={19} /> : <ShieldOff size={19} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{student.fullName}</p>
                  <p className="mt-1 text-xs text-stone-500">
                    {student.login ? `@${student.login} · ` : ""}
                    {student.isActive ? (student.position ? `${student.position} место · ${student.xp} XP` : "пока без XP") : "аккаунт неактивен"}
                    {` · серия ${student.streakWeeks}`}
                  </p>
                  {student.streakProtection ? (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-sky-800"><Snowflake size={13} /> Неделя защищена: {student.streakProtection.comment}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {economyV2Enabled && !student.streakProtection && student.isActive ? (
                    <button
                      type="button"
                      onClick={() => {
                        setProtectionStudentId(student.id);
                        setProtectionError(null);
                      }}
                      className="min-h-11 rounded-2xl border border-sky-200 bg-white px-4 text-xs font-black text-sky-800 hover:bg-sky-50"
                    >
                      Защитить серию
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busyId === student.id || !student.isActive}
                    onClick={() => void toggleEligibility(student.id, !student.leagueEligible)}
                    className={`min-h-11 rounded-2xl border px-4 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      student.leagueEligible
                        ? "border-red-200 bg-white text-red-700 hover:bg-red-50"
                        : "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
                    }`}
                  >
                    {busyId === student.id ? "Сохраняем…" : student.leagueEligible ? "Исключить" : "Включить"}
                  </button>
                </div>
              </div>
              {protectionStudentId === student.id ? (
                <div className="mt-4 grid gap-3 border-t border-stone-200 pt-4 sm:grid-cols-[190px_minmax(0,1fr)_auto] sm:items-start">
                  <select
                    value={protectionCategory}
                    onChange={(event) => setProtectionCategory(event.target.value as typeof protectionCategory)}
                    className="min-h-11 rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none focus:border-gold"
                  >
                    <option value="illness">Болезнь</option>
                    <option value="family">Семейные обстоятельства</option>
                    <option value="other">Другая причина</option>
                  </select>
                  <div>
                    <input
                      value={protectionComment}
                      onChange={(event) => setProtectionComment(event.target.value)}
                      placeholder="Краткий комментарий"
                      maxLength={512}
                      className="min-h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none focus:border-gold"
                    />
                    {protectionError ? <p className="mt-2 text-xs font-bold text-red-700">{protectionError}</p> : null}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => void protectStreak(student.id)} disabled={busyId === student.id} className="min-h-11 rounded-xl bg-ink px-4 text-xs font-black text-white disabled:opacity-50">Подтвердить</button>
                    <button type="button" onClick={() => setProtectionStudentId(null)} className="min-h-11 rounded-xl border border-stone-200 bg-white px-4 text-xs font-black">Отмена</button>
                  </div>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-[28px] border border-amber-200 bg-amber-50 p-6">
        <div className="flex gap-4">
          <Medal className="shrink-0 text-gold" size={24} />
          <div>
            <h2 className="font-display text-2xl">Призы выдаются автоматически</h2>
            <p className="mt-2 text-sm leading-6 text-amber-900">
              После окончания недели: {data.prizes.placements.map((item) => item.coins).join(" / ")} Coins за первые три места и +{data.prizes.personalGoal.coins} Coins каждому, кто набрал {data.prizes.personalGoal.xp} XP.{economyV2Enabled ? " Первые два подтверждённых занятия дают ещё по 50 Coins." : ""} Награды за одну неделю начисляются один раз.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
