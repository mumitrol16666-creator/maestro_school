"use client";

import { useRef } from "react";
import { AdminVideoValidation } from "@/components/admin-video-validation";
import { MarkdownEditor } from "@/components/markdown-editor";
import { inputClass, primaryButton, secondaryButton } from "@/components/admin-ui";

export type LessonSignupMode = "course" | "external";

export interface LessonFormValues {
  title: string;
  description: string;
  videoUrl: string;
  pointsReward: number;
  sortOrder: number;
  enableAskTeacher: boolean;
  enableLessonSignup: boolean;
  signupMode: LessonSignupMode;
  signupCourseId: string;
  signupExternalUrl: string;
  signupLabel: string;
}

interface LessonEditorFormProps {
  mode: "new-lesson" | "edit-lesson";
  lessonTitle?: string;
  values: LessonFormValues;
  courseOptions: Array<{ id: string; title: string }>;
  saving: boolean;
  onChange: (values: LessonFormValues) => void;
  onSubmit: (event: React.FormEvent) => void;
  onClose: () => void;
}

function Section({
  step,
  title,
  description,
  children,
}: {
  step: number;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-stone-200 bg-stone-50 p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-sm font-bold text-white">
          {step}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-2xl">{title}</h3>
          {description && <p className="mt-1 text-sm text-stone-500">{description}</p>}
          <div className="mt-5 space-y-4">{children}</div>
        </div>
      </div>
    </section>
  );
}

export function LessonEditorForm({
  mode,
  lessonTitle,
  values,
  courseOptions,
  saving,
  onChange,
  onSubmit,
  onClose,
}: LessonEditorFormProps) {
  const videoInputRef = useRef<HTMLInputElement>(null);

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="rounded-[24px] border border-stone-200 bg-white p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">
          {mode === "new-lesson" ? "Новый урок" : "Настройки урока"}
        </p>
        <h2 className="font-display mt-2 text-4xl">
          {mode === "new-lesson" ? "Добавить урок" : lessonTitle}
        </h2>
        {mode === "new-lesson" ? (
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-500">
            Сначала создайте урок. После сохранения откроются вкладки «Материалы» и «Задание и тест» — туда прикрепляются файлы и настраивается сдача.
          </p>
        ) : (
          <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-500">
            Здесь меняются название, описание, видео и баллы. Материалы и задание настраиваются в своих вкладках выше.
          </p>
        )}
      </div>

      <Section step={1} title="Основное" description="Название и описание, которые увидит ученик.">
        <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
          Название
          <input
            required
            value={values.title}
            onChange={(event) => onChange({ ...values, title: event.target.value })}
            className={`${inputClass} mt-2`}
            placeholder="Например: Первая позиция на гитаре"
          />
        </label>
        <MarkdownEditor
          label="Описание"
          value={values.description}
          onChange={(description) => onChange({ ...values, description })}
        />
      </Section>

      <Section step={2} title="Видео" description="Ссылка на ролик урока. Можно добавить позже.">
        <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
          Ссылка на видео
          <input
            ref={videoInputRef}
            type="url"
            value={values.videoUrl}
            onChange={(event) => onChange({ ...values, videoUrl: event.target.value })}
            className={`${inputClass} mt-2`}
            placeholder="YouTube / Vimeo / Cloudflare Stream"
          />
        </label>
        <AdminVideoValidation
          videoUrl={values.videoUrl}
          title={values.title}
          onReplace={() => videoInputRef.current?.focus()}
          onDelete={() => onChange({ ...values, videoUrl: "" })}
        />
      </Section>

      <Section step={3} title="Параметры" description="Баллы за прохождение и порядок в модуле.">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
            Баллы за урок
            <input
              type="number"
              min="0"
              value={values.pointsReward}
              onChange={(event) => onChange({ ...values, pointsReward: Number(event.target.value) })}
              className={`${inputClass} mt-2`}
            />
          </label>
          <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
            Порядок в модуле
            <input
              type="number"
              min="0"
              value={values.sortOrder}
              onChange={(event) => onChange({ ...values, sortOrder: Number(event.target.value) })}
              className={`${inputClass} mt-2`}
            />
          </label>
        </div>
      </Section>

      <Section
        step={4}
        title="Действия после урока"
        description="Два режима для ученика: задать вопрос преподавателю и записаться на следующий этап обучения."
      >
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-stone-200 bg-white p-4">
          <input
            type="checkbox"
            checked={values.enableAskTeacher}
            onChange={(event) => onChange({ ...values, enableAskTeacher: event.target.checked })}
            className="mt-1"
          />
          <span>
            <span className="block text-sm font-bold">Вопрос преподавателю</span>
            <span className="mt-1 block text-xs leading-5 text-stone-500">
              Ученик сможет отправить вопрос по уроку прямо на странице урока.
            </span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-stone-200 bg-white p-4">
          <input
            type="checkbox"
            checked={values.enableLessonSignup}
            onChange={(event) => onChange({ ...values, enableLessonSignup: event.target.checked })}
            className="mt-1"
          />
          <span>
            <span className="block text-sm font-bold">Запись на урок / курс</span>
            <span className="mt-1 block text-xs leading-5 text-stone-500">
              Кнопка в конце урока: автозапись на другой курс или переход по внешней ссылке.
            </span>
          </span>
        </label>

        {values.enableLessonSignup && (
          <div className="space-y-4 rounded-2xl border border-amber-100 bg-amber-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-800">Как работает запись</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={`cursor-pointer rounded-xl border p-3 ${values.signupMode === "course" ? "border-ink bg-white" : "border-stone-200 bg-white/70"}`}>
                <input
                  type="radio"
                  name="signup-mode"
                  className="sr-only"
                  checked={values.signupMode === "course"}
                  onChange={() => onChange({ ...values, signupMode: "course", signupExternalUrl: "" })}
                />
                <p className="text-sm font-bold">Автозапись на курс</p>
                <p className="mt-1 text-xs text-stone-500">Ученик сразу записывается в выбранный курс школы.</p>
              </label>
              <label className={`cursor-pointer rounded-xl border p-3 ${values.signupMode === "external" ? "border-ink bg-white" : "border-stone-200 bg-white/70"}`}>
                <input
                  type="radio"
                  name="signup-mode"
                  className="sr-only"
                  checked={values.signupMode === "external"}
                  onChange={() => onChange({ ...values, signupMode: "external", signupCourseId: "" })}
                />
                <p className="text-sm font-bold">Внешняя ссылка</p>
                <p className="mt-1 text-xs text-stone-500">Calendly, Google Forms или страница записи.</p>
              </label>
            </div>

            <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
              Текст кнопки
              <input
                value={values.signupLabel}
                onChange={(event) => onChange({ ...values, signupLabel: event.target.value })}
                className={`${inputClass} mt-2`}
                placeholder="Записаться на урок"
              />
            </label>

            {values.signupMode === "course" ? (
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
                Курс для записи
                <select
                  value={values.signupCourseId}
                  onChange={(event) => onChange({ ...values, signupCourseId: event.target.value })}
                  className={`${inputClass} mt-2`}
                >
                  <option value="">Выберите курс</option>
                  {courseOptions.map((course) => (
                    <option key={course.id} value={course.id}>{course.title}</option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">
                Ссылка для записи
                <input
                  type="url"
                  value={values.signupExternalUrl}
                  onChange={(event) => onChange({ ...values, signupExternalUrl: event.target.value })}
                  className={`${inputClass} mt-2`}
                  placeholder="https://..."
                />
              </label>
            )}
          </div>
        )}
      </Section>

      <div className="flex flex-wrap gap-3 rounded-[24px] border border-stone-200 bg-white p-5">
        <button className={primaryButton} disabled={saving}>
          {saving ? "Сохраняем..." : mode === "new-lesson" ? "Создать урок" : "Сохранить изменения"}
        </button>
        {mode === "new-lesson" && (
          <button type="button" onClick={onClose} className={secondaryButton}>
            Отмена
          </button>
        )}
      </div>
    </form>
  );
}
