"use client";

import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import type { LearningPlanCarryoverPreview } from "@/types/teacher-students";

const MONTHS_GENITIVE = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

export function formatLearningPlanMonth(month: string) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) return month;
  return `${MONTHS_GENITIVE[Number(match[2]) - 1]} ${match[1]}`;
}

export function LearningPlanCarryoverPanel({
  preview,
  loading,
  transferring,
  selectedTopicIds,
  onToggle,
  onSelectAll,
  onTransfer,
}: {
  preview: LearningPlanCarryoverPreview | null | undefined;
  loading: boolean;
  transferring: boolean;
  selectedTopicIds: string[];
  onToggle: (topicId: string) => void;
  onSelectAll: () => void;
  onTransfer: () => void;
}) {
  if (loading) {
    return <p className="mt-5 text-xs font-semibold text-stone-500">Проверяем незавершённые темы прошлого месяца…</p>;
  }
  if (!preview?.sourcePlanId || (!preview.candidates.length && !preview.continuedTopics.length)) {
    return null;
  }

  const allSelected = preview.candidates.length > 0
    && preview.candidates.every((topic) => selectedTopicIds.includes(topic.topicId));

  return (
    <div className="mt-5 rounded-2xl border border-amber-300 bg-white p-4 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-800">
            Осталось с {formatLearningPlanMonth(preview.sourceMonth)}
          </p>
          <h4 className="mt-1 text-base font-black text-ink">Продолжить незавершённые темы</h4>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-stone-600">
            Выбранные темы сохранят прогресс, историю и домашние задания. Баллы при переносе не начисляются.
          </p>
        </div>
        {preview.candidates.length ? (
          <button type="button" onClick={onSelectAll} className="text-xs font-bold text-amber-800 underline underline-offset-4">
            {allSelected ? "Снять выбор" : "Выбрать все"}
          </button>
        ) : null}
      </div>

      {preview.sourceHasUnpublishedChanges ? (
        <p className="mt-3 rounded-xl bg-amber-100 px-3 py-2 text-xs font-bold text-amber-950">
          Сначала опубликуйте или отмените правки в плане за {formatLearningPlanMonth(preview.sourceMonth)}.
        </p>
      ) : null}

      {preview.candidates.length ? (
        <div className="mt-3 space-y-2">
          {preview.candidates.map((topic) => {
            const selected = selectedTopicIds.includes(topic.topicId);
            return (
              <button
                key={topic.topicId}
                type="button"
                onClick={() => onToggle(topic.topicId)}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                  selected ? "border-amber-400 bg-amber-50" : "border-stone-200 bg-white hover:border-amber-200"
                }`}
              >
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border ${selected ? "border-amber-500 bg-amber-500 text-white" : "border-stone-300"}`}>
                  {selected ? <Check size={14} /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-ink">{topic.title}</span>
                  {topic.masteryCriteria ? <span className="mt-0.5 block truncate text-xs text-stone-500">{topic.masteryCriteria}</span> : null}
                </span>
                <strong className="shrink-0 text-sm text-amber-900">{topic.progressPercent}%</strong>
              </button>
            );
          })}
        </div>
      ) : null}

      {preview.continuedTopics.length ? (
        <p className="mt-3 flex items-center gap-2 text-xs font-bold text-emerald-700">
          <Check size={14} />
          Уже добавлено продолжение: {preview.continuedTopics.map((topic) => topic.title).join(", ")}
        </p>
      ) : null}

      {preview.candidates.length ? (
        <button
          type="button"
          disabled={!selectedTopicIds.length || transferring || preview.sourceHasUnpublishedChanges}
          onClick={onTransfer}
          className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-sm font-bold text-white disabled:opacity-40"
        >
          {transferring ? <LoaderCircle size={16} className="animate-spin" /> : <ArrowRight size={16} />}
          {transferring ? "Переносим…" : `Перенести выбранные (${selectedTopicIds.length})`}
        </button>
      ) : null}
    </div>
  );
}
