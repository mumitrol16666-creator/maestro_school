"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { CalendarClock, GraduationCap, LoaderCircle, Printer } from "lucide-react";
import { apiRequest, ApiError } from "@/lib/api-client";
import { useApiResource } from "@/hooks/use-api-resource";
import { ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { InProgress, PastResult } from "@/components/exam-assessment";
import { sectorExamsApi, formatExamDate, sectorExamStatusLabel, sectorExamResultLabel } from "@/lib/sector-exams-api";
import type { ExamSessionWorkspace, SectorExam } from "@/types/sector-exam";

const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-bold text-white disabled:opacity-50";
export default function ExamSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const resource = useApiResource(() => apiRequest<ExamSessionWorkspace>(`/exam-sessions/${sessionId}`), [sessionId]);
  const data = resource.data;
  return <div className="grid min-w-0 gap-5">
    <div className="print:hidden"><PageHeader eyebrow="Экзамен" title={data?.title ?? "Проведение экзамена"} description="Все участники и результаты в одном месте. Принимающий преподаватель отмечает задания, сохранённые для этого экзамена." />
      <div className="mt-3 flex flex-wrap gap-3"><Link className="inline-flex min-h-11 items-center text-sm font-bold underline" href="/admin/sector-exams">К списку экзаменов</Link><button type="button" className={button} onClick={() => window.print()} disabled={!data}><Printer size={16} /> Распечатать протокол</button></div></div>
    {resource.loading && !data ? <LoadingState label="Загружаем экзамен" /> : null}
    {resource.error ? <ErrorState message={resource.error} retry={resource.reload} /> : null}
    {data ? <>
      <div className="rounded-2xl border border-stone-200 bg-white p-5 print:hidden"><p className="font-bold">{data.participants.length} участников · {data.program.items.length} заданий на каждого</p>
        <ol className="mt-3 grid list-inside list-decimal gap-2 text-sm text-stone-700">{data.program.items.map((item, i) => <li key={i}>{item.title}{item.criteria ? ` — ${item.criteria}` : ""}</li>)}</ol>
        <p className="mt-3 text-sm text-stone-600">Материалы сектора помогают подготовиться. Здесь оцениваются именно задания этого экзамена.</p></div>
      <div className="grid min-w-0 gap-4 print:hidden">{data.participants.map(person => <Participant key={person.exam.id} participant={person} onChanged={() => void resource.reload()} />)}</div>
      <article className="hidden print:block" data-exam-protocol>
        <h1 className="text-2xl font-bold">Maestro · {data.title}</h1><p className="mt-2">Протокол экзамена · {data.participants.length} участников</p>
        {data.participants.map(person => <section key={person.exam.id} className="mt-6 break-inside-avoid border-t border-stone-400 pt-3"><h2 className="text-lg font-bold">{person.studentName}</h2><p>{formatExamDate(person.exam.scheduledAt)} · {sectorExamStatusLabel[person.exam.status]}{sectorExamResultLabel(person.exam) ? ` · ${sectorExamResultLabel(person.exam)}` : ""}</p>
          <ol className="mt-2 list-inside list-decimal">{person.exam.items.map(item => <li key={item.id}>{item.done === null ? "□" : item.done ? "✓" : "×"} {item.title}{item.criteria ? ` — ${item.criteria}` : ""}</li>)}</ol>
          {person.exam.comment ? <p className="mt-2">Комментарий: {person.exam.comment}</p> : null}{person.exam.certificate ? <p>Сертификат: {person.exam.certificate.number}</p> : null}</section>)}
      </article>
    </> : null}
    <style jsx global>{`@media print { body * { visibility:hidden; } [data-exam-protocol], [data-exam-protocol] * { visibility:visible; } [data-exam-protocol] { position:absolute;left:0;top:0;width:100%;color:#111;background:#fff;padding:12mm; } } @page { size:A4 portrait;margin:12mm; }`}</style>
  </div>;
}

function Participant({ participant, onChanged }: { participant: ExamSessionWorkspace["participants"][number]; onChanged: () => void }) {
  const [current, setCurrent] = useState<SectorExam | null>(null);
  const [busy, setBusy] = useState<string | null>(null); const [error, setError] = useState<string | null>(null);
  const exam = current && current.id === participant.exam.id && participant.exam.status === current.status ? current : participant.exam;
  async function run(key: string, action: () => Promise<SectorExam | void>, reload = false) {
    setBusy(key); setError(null);
    try { const result = await action(); if (result) setCurrent(result); if (reload || key === "start") onChanged(); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : "Не удалось сохранить результат"); }
    finally { setBusy(null); }
  }
  return <section className="min-w-0 rounded-2xl border border-stone-200 bg-white p-5" data-testid="exam-session-participant">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">{participant.studentName}</h2><span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold">{sectorExamStatusLabel[exam.status]}</span></div>
    {exam.scheduledAt ? <p className="mt-2 inline-flex items-center gap-2 text-sm"><CalendarClock size={16} />{formatExamDate(exam.scheduledAt)}</p> : <p className="mt-2 text-sm text-stone-600">Дата пока не назначена.</p>}
    {exam.status === "scheduled" && participant.canConduct ? <div className="mt-3 grid gap-2"><button type="button" className={`${button} justify-self-start`} disabled={!participant.canStart || busy !== null} onClick={() => void run("start", () => sectorExamsApi.start(exam.id))}>{busy === "start" ? <LoaderCircle size={16} className="animate-spin" /> : <GraduationCap size={16} />} Начать экзамен ученика</button>{!participant.canStart ? <p className="text-sm text-amber-900">Преподаватель ещё не подтвердил готовность ученика.</p> : null}</div> : null}
    {exam.status === "in_progress" && participant.canConduct ? <InProgress exam={exam} busy={busy} run={run} /> : null}
    {exam.status === "completed" ? <PastResult exam={exam} /> : null}
    {!participant.canConduct && exam.status !== "completed" ? <div className="mt-3"><p className="text-sm text-stone-600">Результаты отмечает назначенный принимающий преподаватель из своего кабинета.</p><ol className="mt-2 grid list-inside list-decimal gap-1 text-sm text-stone-700">{exam.items.map(item => <li key={item.id}>{item.title}{item.done !== null ? ` · ${item.done ? "Сделано" : "Не сделано"}` : ""}</li>)}</ol></div> : null}
    {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
  </section>;
}
