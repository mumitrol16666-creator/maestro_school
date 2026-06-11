"use client";

import { Plus, Trash2 } from "lucide-react";
import { inputClass, secondaryButton } from "./admin-ui";
import type { CmsHomeworkTestQuestion } from "@/types/homework";

interface AdminTestBuilderProps {
  questions: CmsHomeworkTestQuestion[];
  onChange: (questions: CmsHomeworkTestQuestion[]) => void;
}

function id() {
  return crypto.randomUUID();
}

function newQuestion(): CmsHomeworkTestQuestion {
  const first = id();
  return {
    id: id(),
    prompt: "",
    correctOptionId: first,
    options: [{ id: first, text: "" }, { id: id(), text: "" }],
  };
}

export function isTestBuilderValid(questions: CmsHomeworkTestQuestion[]) {
  if (!questions.length) return false;
  return questions.every((question) => {
    if (!question.prompt.trim()) return false;
    if (question.options.length < 2) return false;
    if (!question.options.every((option) => option.text.trim())) return false;
    return question.options.some((option) => option.id === question.correctOptionId);
  });
}

export function AdminTestBuilder({ questions, onChange }: AdminTestBuilderProps) {
  function updateQuestion(index: number, value: CmsHomeworkTestQuestion) {
    onChange(questions.map((question, questionIndex) => questionIndex === index ? value : question));
  }

  return (
    <div className="mt-5 rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-gold">Вопросы теста</p>
          <p className="mt-1 text-sm text-stone-500">
            Отметьте правильный ответ для каждого вопроса. Ученик увидит результат сразу после сдачи.
          </p>
        </div>
        <button type="button" onClick={() => onChange([...questions, newQuestion()])} className={secondaryButton}>
          <Plus size={14} /> Добавить вопрос
        </button>
      </div>

      <div className="mt-5 space-y-4">
        {questions.map((question, questionIndex) => (
          <section key={question.id} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-wider text-stone-500">Вопрос {questionIndex + 1}</p>
              <button type="button" onClick={() => onChange(questions.filter((item) => item.id !== question.id))} className={secondaryButton}>
                <Trash2 size={14} /> Удалить
              </button>
            </div>
            <input
              required
              value={question.prompt}
              onChange={(event) => updateQuestion(questionIndex, { ...question, prompt: event.target.value })}
              className={`${inputClass} mt-3`}
              placeholder="Текст вопроса"
            />
            <p className="mt-4 text-xs font-bold uppercase tracking-wider text-stone-400">Варианты ответа</p>
            <div className="mt-2 space-y-2">
              {question.options.map((option, optionIndex) => (
                <div key={option.id} className="flex items-center gap-2">
                  <label className="flex shrink-0 items-center gap-2 text-xs font-bold text-stone-500">
                    <input
                      type="radio"
                      name={`correct-${question.id}`}
                      checked={question.correctOptionId === option.id}
                      onChange={() => updateQuestion(questionIndex, { ...question, correctOptionId: option.id })}
                    />
                    Верно
                  </label>
                  <input
                    required
                    value={option.text}
                    onChange={(event) => updateQuestion(questionIndex, {
                      ...question,
                      options: question.options.map((item, index) => index === optionIndex ? { ...item, text: event.target.value } : item),
                    })}
                    className={inputClass}
                    placeholder={`Вариант ${optionIndex + 1}`}
                  />
                  {question.options.length > 2 && (
                    <button
                      type="button"
                      aria-label="Удалить вариант"
                      onClick={() => {
                        const options = question.options.filter((item) => item.id !== option.id);
                        updateQuestion(questionIndex, {
                          ...question,
                          options,
                          correctOptionId: question.correctOptionId === option.id ? options[0].id : question.correctOptionId,
                        });
                      }}
                      className={secondaryButton}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => updateQuestion(questionIndex, { ...question, options: [...question.options, { id: id(), text: "" }] })}
              className={`${secondaryButton} mt-3`}
            >
              <Plus size={14} /> Вариант ответа
            </button>
          </section>
        ))}
      </div>

      {!questions.length && (
        <p className="mt-4 rounded-xl border border-dashed border-stone-200 bg-stone-50 p-4 text-sm text-stone-500">
          Добавьте хотя бы один вопрос с двумя вариантами ответа.
        </p>
      )}
    </div>
  );
}
