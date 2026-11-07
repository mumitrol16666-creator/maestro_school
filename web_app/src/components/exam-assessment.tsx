"use client";
import { Award, Check, LoaderCircle, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { sectorExamResultLabel, sectorExamsApi } from "@/lib/sector-exams-api";
import type { SectorExam } from "@/types/sector-exam";
const control="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-bold disabled:opacity-50";

/** The checklist being marked. The buttons below it are the decisions this exam allows. */
export function InProgress({ exam, busy, run }: {
  exam: SectorExam;
  busy: string | null;
  run: (key: string, action: () => Promise<SectorExam | void>, reload?: boolean) => Promise<void>;
}) {
  const decisions = [{decision:"pass",label:"Сдал экзамен",primary:true},{decision:"retake",label:"Пересдача",primary:false}] as const;
  const [comment, setComment] = useState("");
  const marked = exam.items.filter((item) => item.done !== null).length;
  const allMarked = marked === exam.items.length;
  const doneCount = exam.items.filter((item) => item.done === true).length;
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
        {decisions.map((button) => (
          <button
            key={button.decision}
            type="button"
            className={`${control} ${button.primary ? "bg-ink text-white" : "border border-stone-200 bg-white text-stone-700"}`}
            disabled={!allMarked || busy !== null}
            onClick={() => void run(button.decision, async () => (await sectorExamsApi.finish(exam.id, button.decision, comment)).exam, true)}
          >
            {busy === button.decision
              ? <LoaderCircle size={14} className="animate-spin" />
              : button.decision === "retake" ? <RotateCcw size={14} /> : <Award size={14} />}
            {" "}{button.label}
          </button>
        ))}
      </div>
      {!allMarked ? <p className="text-[11px] text-stone-500">Завершить можно, когда каждый пункт отмечен.</p> : null}
      {allMarked ? <p className="text-sm text-stone-600">Сделано {doneCount} из {exam.items.length}. Сдан экзамен или нет, решаете вы: «Сдал экзамен» закрывает сектор и выдаёт сертификат, «Пересдача» ничего не начисляет.</p> : null}
    </div>
  );
}

export function PastResult({ exam }: { exam: SectorExam }) {
  const done = exam.items.filter((item) => item.done).length;
  return (
    <div className="mt-3 grid gap-2 rounded-xl border border-stone-200 bg-white p-3">
      <p className="text-xs font-bold text-ink">
        {exam.attempt > 1 ? `Пересдача ${exam.attempt - 1}` : "Экзамен"}: {sectorExamResultLabel(exam) ?? "завершён"}, {done} из {exam.items.length}
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
        <p className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800"><Award size={13} /> Сертификат {exam.certificate.number} <a className="min-h-11 inline-flex items-center underline" href={`/certificates/${encodeURIComponent(exam.id)}`}>Открыть и распечатать</a></p>
      ) : null}
      {exam.comment ? <p className="break-words text-xs text-stone-500">{exam.comment}</p> : null}
    </div>
  );
}
