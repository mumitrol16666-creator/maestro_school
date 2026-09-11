"use client";

import {
  Check,
  CircleDot,
  ClipboardCheck,
  RotateCcw,
  Target,
} from "lucide-react";
import type {
  LearningLessonV2Context,
  LearningLessonV2Homework,
} from "@/types/teacher-offline";

export type LearningLessonHomeworkDecisionDraft = {
  decision: "revision" | "accepted" | "accepted_with_comment" | null;
  comment: string;
};

export type LearningLessonTopicProgressDraft = {
  expectedPercent: number | null;
  toPercent: number;
  comment: string;
};

export type LearningLessonV2Draft = {
  topicId: string | null;
  homeworkTopicId: string | null;
  topicProgress: Record<string, LearningLessonTopicProgressDraft>;
  homeworkDecisions: Record<string, LearningLessonHomeworkDecisionDraft>;
};

export function emptyLearningLessonV2Draft(): LearningLessonV2Draft {
  return {
    topicId: null,
    homeworkTopicId: null,
    topicProgress: {},
    homeworkDecisions: {},
  };
}

export function normalizeLearningLessonV2Draft(value: unknown): LearningLessonV2Draft {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyLearningLessonV2Draft();
  }
  const candidate = value as Record<string, unknown>;
  const topicId = typeof candidate.topicId === "string" && candidate.topicId
    ? candidate.topicId
    : null;
  const hasHomeworkTopicId = Object.prototype.hasOwnProperty.call(candidate, "homeworkTopicId");
  const homeworkTopicId = hasHomeworkTopicId
    ? typeof candidate.homeworkTopicId === "string" && candidate.homeworkTopicId
      ? candidate.homeworkTopicId
      : null
    : topicId;
  const homeworkDecisions = candidate.homeworkDecisions
    && typeof candidate.homeworkDecisions === "object"
    && !Array.isArray(candidate.homeworkDecisions)
    ? candidate.homeworkDecisions as Record<string, LearningLessonHomeworkDecisionDraft>
    : {};
  const rawTopicProgress = candidate.topicProgress
    && typeof candidate.topicProgress === "object"
    && !Array.isArray(candidate.topicProgress)
    ? candidate.topicProgress as Record<string, LearningLessonTopicProgressDraft>
    : {};
  const topicProgress = { ...rawTopicProgress };

  // Older clients saved only one scalar topic update. Keep that unsent work
  // when the application updates while a lesson report is still being edited.
  const legacyToPercent = candidate.toPercent;
  if (
    topicId
    && Number.isInteger(legacyToPercent)
    && Number(legacyToPercent) >= 0
    && Number(legacyToPercent) <= 100
    && !topicProgress[topicId]
  ) {
    const legacyExpectedPercent = candidate.expectedPercent;
    topicProgress[topicId] = {
      expectedPercent: Number.isInteger(legacyExpectedPercent)
        ? Number(legacyExpectedPercent)
        : null,
      toPercent: Number(legacyToPercent),
      comment: typeof candidate.topicComment === "string" ? candidate.topicComment : "",
    };
  }

  return { topicId, homeworkTopicId, topicProgress, homeworkDecisions };
}

export function pendingLearningHomeworkCount(context?: LearningLessonV2Context | null) {
  return context?.students.reduce(
    (total, student) => total + student.pendingHomework.length,
    0,
  ) ?? 0;
}

function HomeworkDecisionRow({
  homework,
  studentName,
  value,
  disabled,
  onChange,
}: {
  homework: LearningLessonV2Homework;
  studentName: string;
  value: LearningLessonHomeworkDecisionDraft;
  disabled: boolean;
  onChange: (value: LearningLessonHomeworkDecisionDraft) => void;
}) {
  const options = [
    { value: "accepted" as const, label: "Принять", icon: Check },
    { value: "accepted_with_comment" as const, label: "С замечанием", icon: CircleDot },
    { value: "revision" as const, label: "На доработку", icon: RotateCcw },
  ];
  return (
    <div className="border-t border-stone-200 py-4 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-black text-ink">{studentName}</p>
          <p className="mt-1 text-sm font-bold text-stone-700">{homework.topicTitle}</p>
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-stone-500">
            {homework.instructions}
          </p>
          <p className="mt-2 text-xs font-semibold text-stone-500">
            {homework.submissionMode === "ready_for_lesson"
              ? "Ученик отметил: проверить на уроке"
              : homework.studentComment || "Ответ отправлен материалами"}
          </p>
        </div>
        <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-3">
          {options.map((option) => {
            const Icon = option.icon;
            const selected = value.decision === option.value;
            return (
              <button
                key={option.value}
                type="button"
                disabled={disabled}
                onClick={() => onChange({
                  decision: selected ? null : option.value,
                  comment: selected ? "" : value.comment,
                })}
                className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-bold transition disabled:opacity-50 ${
                  selected
                    ? option.value === "revision"
                      ? "border-red-700 bg-red-700 text-white"
                      : "border-emerald-700 bg-emerald-700 text-white"
                    : "border-stone-200 bg-white text-stone-700 hover:border-stone-400"
                }`}
              >
                <Icon size={14} />
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
      {value.decision === "revision" || value.decision === "accepted_with_comment" ? (
        <label className="mt-3 block text-xs font-bold text-stone-600">
          Комментарий преподавателя
          <textarea
            value={value.comment}
            disabled={disabled}
            rows={2}
            onChange={(event) => onChange({ ...value, comment: event.target.value })}
            placeholder={value.decision === "revision"
              ? "Что нужно исправить или доучить?"
              : "Что важно учесть дальше?"}
            className="mt-1.5 min-h-16 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-normal text-ink outline-none focus:border-amber-500"
          />
        </label>
      ) : null}
    </div>
  );
}

export function LearningLessonV2Panel({
  context,
  draft,
  disabled,
  onChange,
  onTopicTitleChange,
}: {
  context: LearningLessonV2Context;
  draft: LearningLessonV2Draft;
  disabled: boolean;
  onChange: (draft: LearningLessonV2Draft) => void;
  onTopicTitleChange?: (title: string) => void;
}) {
  if (!context.available) {
    if (context.reason !== "one_time_replacement") return null;
    return (
      <section className="mb-7 rounded-lg border border-amber-200 bg-amber-50 p-5">
        <h2 className="text-lg font-black text-amber-950">Разовая замена</h2>
        <p className="mt-2 text-sm leading-6 text-amber-900">
          Заполните посещаемость и отчёт урока. Открытые ДЗ, план и история остаются
          у постоянного преподавателя.
        </p>
      </section>
    );
  }

  const topics = context.plans.flatMap((plan) => (
    plan.topics.map((topic) => ({ ...topic, directionTitle: plan.direction.title }))
  ));
  const selectedTopic = topics.find((topic) => topic.id === draft.topicId) ?? null;
  const selectedTopicProgress = selectedTopic ? draft.topicProgress[selectedTopic.id] : null;
  const selectedExpectedPercent = selectedTopicProgress?.expectedPercent
    ?? selectedTopic?.progressPercent
    ?? null;
  const selectedToPercent = selectedTopicProgress?.toPercent
    ?? selectedTopic?.progressPercent
    ?? null;
  const pendingCount = pendingLearningHomeworkCount(context);

  function setTopicProgress(topic: typeof topics[number], toPercent: number) {
    const normalizedPercent = Math.max(0, Math.min(100, Math.round(toPercent)));
    const current = draft.topicProgress[topic.id];
    const topicProgress = { ...draft.topicProgress };
    if (!current && normalizedPercent === topic.progressPercent) {
      delete topicProgress[topic.id];
    } else {
      topicProgress[topic.id] = {
        expectedPercent: current ? current.expectedPercent : topic.progressPercent,
        toPercent: normalizedPercent,
        comment: current?.comment ?? "",
      };
    }
    onChange({ ...draft, topicProgress });
  }

  return (
    <section className="mb-7 rounded-lg border border-stone-200 bg-white p-4 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase text-amber-800">
            <Target size={16} />
            Учебный результат
          </p>
          <h2 className="mt-2 font-display text-2xl text-ink">
            Тема и проверка прошлого ДЗ
          </h2>
        </div>
        <span className="text-sm font-bold text-stone-500">
          На проверке: {pendingCount}
        </span>
      </div>

      <div className="mt-5 border-t border-stone-200 pt-5">
        <p className="text-sm font-black text-ink">Прогресс тем</p>
        {topics.length ? (
          <>
            <div className="mt-3 flex flex-wrap gap-2">
              {topics.map((topic) => {
                const selected = topic.id === draft.topicId;
                const topicDraft = draft.topicProgress[topic.id];
                return (
                  <button
                    key={topic.id}
                    type="button"
                    disabled={disabled || topic.progressPercent === 100}
                    aria-pressed={selected}
                    onClick={() => {
                      onChange({
                        ...draft,
                        topicId: topic.id,
                      });
                      onTopicTitleChange?.(topic.title);
                    }}
                    className={`rounded-lg border px-3 py-2 text-left text-sm font-bold transition disabled:opacity-50 ${
                      selected
                        ? "border-amber-600 bg-amber-50 text-amber-950"
                        : "border-stone-200 bg-white text-stone-700 hover:border-amber-400"
                    }`}
                  >
                    <span className="block">{topic.title}</span>
                    <span className="mt-0.5 block text-xs font-semibold opacity-65">
                      {topic.directionTitle} · {topicDraft && topicDraft.toPercent !== topic.progressPercent
                        ? `${topic.progressPercent}% → ${topicDraft.toPercent}%`
                        : `${topic.progressPercent}%`}
                    </span>
                  </button>
                );
              })}
            </div>
            {selectedTopic ? (
              <div className="mt-4 rounded-lg bg-stone-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-ink">{selectedTopic.title}</p>
                    <p className="mt-1 text-xs font-semibold text-stone-500">
                      Было {selectedExpectedPercent ?? 0}% · будет {selectedToPercent ?? 0}%
                    </p>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    inputMode="numeric"
                    disabled={disabled}
                    value={selectedToPercent ?? selectedTopic.progressPercent}
                    onChange={(event) => setTopicProgress(
                      selectedTopic,
                      Number(event.target.value) || 0,
                    )}
                    className="h-11 w-24 rounded-lg border border-stone-300 bg-white px-3 text-center text-lg font-black text-ink"
                    aria-label="Новый процент темы"
                  />
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  disabled={disabled}
                  value={selectedToPercent ?? selectedTopic.progressPercent}
                  onChange={(event) => setTopicProgress(selectedTopic, Number(event.target.value))}
                  className="mt-4 w-full accent-amber-600"
                  aria-label="Прогресс темы"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  {[25, 50, 75, 90, 99, 100].map((value) => (
                    <button
                      key={value}
                      type="button"
                      disabled={disabled}
                      aria-pressed={selectedToPercent === value}
                      onClick={() => setTopicProgress(selectedTopic, value)}
                      className={`min-h-11 rounded-lg border px-3 py-2 text-xs font-bold ${
                        selectedToPercent === value
                          ? "border-amber-700 bg-amber-700 text-white"
                          : "border-stone-200 bg-white text-stone-700"
                      }`}
                    >
                      {value === 100 ? "100% · Освоено" : `${value}%`}
                    </button>
                  ))}
                </div>
                {selectedTopic.masteryCriteria ? (
                  <p className="mt-3 text-xs leading-5 text-stone-500">
                    Критерий: {selectedTopic.masteryCriteria}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 text-sm text-stone-500">
                Выберите тему, чтобы изменить её прогресс. Остальные изменения при переключении сохранятся.
              </p>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm text-stone-500">
            В опубликованном плане нет активных тем. Отчёт урока можно отправить без изменения прогресса.
          </p>
        )}
      </div>

      <div className="mt-6 border-t border-stone-200 pt-5">
        <p className="flex items-center gap-2 text-sm font-black text-ink">
          <ClipboardCheck size={17} className="text-amber-700" />
          Решение по ожидающему ДЗ
        </p>
        {pendingCount ? (
          <div className="mt-4">
            {context.students.flatMap((student) => (
              student.pendingHomework.map((homework) => (
                <HomeworkDecisionRow
                  key={homework.recipientId}
                  homework={homework}
                  studentName={student.name}
                  disabled={disabled}
                  value={draft.homeworkDecisions[homework.recipientId] ?? {
                    decision: null,
                    comment: "",
                  }}
                  onChange={(value) => onChange({
                    ...draft,
                    homeworkDecisions: {
                      ...draft.homeworkDecisions,
                      [homework.recipientId]: value,
                    },
                  })}
                />
              ))
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-stone-500">
            Нет работ, которые ожидают проверки. Старые ДЗ без отправленной попытки здесь не закрываются.
          </p>
        )}
      </div>
    </section>
  );
}
