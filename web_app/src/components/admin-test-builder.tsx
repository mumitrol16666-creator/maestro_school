"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { inputClass, secondaryButton } from "./admin-ui";
import type { CmsHomeworkTestQuestion } from "@/types/homework";
import { useApiResource } from "@/hooks/use-api-resource";
import { cmsApi } from "@/lib/cms-api";
import type { CmsHomeworkTestTemplate } from "@/types/cms";

interface AdminTestBuilderProps {
  questions: CmsHomeworkTestQuestion[];
  onChange: (questions: CmsHomeworkTestQuestion[]) => void;
}

function id() {
  return crypto.randomUUID();
}

export function createEmptyTestQuestion(): CmsHomeworkTestQuestion {
  const first = id();
  return {
    id: id(),
    prompt: "",
    correctOptionId: first,
    options: [{ id: first, text: "" }, { id: id(), text: "" }],
  };
}

function newQuestion() {
  return createEmptyTestQuestion();
}

export function normalizeTestQuestions(value: unknown): CmsHomeworkTestQuestion[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === "object" && "id" in item) as CmsHomeworkTestQuestion[];
}

export function serializeTestQuestions(questions: CmsHomeworkTestQuestion[]) {
  return questions.map((question) => ({
    id: question.id,
    prompt: question.prompt.trim(),
    correctOptionId: question.correctOptionId,
    options: question.options.map((option) => ({
      id: option.id,
      text: option.text.trim(),
    })),
  }));
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
  const [templateId, setTemplateId] = useState("");
  const templates = useApiResource<CmsHomeworkTestTemplate[]>(cmsApi.homeworkTestTemplates, []);

  function applyTemplate() {
    const template = templates.data?.find((item) => item.id === templateId);
    if (!template) return;
    if (questions.length && !window.confirm("Заменить текущие вопросы готовым тестом? Их можно будет отредактировать перед сохранением.")) return;
    onChange(template.questions.map((question) => ({
      ...question,
      options: question.options.map((option) => ({ ...option })),
    })));
    setTemplateId("");
  }

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
        <div className="flex flex-wrap items-center gap-2">
          {templates.data?.length ? (
            <>
              <select
                value={templateId}
                onChange={(event) => setTemplateId(event.target.value)}
                className={`${inputClass} min-w-56 py-2 text-sm`}
                aria-label="Готовый тест"
              >
                <option value="">Подставить готовый тест…</option>
                {templates.data.map((template) => <option key={template.id} value={template.id}>{template.title}</option>)}
              </select>
              <button type="button" onClick={applyTemplate} disabled={!templateId} className={`${secondaryButton} disabled:opacity-50`}>
                Подставить
              </button>
            </>
          ) : null}
          <button type="button" onClick={() => onChange([...questions, newQuestion()])} className={secondaryButton}>
            <Plus size={14} /> Добавить вопрос
          </button>
        </div>
      </div>

      {templates.error && <p className="mt-3 text-xs text-stone-500">Готовые тесты пока недоступны — создайте вопросы вручную.</p>}

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
        <div className="mt-4 rounded-xl border border-dashed border-amber-200 bg-amber-50 p-5 text-center">
          <p className="text-sm font-bold text-amber-900">В тесте пока нет вопросов</p>
          <p className="mt-2 text-sm text-amber-800">Нажмите кнопку ниже, чтобы создать первый вопрос с вариантами ответа.</p>
          <button type="button" onClick={() => onChange([createEmptyTestQuestion()])} className={`${secondaryButton} mt-4`}>
            <Plus size={14} /> Создать первый вопрос
          </button>
        </div>
      )}
    </div>
  );
}
