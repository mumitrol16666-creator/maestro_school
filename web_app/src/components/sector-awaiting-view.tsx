"use client";

import { CheckCircle2, Circle, Clock, Target } from "lucide-react";
import { ProgressBar } from "@/components/progress-bar";
import { SectorExamSummary } from "@/components/sector-exam-summary";
import type { PublicSectorExam, SectorExam, TeacherSectorExamRow } from "@/types/sector-exam";
import type { StudentMonthlyPlan } from "@/types/teacher-students";

/** The teacher sees the exam as the student does: only the states the student sees. */
export function publicExamOf(exam: SectorExam | null | undefined): PublicSectorExam | null {
  if (!exam) return null;
  if (!["awaiting_schedule", "scheduled", "in_progress", "completed"].includes(exam.status)) return null;
  return {
    id: exam.id,
    status: exam.status as PublicSectorExam["status"],
    attempt: exam.attempt,
    scheduledAt: exam.scheduledAt,
    finishedAt: exam.finishedAt,
    outcome: exam.outcome,
    certificate: exam.certificate,
    items: exam.items.map((item) => ({ id: item.id, title: item.title, criteria: item.criteria, done: item.done })),
  };
}

/**
 * 07.11: the previous sector waiting for its exam, read-only. Its topics, goal and exam are shown;
 * edits go to the current sector. Early close sits under it in the editor.
 */
export function SectorAwaitingView({ plan, examRow }: { plan: StudentMonthlyPlan; examRow: TeacherSectorExamRow | null }) {
  const topics = plan.items.filter((item) => !item.state || item.state === "active");
  return (
    <div className="mt-5" data-testid="sector-awaiting-view">
      <p className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-sky-100 px-3 text-xs font-black text-sky-900">
        <Clock size={14} aria-hidden="true" /> Ждёт экзамена
      </p>
      <div className="mt-4">
        <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-amber-950">
          <Target size={15} className="text-gold-ink" /> Цель сектора
        </p>
        <p className="mt-2 break-words rounded-2xl border border-stone-200 bg-white p-3.5 text-sm font-semibold text-ink">{plan.goal || "Цель не задана"}</p>
      </div>
      <ul className="mt-4 grid gap-2">
        {topics.map((item) => {
          const percent = item.progressPercent ?? 0;
          return (
            <li key={item.id} className="min-w-0 rounded-2xl border border-stone-200 bg-white p-3">
              <div className="flex items-start gap-2">
                {percent === 100
                  ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
                  : <Circle size={16} className="mt-0.5 shrink-0 text-stone-400" aria-hidden="true" />}
                <p className="min-w-0 flex-1 break-words text-sm font-bold text-ink">{item.title}</p>
                <span className="shrink-0 text-xs font-black text-stone-700">{percent}%</span>
              </div>
              <div className="mt-2"><ProgressBar value={percent} /></div>
            </li>
          );
        })}
      </ul>
      <SectorExamSummary exam={publicExamOf(examRow?.exam)} />
      <p className="mt-4 text-sm text-stone-700" data-testid="sector-awaiting-readiness">
        {examRow?.progress.ready
          ? "Готовность к экзамену отмечена. Дату назначит администратор."
          : "Готовность к экзамену пока не отмечена: отметьте её в карточке ученика."}
      </p>
    </div>
  );
}
