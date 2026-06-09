"use client";

import { LoaderCircle, Send } from "lucide-react";
import { FormEvent, useState } from "react";
import { attachmentTypeLabels } from "@/lib/homework-ui";
import type { HomeworkAttachmentType } from "@/types/homework";

const attachmentTypes: HomeworkAttachmentType[] = ["text", "video", "audio", "file"];

const placeholders: Record<HomeworkAttachmentType, string> = {
  text: "Текстовый ответ можно написать в комментарии выше",
  video: "https://youtube.com/... или ссылка на видео",
  audio: "https://... ссылка на аудиозапись",
  file: "https://... ссылка на файл (Google Drive, Dropbox и т.д.)",
};

interface HomeworkSubmissionFormProps {
  homeworkDescription: string;
  disabled: boolean;
  disabledReason?: string;
  submitting: boolean;
  onSubmit: (payload: {
    comment?: string;
    attachmentUrl?: string;
    attachmentType?: HomeworkAttachmentType;
  }) => Promise<void>;
}

export function HomeworkSubmissionForm({
  homeworkDescription,
  disabled,
  disabledReason,
  submitting,
  onSubmit,
}: HomeworkSubmissionFormProps) {
  const [comment, setComment] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [attachmentType, setAttachmentType] = useState<HomeworkAttachmentType>("text");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit({
      comment: comment.trim() || undefined,
      attachmentUrl: attachmentType === "text" ? undefined : attachmentUrl.trim() || undefined,
      attachmentType,
    });
  }

  const showUrlField = attachmentType !== "text";

  return (
    <form onSubmit={handleSubmit} className="mt-9 rounded-[30px] border border-stone-200 bg-paper p-6 shadow-soft sm:p-8">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-gold">Домашнее задание</p>
      <h2 className="font-display mt-3 text-3xl">Задание к уроку</h2>
      <p className="mt-4 text-sm leading-7 text-stone-500">{homeworkDescription}</p>

      {disabled && disabledReason && (
        <div className="mt-5 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm font-bold text-amber-800">
          {disabledReason}
        </div>
      )}

      <div className="mt-6 space-y-4 rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-5">
        <div>
          <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-400">Тип работы</span>
          <div className="flex flex-wrap gap-2">
            {attachmentTypes.map((type) => (
              <button
                key={type}
                type="button"
                disabled={disabled || submitting}
                onClick={() => setAttachmentType(type)}
                className={`rounded-full px-4 py-2 text-xs font-bold ${
                  attachmentType === type ? "bg-ink text-white" : "border border-stone-200 bg-white text-stone-600"
                }`}
              >
                {attachmentTypeLabels[type]}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-400">
            Комментарий ученика
          </span>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={disabled || submitting}
            className="min-h-24 w-full rounded-xl border border-stone-200 bg-white p-3 text-sm outline-none focus:border-gold disabled:opacity-60"
            placeholder="Опишите, как вы выполнили задание"
          />
        </label>

        {showUrlField && (
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-stone-400">
              Ссылка на {attachmentTypeLabels[attachmentType].toLowerCase()}
            </span>
            <input
              type="url"
              value={attachmentUrl}
              onChange={(e) => setAttachmentUrl(e.target.value)}
              disabled={disabled || submitting}
              className="w-full rounded-xl border border-stone-200 bg-white p-3 text-sm outline-none focus:border-gold disabled:opacity-60"
              placeholder={placeholders[attachmentType]}
            />
          </label>
        )}
      </div>

      <button
        disabled={disabled || submitting}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-4 text-sm font-bold text-white disabled:opacity-50"
      >
        {submitting ? <LoaderCircle className="animate-spin" size={16} /> : <Send size={16} />}
        {disabled ? "Отправка недоступна" : "Отправить на проверку"}
      </button>
    </form>
  );
}
