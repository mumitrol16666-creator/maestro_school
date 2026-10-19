import { Award, CalendarClock, Check, GraduationCap, X } from "lucide-react";
import { formatExamDate, sectorExamOutcomeLabel } from "@/lib/sector-exams-api";
import type { PublicSectorExam } from "@/types/sector-exam";

/** Plan 1.10: what a student or parent sees of the sector exam held at the school. */
export function SectorExamSummary({ exam }: { exam: PublicSectorExam | null | undefined }) {
  if (!exam) return null;
  const retake = exam.attempt > 1 ? `Пересдача ${exam.attempt - 1}` : "Экзамен сектора";
  return (
    <div className="mt-5 grid min-w-0 gap-2 rounded-lg bg-sky-50 px-4 py-3" data-testid="sector-exam-summary">
      <p className="inline-flex items-center gap-2 text-sm font-bold text-sky-950">
        <GraduationCap size={16} className="shrink-0" /> {retake}
      </p>
      {exam.status === "awaiting_schedule" ? (
        <p className="text-sm text-stone-700">Экзамен готовится. Школа назначит дату и пришлёт уведомление.</p>
      ) : null}
      {exam.status === "scheduled" ? (
        <p className="inline-flex flex-wrap items-center gap-1.5 text-sm font-semibold text-stone-800">
          <CalendarClock size={15} className="shrink-0" /> В школе {formatExamDate(exam.scheduledAt)}
        </p>
      ) : null}
      {exam.status === "in_progress" ? <p className="text-sm text-stone-700">Экзамен идёт.</p> : null}
      {exam.status !== "completed" && exam.items.length ? (
        <div>
          <p className="text-xs font-semibold text-stone-500">Что проверит преподаватель:</p>
          <ul className="mt-1 grid gap-1">
            {exam.items.map((item) => (
              <li key={item.id} className="min-w-0 break-words text-sm text-stone-700">· {item.title}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {exam.status === "completed" ? (
        <>
          <p className="text-sm font-semibold text-stone-800">
            {exam.outcome ? sectorExamOutcomeLabel[exam.outcome] : "Экзамен проведён"}: {exam.items.filter((item) => item.done).length} из {exam.items.length}
          </p>
          <ul className="grid gap-1">
            {exam.items.map((item) => (
              <li key={item.id} className="flex min-w-0 items-start gap-1.5 text-sm text-stone-700">
                {item.done
                  ? <Check size={14} className="mt-0.5 shrink-0 text-emerald-700" aria-label="Сделано" />
                  : <X size={14} className="mt-0.5 shrink-0 text-orange-700" aria-label="Не сделано" />}
                <span className="min-w-0 break-words">{item.title}</span>
              </li>
            ))}
          </ul>
          {exam.certificate ? (
            <p className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-800">
              <Award size={15} /> Сертификат {exam.certificate.number}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
