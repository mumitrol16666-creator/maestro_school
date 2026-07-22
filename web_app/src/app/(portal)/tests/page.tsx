"use client";

import { CheckCircle2, ChevronRight, ClipboardCheck, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api-client";

export default function TestsPage() {
  const resource = useApiResource(() => api.preparedTests(), []);

  if (resource.loading) return <LoadingState label="Загружаем тесты" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data?.tests.length) {
    return <EmptyState title="Тестов пока нет" description="Подготовленные тесты появятся здесь, когда школа откроет их для учеников." />;
  }

  const { tests, completedCount, total } = resource.data;
  const next = tests.find((test) => test.available);

  return (
    <>
      <PageHeader
        eyebrow="Теория Maestro"
        title="Тесты"
        description="Проходите тесты по порядку. Следующий откроется после успешного результата предыдущего."
        action={
          <div className="rounded-2xl border border-stone-200 bg-paper px-4 py-3 text-sm shadow-soft">
            <span className="font-display text-2xl">{completedCount}</span>
            <span className="ml-2 text-stone-500">из {total} пройдено</span>
          </div>
        }
      />

      {next ? (
        <Link href={`/tests/${next.id}`} className="mb-7 flex items-center gap-4 rounded-[28px] bg-ink p-5 text-white shadow-soft transition hover:-translate-y-0.5 sm:p-6">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gold text-ink"><ClipboardCheck size={22} /></span>
          <span className="min-w-0 flex-1"><span className="block text-xs font-bold uppercase tracking-[0.16em] text-gold">Следующий шаг</span><span className="mt-1 block truncate font-display text-2xl">{next.title}</span><span className="mt-1 block text-sm text-white/60">{next.questionCount} вопросов · проходной балл {next.passingScore}%</span></span>
          <ChevronRight className="shrink-0 text-gold" />
        </Link>
      ) : completedCount === total ? (
        <div className="mb-7 flex items-center gap-4 rounded-[28px] border border-emerald-200 bg-emerald-50 p-5 text-emerald-900"><CheckCircle2 size={24} /><p className="font-semibold">Все тесты пройдены. Отличная работа!</p></div>
      ) : null}

      <div className="space-y-3">
        {tests.map((test) => (
          <div key={test.id} className={`flex items-center gap-4 rounded-[26px] border p-4 sm:p-5 ${test.passed ? "border-emerald-200 bg-emerald-50/60" : test.available ? "border-gold/40 bg-paper shadow-soft" : "border-stone-200 bg-stone-50/70"}`}>
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-sm font-black ${test.passed ? "bg-emerald-100 text-emerald-700" : test.available ? "bg-amber-50 text-gold" : "bg-stone-200 text-stone-400"}`}>
              {test.passed ? <CheckCircle2 size={20} /> : test.locked ? <LockKeyhole size={18} /> : test.order}
            </span>
            <span className="min-w-0 flex-1"><span className="block font-display text-xl sm:text-2xl">{test.title}</span><span className="mt-1 block text-sm text-stone-500">{test.description}</span><span className="mt-2 block text-xs font-bold uppercase tracking-[0.12em] text-stone-400">{test.questionCount} вопросов{test.attempts ? ` · попыток ${test.attempts}` : ""}{test.passed && test.score != null ? ` · результат ${test.score}%` : ""}</span></span>
            {test.available ? <Link href={`/tests/${test.id}`} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ink px-4 py-2.5 text-sm font-bold text-white transition hover:bg-gold hover:text-ink">Начать <ChevronRight size={15} /></Link> : test.passed ? <span className="hidden shrink-0 items-center gap-1 text-sm font-bold text-emerald-700 sm:flex"><CheckCircle2 size={16} /> Пройден</span> : <span className="hidden shrink-0 items-center gap-1 text-sm font-bold text-stone-400 sm:flex"><LockKeyhole size={15} /> Закрыт</span>}
          </div>
        ))}
      </div>
    </>
  );
}
