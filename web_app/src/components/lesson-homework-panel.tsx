"use client";

import { ClipboardList, Trash2 } from "lucide-react";
import { AdminTestBuilder, createEmptyTestQuestion, isTestBuilderValid } from "@/components/admin-test-builder";
import { MarkdownEditor } from "@/components/markdown-editor";
import { inputClass, primaryButton, secondaryButton } from "@/components/admin-ui";
import type { CmsHomework } from "@/types/cms";

type HomeworkFormValues = Pick<CmsHomework, "description" | "type" | "passingScore" | "testQuestions">;

interface LessonHomeworkPanelProps {
  homeworkForm: HomeworkFormValues;
  hasHomework: boolean;
  saving: boolean;
  onChange: (value: HomeworkFormValues | ((current: HomeworkFormValues) => HomeworkFormValues)) => void;
  onSubmit: (event: React.FormEvent) => void;
  onArchive: () => void;
}

export function LessonHomeworkPanel({
  homeworkForm,
  hasHomework,
  saving,
  onChange,
  onSubmit,
  onArchive,
}: LessonHomeworkPanelProps) {
  const isTest = homeworkForm.type === "test";
  const canSave = homeworkForm.description.trim() && (!isTest || isTestBuilderValid(homeworkForm.testQuestions ?? []));

  function patchHomework(patch: Partial<HomeworkFormValues> | ((current: HomeworkFormValues) => HomeworkFormValues)) {
    if (typeof patch === "function") {
      onChange(patch);
      return;
    }
    onChange((current) => ({ ...current, ...patch }));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="rounded-[24px] border border-stone-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <ClipboardList size={20} className="mt-1 text-gold" />
            <div>
              <h3 className="font-display text-3xl">Задание и тест</h3>
              <p className="mt-1 text-sm text-stone-500">
                Здесь прикрепляется сдача урока: работа на проверку или автоматический тест.
              </p>
              <p className="mt-3 text-xs font-bold uppercase tracking-wider text-stone-400">
                {hasHomework ? "Задание создано" : "Задание ещё не создано"}
              </p>
            </div>
          </div>
          {hasHomework && (
            <button type="button" onClick={onArchive} className={secondaryButton}>
              <Trash2 size={14} /> Архивировать
            </button>
          )}
        </div>
      </div>

      <section className="rounded-[24px] border border-stone-200 bg-stone-50 p-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">Шаг 1</p>
        <h4 className="font-display mt-2 text-2xl">Формат сдачи</h4>
        <p className="mt-1 text-sm text-stone-500">Выберите, как ученик будет подтверждать прохождение урока.</p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label
            className={`cursor-pointer rounded-2xl border p-4 transition ${
              homeworkForm.type === "assignment" ? "border-ink bg-white shadow-soft" : "border-stone-200 bg-white"
            }`}
          >
            <input
              type="radio"
              name="homework-type"
              className="sr-only"
              checked={homeworkForm.type === "assignment"}
              onChange={() => patchHomework({ type: "assignment", testQuestions: [] })}
            />
            <p className="text-sm font-bold">Работа на проверку</p>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              Ученик прикрепляет файл или ссылку. Преподаватель проверяет вручную.
            </p>
          </label>
          <label
            className={`cursor-pointer rounded-2xl border p-4 transition ${
              homeworkForm.type === "test" ? "border-ink bg-white shadow-soft" : "border-stone-200 bg-white"
            }`}
          >
            <input
              type="radio"
              name="homework-type"
              className="sr-only"
              checked={homeworkForm.type === "test"}
              onChange={() => patchHomework((current) => ({
                ...current,
                type: "test",
                testQuestions: current.testQuestions?.length ? current.testQuestions : [createEmptyTestQuestion()],
              }))}
            />
            <p className="text-sm font-bold">Тест</p>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              Вопросы с вариантами ответов. Результат проверяется автоматически.
            </p>
          </label>
        </div>

        {isTest && (
          <label className="mt-4 block max-w-xs text-xs font-bold uppercase tracking-wider text-stone-500">
            Проходной балл, %
            <input
              type="number"
              min="0"
              max="100"
              value={homeworkForm.passingScore}
              onChange={(event) => patchHomework({ passingScore: Number(event.target.value) })}
              className={`${inputClass} mt-2`}
            />
          </label>
        )}
      </section>

      <section className="rounded-[24px] border border-stone-200 bg-stone-50 p-5">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">Шаг 2</p>
        <h4 className="font-display mt-2 text-2xl">Описание задания</h4>
        <p className="mt-1 text-sm text-stone-500">
          {isTest ? "Кратко объясните, что проверяет тест." : "Что именно нужно сделать ученику."}
        </p>
        <div className="mt-4">
          <MarkdownEditor
            value={homeworkForm.description}
            onChange={(description) => patchHomework({ description })}
            label="Текст задания"
          />
        </div>
      </section>

      {isTest && (
        <section className="rounded-[24px] border border-stone-200 bg-stone-50 p-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">Шаг 3</p>
          <h4 className="font-display mt-2 text-2xl">Вопросы теста</h4>
          <p className="mt-1 text-sm text-stone-500">
            Тест проверяется автоматически. При провале ученик может пересдать.
          </p>
          <AdminTestBuilder
            questions={homeworkForm.testQuestions ?? []}
            onChange={(testQuestions) => patchHomework({ testQuestions })}
          />
        </section>
      )}

      <div className="rounded-[24px] border border-stone-200 bg-white p-5">
        <button disabled={!canSave || saving} className={`${primaryButton} disabled:opacity-50`}>
          {saving ? "Сохраняем..." : hasHomework ? "Сохранить задание" : "Создать задание"}
        </button>
      </div>
    </form>
  );
}
