"use client";

import { CheckCircle2, LoaderCircle, Send } from "lucide-react";
import { FormEvent, useState } from "react";
import type { HomeworkTestQuestion } from "@/types/homework";
import { MarkdownContent } from "./markdown-content";

interface HomeworkTestFormProps {
  description: string;
  questions: HomeworkTestQuestion[];
  passingScore: number;
  submitting: boolean;
  onSubmit: (answers: Record<string, string>) => Promise<void>;
}

export function HomeworkTestForm({
  description,
  questions,
  passingScore,
  submitting,
  onSubmit,
}: HomeworkTestFormProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const answeredCount = Object.keys(answers).length;
  const complete = answeredCount === questions.length;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!complete) return;
    await onSubmit(answers);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-9 rounded-[30px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">Тест к уроку</p>
      <h2 className="font-display mt-3 text-3xl">Проверьте знания</h2>
      <MarkdownContent className="mt-4">{description}</MarkdownContent>
      <p className="mt-4 text-sm font-semibold text-stone-500">
        Для прохождения нужно набрать не менее {passingScore}%. Ответы дойдут до преподавателя вместе с результатом.
      </p>

      <div className="mt-7 space-y-5">
        {questions.map((question, questionIndex) => (
          <fieldset key={question.id} className="rounded-2xl border border-stone-200 bg-stone-50 p-5">
            <legend className="px-2 text-sm font-bold text-stone-800">
              {questionIndex + 1}. {question.prompt}
            </legend>
            <div className="mt-3 grid gap-2">
              {question.options.map((option) => {
                const selected = answers[question.id] === option.id;
                return (
                  <label
                    key={option.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm font-semibold ${
                      selected ? "border-ink bg-ink text-white" : "border-stone-200 bg-white text-stone-700"
                    }`}
                  >
                    <input
                      type="radio"
                      name={question.id}
                      value={option.id}
                      checked={selected}
                      disabled={submitting}
                      onChange={() => setAnswers((current) => ({ ...current, [question.id]: option.id }))}
                      className="sr-only"
                    />
                    <span className={`grid h-5 w-5 place-items-center rounded-full border ${selected ? "border-white" : "border-stone-300"}`}>
                      {selected && <CheckCircle2 size={14} />}
                    </span>
                    {option.text}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <button
        disabled={!complete || submitting}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-4 text-sm font-bold text-white disabled:opacity-50"
      >
        {submitting ? <LoaderCircle className="animate-spin" size={16} /> : <Send size={16} />}
        {complete ? "Сдать тест" : `Ответьте на все вопросы (${answeredCount}/${questions.length})`}
      </button>
    </form>
  );
}
