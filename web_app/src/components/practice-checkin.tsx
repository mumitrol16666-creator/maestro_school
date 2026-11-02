"use client";

import { CheckCircle2, Guitar } from "lucide-react";
import { useState } from "react";
import { toast } from "@/components/toast";
import { practiceApi } from "@/lib/api-client";
import { invalidateStudentHome } from "@/lib/student-home";
import type { PracticeStatus } from "@/types/api";

/** Plan 5.6: «позанимался» — one tap a day, an answer in the reminder's tone, the streak of days. */
export function PracticeCheckin({ practice }: { practice: PracticeStatus | null }) {
  const [state, setState] = useState<{ checked: boolean; streak: number; reply: string | null }>({
    checked: practice?.checkedInToday ?? false,
    streak: practice?.streakDays ?? 0,
    reply: null,
  });
  const [busy, setBusy] = useState(false);
  if (!practice) return null;

  async function checkIn() {
    setBusy(true);
    try {
      const result = await practiceApi.checkIn();
      setState({ checked: true, streak: result.streakDays, reply: result.reply });
      invalidateStudentHome();
      toast.success("Отмечено: сегодня позанимался");
    } catch {
      toast.error("Не получилось отметить. Попробуй ещё раз");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-white/[0.06] px-4 py-3" data-testid="practice-checkin">
      {state.checked ? (
        <p className="inline-flex items-center gap-2 text-sm font-bold text-emerald-200">
          <CheckCircle2 size={18} /> {state.reply ?? "Сегодня позанимался"}
        </p>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void checkIn()}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-bold text-white hover:bg-white/20 disabled:opacity-60"
        >
          <Guitar size={17} /> Позанимался сегодня
        </button>
      )}
      <span className="text-xs text-white/60" data-testid="practice-streak">
        {state.streak ? `Дней подряд: ${state.streak}` : "Отмечай дни, когда брал инструмент"}
      </span>
    </div>
  );
}
