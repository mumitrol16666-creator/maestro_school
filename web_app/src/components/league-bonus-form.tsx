"use client";

import { Bolt, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { teacherStudentsApi } from "@/lib/teacher-students-api";

const control = "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Bonus XP in the weekly league: one bonus per student per Aqtobe week, whichever teacher gives it
 * (plan 1.8). The student card and the lesson step «Итог» (plan 1.5) use the same form.
 */
export function BonusXpForm({
  appUserId,
  givenThisWeek,
  title = "Бонус XP в лиге",
  onAwarded,
}: {
  appUserId: string | null;
  givenThisWeek: boolean;
  title?: string;
  onAwarded?: (amount: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(3);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [awardedNow, setAwardedNow] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const given = givenThisWeek || awardedNow;

  async function award() {
    if (!appUserId || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await teacherStudentsApi.awardWeeklyLeagueBonus({ studentId: appUserId, amount, reason: reason.trim(), idempotencyKey: crypto.randomUUID() });
      setFeedback(result.awarded ? `Начислено +${amount} XP` : "Этот бонус уже был начислен");
      if (result.awarded) {
        setReason("");
        setOpen(false);
        setAwardedNow(true);
        onAwarded?.(amount);
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Не удалось начислить бонус");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4" data-testid="bonus-xp-form">
      <div className="flex items-center justify-between gap-2">
        <p className="inline-flex min-w-0 items-center gap-1.5 text-xs font-black uppercase tracking-wider text-stone-600"><Bolt size={14} className="shrink-0" /> <span className="truncate">{title}</span></p>
        <button type="button" onClick={() => setOpen((current) => !current)} disabled={!appUserId || given} className={`${control} min-h-8 shrink-0 border border-stone-200 px-2 text-stone-700`}>
          {open ? "Скрыть" : "Дать бонус"}
        </button>
      </div>
      {!appUserId ? <p className="mt-2 text-xs text-stone-500">Ученик ещё не вошёл в приложение, бонус начислить некому.</p> : null}
      {appUserId && givenThisWeek ? <p className="mt-2 text-xs text-stone-500" data-testid="bonus-week-limit">Бонус на этой неделе уже дан. Следующий можно дать с понедельника.</p> : null}
      {feedback ? <p className="mt-2 text-xs font-semibold text-amber-900" role="status">{feedback}</p> : null}
      {open ? (
        <div className="mt-3 grid gap-2">
          <div className="flex flex-wrap gap-1">
            {[1, 3, 5, 10].map((value) => (
              <button key={value} type="button" onClick={() => setAmount(value)} className={`${control} min-h-8 px-2 ${amount === value ? "bg-amber-700 text-white" : "border border-amber-200 bg-white text-amber-900"}`}>+{value}</button>
            ))}
          </div>
          <input value={reason} maxLength={160} onChange={(event) => setReason(event.target.value)} aria-label="За что бонус" placeholder="За что: например, заметный прогресс в ритме" className="h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm" />
          <button type="button" disabled={busy || reason.trim().length < 3} onClick={() => void award()} className={`${control} bg-amber-700 text-white`}>
            {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Bolt size={14} />} Начислить +{amount} XP
          </button>
        </div>
      ) : null}
    </section>
  );
}

/** Plan 1.5: the lesson step «Итог» offers the bonus to every student who came. */
export function LessonBonusXp({ students }: { students: Array<{ crmStudentId: string; appUserId: string | null; name: string }> }) {
  const [givenByUser, setGivenByUser] = useState<Record<string, boolean> | null>(null);
  const linkedIds = students.map((student) => student.appUserId).filter((id): id is string => Boolean(id));
  const idsKey = linkedIds.join(",");

  useEffect(() => {
    if (!idsKey) {
      setGivenByUser({});
      return;
    }
    let cancelled = false;
    teacherStudentsApi.weeklyLeagueBonusStatus(idsKey.split(","))
      .then((rows) => { if (!cancelled) setGivenByUser(Object.fromEntries(rows.map((row) => [row.studentId, row.given]))); })
      .catch(() => { if (!cancelled) setGivenByUser({}); });
    return () => { cancelled = true; };
  }, [idsKey]);

  if (!students.length) return null;
  return (
    <div className="mt-6 border-t border-stone-200 pt-5" data-testid="lesson-bonus-xp">
      <p className="text-xs font-bold uppercase tracking-wider text-stone-500">Бонус XP за урок</p>
      <p className="mt-1 text-xs text-stone-500">Один бонус ученику в неделю, от любого преподавателя. Начисляется сразу, отдельно от отчёта.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {givenByUser === null ? (
          <p className="inline-flex items-center gap-2 text-xs text-stone-500"><LoaderCircle size={14} className="animate-spin" /> Проверяем бонусы недели</p>
        ) : students.map((student) => (
          <BonusXpForm
            key={student.crmStudentId}
            appUserId={student.appUserId}
            givenThisWeek={Boolean(student.appUserId && givenByUser[student.appUserId])}
            title={student.name}
          />
        ))}
      </div>
    </div>
  );
}
