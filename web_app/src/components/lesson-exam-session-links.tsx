"use client";
import Link from "next/link";
import { apiRequest } from "@/lib/api-client";
import { useApiResource } from "@/hooks/use-api-resource";
export function LessonExamSessionLinks({ crmClassId }: { crmClassId: string }) {
  const resource = useApiResource(() => apiRequest<Array<{ id: string; title: string }>>(`/teachers/me/offline-classes/${encodeURIComponent(crmClassId)}/exam-sessions`), [crmClassId]);
  if (resource.loading) return <p className="mt-2 text-sm">Загружаем экзамен…</p>;
  if (!resource.data?.length) return <p className="mt-2 text-sm">{resource.error ?? "Экзамен не найден для назначенного преподавателя. Обратитесь к администратору."}</p>;
  return <div className="mt-3 flex flex-wrap gap-2">{resource.data.map(session => <Link key={session.id} className="inline-flex min-h-11 items-center rounded-xl bg-ink px-4 py-2 font-bold text-white" href={`/admin/exam-sessions/${session.id}`}>Открыть экзамен «{session.title}» · все участники</Link>)}</div>;
}
