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

export function AdminTestBuilder({ questions, onChange }: AdminTestBuilderProps) {
  function updateQuestion(index: number, value: CmsHomeworkTestQuestion) {
    onChange(questions.map((question, questionIndex) => questionIndex === index ? value : question));
  }

  return (
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
          <div className="mt-3 space-y-2">
            {question.options.map((option, optionIndex) => (
              <div key={option.id} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`correct-${question.id}`}
                  checked={question.correctOptionId === option.id}
                  onChange={() => updateQuestion(questionIndex, { ...question, correctOptionId: option.id })}
                  title="Правильный ответ"
                />
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
      <button type="button" onClick={() => onChange([...questions, newQuestion()])} className={secondaryButton}>
        <Plus size={14} /> Добавить вопрос
      </button>
    </div>
  );
}
