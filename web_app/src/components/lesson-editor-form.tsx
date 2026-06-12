"use client";

import { useRef } from "react";
import { AdminVideoValidation } from "@/components/admin-video-validation";
import { MarkdownEditor } from "@/components/markdown-editor";
import { inputClass, primaryButton, secondaryButton } from "@/components/admin-ui";

export interface LessonFormValues {
  title: string;
  description: string;
  videoUrl: string;
  pointsReward: number;
  sortOrder: number;
}

interface LessonEditorFormProps {
  mode: "new-lesson" | "edit-lesson";
  lessonTitle?: string;
  values: LessonFormValues;
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
