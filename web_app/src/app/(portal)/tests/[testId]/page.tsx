"use client";

import { CheckCircle2, ChevronLeft, ChevronRight, RotateCcw, Send } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api-client";
import type { PreparedTestAttemptResponse } from "@/types/prepared-tests";

export default function PreparedTestPage() {
  const params = useParams<{ testId: string }>();
  const testId = params.testId;
  const resource = useApiResource(() => api.preparedTest(testId), [testId]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<PreparedTestAttemptResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (resource.loading) return <LoadingState label="Открываем тест" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data) return null;

  const test = resource.data;
  const completedResult = result ?? (test.latestAttempt?.passed ? {
    ...test.latestAttempt,
    id: "latest",
    testId: test.id,
    passingScore: test.passingScore,
    nextTest: null,
  } : null);
  const passed = completedResult?.passed ?? test.passed;
  const answered = Object.keys(answers).length;

  async function submit() {
    setSubmitError(null);
    setSubmitting(true);
    try {
      setResult(await api.submitPreparedTest(test.id, answers));
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не удалось отправить ответы");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow={`Тест ${test.order} из ${test.totalTests}`} title={test.title} description={test.description} action={<Link href="/tests" className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-paper px-4 py-2.5 text-sm font-bold"><ChevronLeft size={16} /> Все тесты</Link>} />
      {passed ? (
        <div className="mb-7 flex items-start gap-4 rounded-[28px] border border-emerald-200 bg-emerald-50 p-5 text-emerald-900 sm:p-6"><CheckCircle2 className="mt-0.5 shrink-0" size={24} /><div><p className="font-display text-2xl">Тест уже пройден</p><p className="mt-1 text-sm">Результат: {completedResult?.score ?? test.latestAttempt?.score}% · правильных ответов {completedResult?.correctAnswers ?? test.latestAttempt?.correctAnswers} из {test.questionCount}.</p></div></div>
      ) : (
        <>
          <div className="mb-6 flex items-center justify-between rounded-2xl border border-stone-200 bg-paper px-4 py-3 text-sm"><span className="text-stone-500">Ответьте на все вопросы</span><span className="font-bold">{answered} из {test.questionCount}</span></div>
          <div className="space-y-5">
            {test.questions.map((question, index) => (
              <fieldset key={question.id} className="rounded-[28px] border border-stone-200 bg-paper p-5 shadow-soft sm:p-7"><legend className="sr-only">Вопрос {index + 1}</legend><p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">Вопрос {index + 1}</p><h2 className="mt-2 font-display text-2xl leading-tight">{question.prompt}</h2><div className="mt-5 grid gap-2">{question.options.map((option) => { const selected = answers[question.id] === option.id; return <label key={option.id} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm transition ${selected ? "border-gold bg-amber-50/70 font-semibold" : "border-stone-200 hover:border-gold/50"}`}><input type="radio" name={question.id} value={option.id} checked={selected} onChange={() => setAnswers((current) => ({ ...current, [question.id]: option.id }))} className="mt-0.5 accent-[#bd9140]" /><span>{option.text}</span></label>; })}</div></fieldset>
            ))}
          </div>
          {submitError ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{submitError}</p> : null}
          <button type="button" onClick={submit} disabled={submitting || answered < test.questionCount} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-4 text-sm font-bold text-white transition hover:bg-gold hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"><Send size={17} /> {submitting ? "Проверяем ответы…" : "Завершить тест"}</button>
        </>
      )}
      {result ? <div className={`mt-6 rounded-[28px] p-5 sm:p-6 ${result.passed ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-950"}`}><p className="font-display text-2xl">{result.passed ? "Отлично, тест пройден!" : "Почти получилось"}</p><p className="mt-1 text-sm">Результат: {result.score}% · {result.correctAnswers} из {result.totalQuestions} правильных. Для прохода нужно {result.passingScore}%.</p>{result.passed ? <Link href={result.nextTest ? `/tests/${result.nextTest.id}` : "/tests"} className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-bold text-white">{result.nextTest ? "Следующий тест" : "Вернуться к тестам"} <ChevronRight size={15} /></Link> : <button type="button" onClick={() => { setResult(null); setAnswers({}); }} className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-bold text-white"><RotateCcw size={15} /> Попробовать ещё раз</button>}</div> : null}
    </>
  );
}
