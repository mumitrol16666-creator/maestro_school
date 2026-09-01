"use client";

import { Check, LoaderCircle, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api-client";
import { teacherStudentsApi } from "@/lib/teacher-students-api";
import type { MonthlyPlanItemStatus } from "@/types/teacher-students";

type TopicProgressResult = {
  progressPercent: number | null;
  status: MonthlyPlanItemStatus;
};

export function LearningTopicProgressEditor({
  topicId,
  progressPercent,
  onSaved,
}: {
  topicId: string;
  progressPercent: number | null | undefined;
  onSaved: (result: TopicProgressResult) => void;
}) {
  const [value, setValue] = useState(progressPercent ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(progressPercent ?? 0);
    setError(null);
  }, [progressPercent]);

  if (progressPercent === undefined) {
    return (
      <span className="inline-flex h-10 items-center justify-center rounded-xl bg-stone-100 px-3 text-[11px] font-bold text-stone-500">
        После сохранения
      </span>
    );
  }

  if (progressPercent === 100) {
    return (
      <span className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-emerald-50 px-3 text-xs font-black text-emerald-800">
        <Check size={14} /> 100%
      </span>
    );
  }

  const expectedPercent = progressPercent;
  const valid = Number.isInteger(value) && value >= 0 && value <= 99;
  const changed = value !== expectedPercent;

  async function save() {
    if (!valid || !changed || saving) return;
    setSaving(true);
    setError(null);
    try {
      const topic = await teacherStudentsApi.updateLearningTopicProgress(topicId, {
        toPercent: value,
        expectedPercent,
        sourceKey: `teacher-ui:${crypto.randomUUID()}`,
      });
      onSaved({ progressPercent: topic.progressPercent, status: topic.status });
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === "LEARNING_TOPIC_STALE_PROGRESS") {
        setError("Процент уже изменён. Обновите план.");
      } else if (reason instanceof ApiError) {
        setError(reason.message);
      } else {
        setError("Не удалось сохранить процент.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Прогресс темы в процентах</span>
          <input
            type="number"
            min={0}
            max={99}
            step={1}
            value={value}
            onChange={(event) => setValue(Number(event.target.value))}
            className="h-10 w-full rounded-xl border border-stone-200 bg-white px-3 pr-8 text-sm font-black text-ink outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-400">%</span>
        </label>
        <button
          type="button"
          title="Сохранить прогресс темы"
          aria-label="Сохранить прогресс темы"
          disabled={!valid || !changed || saving}
          onClick={() => void save()}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-35"
        >
          {saving ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}
        </button>
      </div>
      {error ? <p className="mt-1 text-[10px] font-semibold leading-4 text-red-700">{error}</p> : null}
    </div>
  );
}
