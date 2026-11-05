"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth-provider";
import { useApiResource } from "@/hooks/use-api-resource";
import { apiRequest } from "@/lib/api-client";
import { formatExamDate, sectorExamStatusLabel } from "@/lib/sector-exams-api";
import { PastResult } from "@/components/sector-exam-panel";
import type { SectorExam } from "@/types/sector-exam";
export default function PersonalExamPage() {
  const { examId } = useParams<{ examId: string }>(); const { user, loading } = useAuth(); const router = useRouter();
  useEffect(() => { if (!loading && !user) router.replace("/login"); }, [loading, user, router]);
  const resource = useApiResource(() => apiRequest<{ studentName: string | null; exam: SectorExam }>(`/personal-exams/${examId}`), [examId]);
  const exam = resource.data?.exam;
  return <main className="mx-auto grid min-h-screen max-w-3xl content-start gap-5 bg-paper px-4 py-8 text-ink">
    <Link className="inline-flex min-h-11 items-center text-sm font-bold underline" href={user?.role === "parent" ? "/family" : "/"}>В кабинет</Link>
    <h1 className="font-display text-3xl">{exam?.sessionTitle || exam?.programTitle || "Ваш экзамен"}</h1>
    {resource.error ? <p role="alert" className="text-sm text-red-700">{resource.error}</p> : null}
    {!exam && !resource.error ? <p>Загружаем экзамен…</p> : null}
    {exam ? <>
      <section className="rounded-2xl border border-stone-200 bg-white p-5"><p className="font-bold">{resource.data?.studentName}</p><p className="mt-2 text-sm">{exam.direction.title} · {sectorExamStatusLabel[exam.status]}</p><p className="mt-2 text-lg font-bold">{formatExamDate(exam.scheduledAt)}</p><p className="mt-3 text-sm text-stone-600">Экзамен проходит в школе. Это бесплатное дополнительное занятие.</p></section>
      <section className="rounded-2xl border border-stone-200 bg-white p-5"><h2 className="text-lg font-bold">Что будет на экзамене</h2><ol className="mt-4 grid list-inside list-decimal gap-4">{exam.items.map(item => <li key={item.id} className="text-sm font-bold">{item.title}{item.criteria ? <p className="mt-1 font-normal text-stone-600">{item.criteria}</p> : null}</li>)}</ol></section>
      {exam.status === "completed" ? <PastResult exam={exam} /> : null}
    </> : null}
  </main>;
}
