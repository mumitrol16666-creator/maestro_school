"use client";
import Link from "next/link";
import { useState } from "react";
import { ApiError } from "@/lib/api-client";
import { useApiResource } from "@/hooks/use-api-resource";
import { sectorExamsApi, sectorExamStatusLabel } from "@/lib/sector-exams-api";

/** A pupil card links to the same exam; assessment exists only in the common workspace. */
export function SectorExamPanel({crmStudentId,onChanged}:{crmStudentId:string;onChanged?:()=>void}) {
  const resource=useApiResource(()=>sectorExamsApi.forStudent(crmStudentId),[crmStudentId]);
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);
  async function markReady(planId:string) {
    if(busy)return;
    setBusy(planId);setError(null);
    try {await sectorExamsApi.markReady(crmStudentId,planId);await resource.reload();onChanged?.();}
    catch(error){setError(error instanceof ApiError?error.message:"Не получилось отметить готовность. Попробуйте ещё раз.");}
    finally{setBusy(null);}
  }
  if(!resource.data?.length)return null;
  return <section className="grid gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4" data-testid="sector-exam-panel">
    <h2 className="text-base font-bold">Экзамены ученика</h2>
    {resource.data.map(row=><div key={row.planId} className="grid gap-2 text-sm">
      <p>{row.direction.title} · сектор {row.sequence}</p>
      {row.exam ? <><p>{sectorExamStatusLabel[row.exam.status]}</p><Link href={`/exams/${row.exam.id}`} className="inline-flex min-h-11 items-center font-bold underline">Открыть экзамен и результат ученика</Link></> : <p>{row.progress.ready?"Готовность подтверждена. Администратор добавит ученика в экзамен и назначит дату.":"Готовность к экзамену пока не отмечена."}</p>}
      {row.canMarkReady && !row.progress.ready ? <div><button type="button" disabled={busy!==null} onClick={()=>void markReady(row.planId)} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-sky-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy===row.planId?"Сохраняем…":"Отметить готовность к экзамену"}</button><p className="mt-2 text-xs text-sky-900">Ученик появится в списке готовых к экзамену. Дату назначит администратор.</p></div> : null}
    </div>)}
    {error?<p role="alert" className="text-sm font-semibold text-red-700">{error}</p>:null}
  </section>;
}
