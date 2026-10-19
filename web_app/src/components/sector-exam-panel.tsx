"use client";

import { Award, CalendarClock, Check, GraduationCap, LoaderCircle, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { useApiResource } from "@/hooks/use-api-resource";
import { ApiError } from "@/lib/api-client";
import { formatExamDate, sectorExamOutcomeLabel, sectorExamsApi, sectorExamStatusLabel } from "@/lib/sector-exams-api";
import type { SectorExam, TeacherSectorExamRow } from "@/types/sector-exam";

const control = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Plan 1.10: the exam of each open sector, as the teacher holds it live at the school.
 * Start once every topic is at 100 % and CRM booked the lesson; mark every point;
 * then close the sector or send the student to a retake, whatever the outcome.
 */
export function SectorExamPanel({ crmStudentId, onChanged }: { crmStudentId: string; onChanged?: () => void }) {
  const resource = useApiResource(() => sectorExamsApi.forStudent(crmStudentId), [crmStudentId]);
  if (resource.loading && !resource.data) return null;
  if (resource.error || !resource.data?.length) return null;
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3">
      {resource.data.map((row) => (
        <ExamCard key={row.planId} row={row} onChanged={() => { void resource.reload(); onChanged?.(); }} />
      ))}
    </div>
  );
}

function ExamCard({ row, onChanged }: { row: TeacherSectorExamRow; onChanged: () => void }) {
  const exam = row.exam;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<SectorExam | null>(null);
  const shown = current && exam && current.id === exam.id ? current : exam;

  async function run(key: string, action: () => Promise<SectorExam | void>, reload = false) {
    setBusy(key);
    setError(null);
    try {
      const result = await action();
      if (result) setCurrent(result);
      if (reload) onChanged();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось сохранить");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="min-w-0 rounded-2xl border border-sky-200 bg-sky-50/40 p-4" data-testid="sector-exam-panel">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-sky-900">
          <GraduationCap size={14} /> Экзамен сектора {row.sequence} · {row.direction.title}
        </p>
        {shown ? (
          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-sky-900">
            {shown.attempt > 1 ? `Пересдача ${shown.attempt - 1} · ` : ""}{sectorExamStatusLabel[shown.status]}
          </span>
        ) : null}
      </div>

      {row.previousExam && shown?.status !== "completed" ? <PastResult exam={row.previousExam} /> : null}

      {!shown ? (
        <p className="mt-2 text-xs leading-5 text-stone-600">
          {row.progress.ready
            ? "Все темы на 100 %. Экзамен готовит администратор школы, потом CRM назначит урок."
            : `Темы сектора: ${row.progress.completed} из ${row.progress.total}. Экзамен проводится, когда все темы на 100 %.`}
        </p>
      ) : null}

      {shown?.status === "awaiting_schedule" ? (
        <p className="mt-2 text-xs leading-5 text-stone-600">Экзамен подготовлен и ждёт, когда администратор CRM назначит урок.</p>
      ) : null}

      {shown?.status === "scheduled" ? (
        <div className="mt-3 grid gap-2">
          <p className="inline-flex items-center gap-1.5 text-sm font-bold text-ink">
            <CalendarClock size={15} /> {formatExamDate(shown.scheduledAt) || "Дата назначена"}
          </p>
          {!row.progress.ready ? (
            <p className="text-xs text-amber-900">Начать можно, когда все темы на 100 %: сейчас {row.progress.completed} из {row.progress.total}.</p>
          ) : null}
          <button
            type="button"
            className={`${control} justify-self-start bg-ink text-white`}
            disabled={!row.canStart || busy !== null}
            onClick={() => void run("start", () => sectorExamsApi.start(shown.id))}
          >
            {busy === "start" ? <LoaderCircle size={14} className="animate-spin" /> : <GraduationCap size={14} />} Начать экзамен
          </button>
        </div>
      ) : null}

      {shown?.status === "in_progress" ? (
        <InProgress exam={shown} busy={busy} run={run} />
      ) : null}

      {shown?.status === "completed" ? <PastResult exam={shown} /> : null}
      {error ? <p className="mt-2 text-xs font-bold text-red-700">{error}</p> : null}
    </section>
  );
}

function InProgress({ exam, busy, run }: {
  exam: SectorExam;
  busy: string | null;
  run: (key: string, action: () => Promise<SectorExam | void>, reload?: boolean) => Promise<void>;
}) {
  const [comment, setComment] = useState("");
  const marked = exam.items.filter((item) => item.done !== null).length;
  const allMarked = marked === exam.items.length;
  return (
    <div className="mt-3 grid min-w-0 gap-3">
      <ol className="grid min-w-0 grid-cols-1 gap-2">
        {exam.items.map((item, index) => (
          <li key={item.id} className="grid min-w-0 gap-2 rounded-xl border border-stone-200 bg-white p-3" data-testid="sector-exam-item">
            <div className="min-w-0">
              <p className="break-words text-sm font-bold text-ink">{index + 1}. {item.title}</p>
              {item.criteria ? <p className="mt-0.5 break-words text-xs text-stone-500">{item.criteria}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={item.done === true}
                disabled={busy !== null}
                onClick={() => void run(`mark-${item.id}`, () => sectorExamsApi.mark(exam.id, item.id, true))}
                className={`${control} ${item.done === true ? "bg-emerald-600 text-white" : "border border-stone-200 bg-white text-stone-700"}`}
              >
                <Check size={14} /> Сделано
              </button>
              <button
                type="button"
                aria-pressed={item.done === false}
                disabled={busy !== null}
                onClick={() => void run(`mark-${item.id}`, () => sectorExamsApi.mark(exam.id, item.id, false))}
                className={`${control} ${item.done === false ? "bg-orange-600 text-white" : "border border-stone-200 bg-white text-stone-700"}`}
              >
                <X size={14} /> Не сделано
              </button>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-xs font-semibold text-stone-600">Отмечено {marked} из {exam.items.length}</p>
      <textarea
        aria-label="Комментарий к экзамену"
        className="brand-input min-h-16"
        placeholder="Комментарий для ученика и родителя, необязательно"
        maxLength={2000}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`${control} bg-ink text-white`}
          disabled={!allMarked || busy !== null}
          onClick={() => void run("close", async () => (await sectorExamsApi.finish(exam.id, "close_sector", comment)).exam, true)}
        >
          {busy === "close" ? <LoaderCircle size={14} className="animate-spin" /> : <Award size={14} />} Завершить сектор
        </button>
        <button
          type="button"
          className={`${control} border border-stone-200 bg-white text-stone-700`}
          disabled={!allMarked || busy !== null}
          onClick={() => void run("retake", async () => (await sectorExamsApi.finish(exam.id, "retake", comment)).exam, true)}
        >
          {busy === "retake" ? <LoaderCircle size={14} className="animate-spin" /> : <RotateCcw size={14} />} Пересдача
        </button>
      </div>
      {!allMarked ? <p className="text-[11px] text-stone-500">Завершить можно, когда каждый пункт отмечен.</p> : null}
    </div>
  );
}

function PastResult({ exam }: { exam: SectorExam }) {
  const done = exam.items.filter((item) => item.done).length;
  return (
    <div className="mt-3 grid gap-2 rounded-xl border border-stone-200 bg-white p-3">
      <p className="text-xs font-bold text-ink">
        {exam.attempt > 1 ? `Пересдача ${exam.attempt - 1}` : "Экзамен"}: {exam.outcome ? sectorExamOutcomeLabel[exam.outcome] : "завершён"}, {done} из {exam.items.length}
      </p>
      <ul className="grid gap-1">
        {exam.items.map((item) => (
          <li key={item.id} className="flex min-w-0 items-start gap-1.5 text-xs text-stone-700">
            {item.done ? <Check size={13} className="mt-0.5 shrink-0 text-emerald-700" /> : <X size={13} className="mt-0.5 shrink-0 text-orange-700" />}
            <span className="min-w-0 break-words">{item.title}</span>
          </li>
        ))}
      </ul>
      {exam.certificate ? (
        <p className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800"><Award size={13} /> Сертификат {exam.certificate.number}</p>
      ) : null}
      {exam.comment ? <p className="break-words text-xs text-stone-500">{exam.comment}</p> : null}
    </div>
  );
}
