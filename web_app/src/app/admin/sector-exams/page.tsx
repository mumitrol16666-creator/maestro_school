"use client";
import Link from "next/link";
import { useState } from "react";
import { ExamPrograms } from "@/components/exam-programs";
import { PageHeader } from "@/components/page-header";
import { ErrorState, LoadingState } from "@/components/data-states";
import { useApiResource } from "@/hooks/use-api-resource";
import { sectorExamsApi, sectorExamStatusLabel } from "@/lib/sector-exams-api";

export default function SectorExamsPage(){
  const board=useApiResource(()=>sectorExamsApi.board(),[]);
  const [filter,setFilter]=useState("ready");
  const sectors=board.data?.sectors??[];
  const filters=[{key:"ready",label:"Готовы к экзамену"},{key:"waiting",label:"Ждут назначения"},{key:"scheduled",label:"Назначены"},{key:"all",label:"Все секторы"}];
  function matches(row:(typeof sectors)[number],key:string){
    if(key==="all")return true;
    if(key==="waiting")return row.exam?.status==="draft"||row.exam?.status==="awaiting_schedule";
    if(key==="scheduled")return row.exam?.status==="scheduled"||row.exam?.status==="in_progress";
    return row.progress.ready&&(!row.exam||row.exam.status==="completed"||row.exam.status==="cancelled");
  }
  return <div className="grid min-w-0 gap-5">
    <PageHeader eyebrow="Учебный контроль" title="Экзамены" description="Единый порядок для индивидуальных занятий, квартетов и пересдач: свои задания → участники → дата и преподаватель → результаты." />
    {board.loading&&!board.data?<LoadingState label="Загружаем экзамены"/>:null}
    {board.error?<ErrorState message={board.error} retry={board.reload}/>:null}
    {board.data?<>
      <ExamPrograms sectors={sectors} onChanged={()=>void board.reload()}/>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Ученики и экзамены">{filters.map(item=><button key={item.key} role="tab" aria-selected={filter===item.key} onClick={()=>setFilter(item.key)} className={`min-h-11 rounded-xl px-4 py-2 text-sm font-bold ${filter===item.key?"bg-ink text-white":"border border-stone-200 bg-white"}`}>{item.label} · {sectors.filter(row=>matches(row,item.key)).length}</button>)}</div>
      <div className="grid gap-3">{sectors.filter(row=>matches(row,filter)).map(row=><section key={row.planId} className="grid gap-2 rounded-2xl border border-stone-200 bg-white p-4" data-testid="exam-pupil-row">
        <h2 className="text-base font-bold">{row.studentName}</h2><p className="text-sm text-stone-600">{row.direction.title} · сектор {row.curriculumNumber??row.sequence}</p>
        <p className="text-sm">{row.exam?.status==="completed"&&row.exam.decision==="retake"?"Нужна пересдача":row.progress.ready?"Готовность подтверждена":"Готовность не отмечена"}{row.exam?` · ${sectorExamStatusLabel[row.exam.status]}`:""}</p>
        {row.exam&&row.exam.status!=="cancelled"?<Link href={`/admin/exam-sessions/${row.exam.sessionId}`} className="inline-flex min-h-11 items-center text-sm font-bold underline">Открыть экзамен и результаты</Link>:<a href="#exam-session-composer" className="inline-flex min-h-11 items-center text-sm font-bold underline">Выбрать в состав экзамена выше</a>}
      </section>)}</div>
      {!sectors.some(row=>matches(row,filter))?<p className="text-sm text-stone-600">В этом списке пока нет учеников.</p>:null}
    </>:null}
  </div>;
}
