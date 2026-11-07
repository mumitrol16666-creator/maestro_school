"use client";

import { CheckCircle2, Guitar } from "lucide-react";
import { useEffect, useState } from "react";
import { Celebration } from "@/components/celebration";
import { toast } from "@/components/toast";
import { practiceApi } from "@/lib/api-client";
import { invalidateStudentHome } from "@/lib/student-home";
import type { PracticeStatus } from "@/types/api";

const REPLY_MS = 2_000;
const CELEBRATED_STREAKS = [7, 30];

/**
 * Plan 5.6: «позанимался» — one tap a day and an answer in the reminder's tone.
 * В-23: the answer is one 20 px sentence with a guitar for 2 s (no toast — two reactions to one
 * action are too many); a streak of 7 or 30 days opens the «Победа» window. The streak itself
 * lives in the header of the home.
 */
export function PracticeCheckin({ practice }: { practice: PracticeStatus | null }) {
  const [state, setState] = useState<{ checked: boolean; reply: string | null }>({
    checked: practice?.checkedInToday ?? false,
    reply: null,
  });
  const [busy, setBusy] = useState(false);
  const [replying, setReplying] = useState(false);
  const [celebrate, setCelebrate] = useState<number | null>(null);
  useEffect(() => {
    if (!replying) return;
    const timer = window.setTimeout(() => setReplying(false), REPLY_MS);
    return () => window.clearTimeout(timer);
  }, [replying]);
  if (!practice) return null;

  async function checkIn() {
    setBusy(true);
    try {
      const result = await practiceApi.checkIn();
      setState({ checked: true, reply: result.reply });
      // The home header shows the streak of days; it updates without a reload.
      window.dispatchEvent(new CustomEvent("maestro:practice-checked-in", { detail: { streakDays: result.streakDays } }));
      setReplying(true);
      if (CELEBRATED_STREAKS.includes(result.streakDays)) setCelebrate(result.streakDays);
      invalidateStudentHome();
    } catch {
      toast.error("Не получилось отметить. Попробуй ещё раз");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-white/[0.06] px-4 py-3" data-testid="practice-checkin">
      {celebrate ? (
        <Celebration
          value={celebrate}
          unit="дней подряд"
          title={celebrate >= 30 ? "Месяц с гитарой!" : "Неделя с гитарой!"}
          message="Ты берёшь инструмент каждый день — так и растут музыканты."
          onClose={() => setCelebrate(null)}
          testId="streak-celebration"
        />
      ) : null}
      {state.checked ? (
        replying ? (
          <p className="maestro-practice-reply inline-flex items-center gap-2 text-xl font-bold leading-7 text-gold-bright" data-testid="practice-reply">
            <Guitar size={22} className="shrink-0" aria-hidden="true" />
            <span className="min-w-0">{state.reply ?? "Так держать!"}</span>
          </p>
        ) : (
          <p className="inline-flex items-center gap-2 text-sm font-bold text-emerald-200" data-testid="practice-done">
            <CheckCircle2 size={18} /> Сегодня позанимался
          </p>
        )
      ) : (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => void checkIn()}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-bold text-white hover:bg-white/20 disabled:opacity-60"
          >
            <Guitar size={17} /> Позанимался сегодня
          </button>
          <span className="text-xs text-white/60" data-testid="practice-hint">
            Отмечай дни, когда брал инструмент
          </span>
        </>
      )}
    </div>
  );
}
