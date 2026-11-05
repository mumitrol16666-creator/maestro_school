"use client";
import Link from "next/link";
import { useApiResource } from "@/hooks/use-api-resource";
import { sectorExamsApi, sectorExamStatusLabel } from "@/lib/sector-exams-api";

/** A pupil card links to the same exam; assessment exists only in the common workspace. */
export function SectorExamPanel({crmStudentId}:{crmStudentId:string;onChanged?:()=>void}) {
  const resource=useApiResource(()=>sectorExamsApi.forStudent(crmStudentId),[crmStudentId]);
  if(!resource.data?.length)return null;
  return <section className="grid gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4" data-testid="sector-exam-panel">
    <h2 className="text-base font-bold">Экзамены ученика</h2>
    {resource.data.map(row=><div key={row.planId} className="grid gap-2 text-sm">
      <p>{row.direction.title} · сектор {row.sequence}</p>
      {row.exam ? <><p>{sectorExamStatusLabel[row.exam.status]}</p><Link href={`/exams/${row.exam.id}`} className="inline-flex min-h-11 items-center font-bold underline">Открыть экзамен и результат ученика</Link></> : <p>{row.progress.ready?"Готовность подтверждена. Администратор добавит ученика в экзамен и назначит дату.":"Готовность к экзамену отмечается в отчёте урока."}</p>}
    </div>)}
  </section>;
}
