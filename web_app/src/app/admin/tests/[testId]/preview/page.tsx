"use client";

import { ArrowLeft, ArrowRight, Check, ChevronLeft, Eye, Flame } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api-client";

export default function AdminTestPreviewPage() {
  const { testId } = useParams<{ testId: string }>();
  const resource = useApiResource(() => api.preparedTestAdminPreview(testId), [testId]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  if (resource.loading) return <LoadingState label="Открываем предпросмотр" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data) return null;

  const test = resource.data;
  const question = test.questions[currentQuestion];
  const selectedOptionId = answers[question.id];
  const progress = Math.round(((currentQuestion + 1) / test.questions.length) * 100);

  return (
    <>
      <PageHeader
        eyebrow={`Предпросмотр · тест ${test.order} из ${test.totalTests}`}
        title={test.title}
        description={test.description}
        action={
          <Link
            href="/admin/tests"
            className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-paper px-4 py-2.5 text-sm font-bold"
          >
            <ChevronLeft size={16} /> К статистике
          </Link>
        }
      />

      <div className="mb-5 flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <Eye size={18} className="shrink-0" />
        <p><strong>Режим администратора.</strong> Ответы здесь не сохраняются и не попадают в статистику.</p>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-stone-200 bg-paper p-4">
          <p className="text-xs text-stone-500">Проходной результат</p>
          <p className="mt-1 font-display text-2xl">{test.passingScore}%</p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-paper p-4">
          <p className="text-xs text-stone-500">Попыток ученику</p>
          <p className="mt-1 font-display text-2xl">{test.maxAttempts ?? "Без лимита"}</p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-paper p-4">
          <p className="text-xs text-stone-500">Недельный XP за успех</p>
          <p className="mt-1 flex items-center gap-2 font-display text-2xl">
            <Flame size={18} className="text-gold" /> +{test.xpRules.firstAttempt} / +{test.xpRules.retry}
          </p>
        </div>
      </div>

      <div className="mb-5 rounded-[24px] border border-stone-200 bg-paper p-4 shadow-soft sm:p-5">
        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.12em] text-stone-500">
          <span>Вопрос {currentQuestion + 1} из {test.questions.length}</span>
          <span>{progress}%</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100">
          <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <fieldset className="rounded-[30px] border border-stone-200 bg-paper p-5 shadow-soft sm:p-8">
        <legend className="sr-only">Вопрос {currentQuestion + 1}</legend>
        <p className="text-xs font-black uppercase tracking-[0.16em] text-gold">Так это увидит ученик</p>
        <h2 className="mt-3 font-display text-2xl leading-tight sm:text-3xl">{question.prompt}</h2>
        <div className="mt-6 grid gap-3">
          {question.options.map((option, index) => {
            const selected = selectedOptionId === option.id;
            const correct = question.correctOptionId === option.id;
            return (
              <button
                type="button"
                key={option.id}
                onClick={() => setAnswers((current) => ({ ...current, [question.id]: option.id }))}
                className={`flex items-start gap-3 rounded-2xl border p-4 text-left text-sm transition sm:p-5 ${
                  selected ? "border-gold bg-amber-50 font-semibold" : "border-stone-200 hover:border-gold/50"
                }`}
              >
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-black ${
                  selected ? "border-gold bg-gold text-ink" : "border-stone-300 text-stone-400"
                }`}>
                  {selected ? <Check size={15} /> : String.fromCharCode(65 + index)}
                </span>
                <span className="min-w-0 flex-1 pt-1">{option.text}</span>
                {correct ? (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                    Верный
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setCurrentQuestion((value) => Math.max(0, value - 1))}
          disabled={currentQuestion === 0}
          className="inline-flex items-center gap-2 rounded-2xl border border-stone-200 bg-paper px-4 py-3 text-sm font-bold disabled:opacity-40"
        >
          <ArrowLeft size={17} /> Назад
        </button>
        <button
          type="button"
          onClick={() => setCurrentQuestion((value) => Math.min(test.questions.length - 1, value + 1))}
          disabled={currentQuestion === test.questions.length - 1}
          className="inline-flex items-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-bold text-white disabled:opacity-40"
        >
          Дальше <ArrowRight size={17} />
        </button>
      </div>
    </>
  );
}
