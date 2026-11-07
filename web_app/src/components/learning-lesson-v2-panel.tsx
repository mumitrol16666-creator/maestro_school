"use client";

import { useState } from "react";
import { homeworkPercentTone } from "@/lib/homework-ui";

import { ClipboardCheck, LoaderCircle, MoreHorizontal, Plus, Sparkles, Target } from "lucide-react";
import type {
  LearningLessonV2Context,
  LearningLessonV2Homework,
} from "@/types/teacher-offline";

export type LearningLessonHomeworkDecisionDraft = {
  /** How much of the homework the teacher saw done: 0 = not completed, null = not decided yet. */
  completionPercent: number | null;
  comment: string;
};

export type LearningLessonTopicProgressDraft = {
  expectedPercent: number | null;
  toPercent: number;
  comment: string;
};

export type LearningLessonV2Draft = {
  readySectorIds?: string[];
  studiedPlanIds?: string[];
  topicId: string | null;
  homeworkTopicId: string | null;
  topicProgress: Record<string, LearningLessonTopicProgressDraft>;
  homeworkDecisions: Record<string, LearningLessonHomeworkDecisionDraft>;
};

const pendingLessonDayFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "Asia/Aqtobe" });

/** 31.10: «28 октября» for the earlier lesson whose report a topic continues from. */
function pendingLessonDay(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? pendingLessonDayFormat.format(new Date(`${date}T12:00:00+05:00`))
    : date;
}

export function emptyLearningLessonV2Draft(): LearningLessonV2Draft {
  return {
    readySectorIds: [],
    studiedPlanIds: [],
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
  const rawHomeworkDecisions = candidate.homeworkDecisions
    && typeof candidate.homeworkDecisions === "object"
    && !Array.isArray(candidate.homeworkDecisions)
    ? candidate.homeworkDecisions as Record<string, Partial<LearningLessonHomeworkDecisionDraft> & { decision?: string | null }>
    : {};
  // Drafts saved before the percent flow carried a decision word: an accepted
  // answer counts as fully done, a revision has to be decided again.
  const homeworkDecisions: Record<string, LearningLessonHomeworkDecisionDraft> = Object.fromEntries(
    Object.entries(rawHomeworkDecisions).map(([recipientId, value]) => [recipientId, {
      completionPercent: Number.isInteger(value?.completionPercent)
        ? Number(value!.completionPercent)
        : value?.decision === "accepted" || value?.decision === "accepted_with_comment" ? 100 : null,
      comment: typeof value?.comment === "string" ? value.comment : "",
    }]),
  );
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

  const readySectorIds = Array.isArray(candidate.readySectorIds) ? [...new Set(candidate.readySectorIds.filter((id): id is string => typeof id === "string"))] : [];
  const studiedPlanIds = Array.isArray(candidate.studiedPlanIds) ? [...new Set(candidate.studiedPlanIds.filter((id): id is string => typeof id === "string"))] : [];
  return { topicId, homeworkTopicId, topicProgress, homeworkDecisions, readySectorIds, studiedPlanIds };
}

export function pendingLearningHomeworkCount(context?: LearningLessonV2Context | null) {
  return context?.students.reduce(
    (total, student) => total + student.pendingHomework.length,
    0,
  ) ?? 0;
}

const percentPresets = [
  { value: 0, label: "Не выполнено" },
  { value: 50, label: "50%" },
  { value: 70, label: "70%" },
  { value: 100, label: "100%" },
];

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
  const tone = homeworkPercentTone(value.completionPercent);
  const [custom, setCustom] = useState<string>(
    value.completionPercent != null && !percentPresets.some((preset) => preset.value === value.completionPercent)
      ? String(value.completionPercent)
      : "",
  );
  return (
    <div className="border-t border-stone-200 py-4 first:border-t-0 first:pt-0 last:pb-0" data-testid="homework-check-row">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-black text-ink">{studentName}</p>
          <p className="mt-1 text-sm font-bold text-stone-700">{homework.topicTitle}</p>
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-stone-500">
            {homework.instructions}
          </p>
          <p className="mt-2 text-xs font-semibold text-stone-500">
            {homework.submittedAt
              ? homework.submissionMode === "materials"
                ? `Ученик прислал ответ в приложении${homework.studentComment ? `: ${homework.studentComment}` : ""}`
                : "Ученик отметил в приложении: готов показать на уроке"
              : "Ответа в приложении нет: проверьте на уроке"}
          </p>
        </div>
        <div className="shrink-0">
          <div className="flex flex-wrap gap-2">
            {percentPresets.map((preset) => {
              const selected = value.completionPercent === preset.value;
              const presetTone = homeworkPercentTone(preset.value);
              return (
                <button
                  key={preset.value}
                  type="button"
                  disabled={disabled}
                  aria-pressed={selected}
                  onClick={() => {
                    setCustom("");
                    onChange({ ...value, completionPercent: selected ? null : preset.value });
                  }}
                  className={`inline-flex min-h-10 items-center justify-center rounded-lg border px-3 text-xs font-bold transition disabled:opacity-50 ${
                    selected ? `${presetTone.className} border-current` : "border-stone-200 bg-white text-stone-700 hover:border-stone-400"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
            <label className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-stone-200 bg-white px-2 text-xs font-bold text-stone-700">
              <input
                type="number"
                min={0}
                max={100}
                inputMode="numeric"
                disabled={disabled}
                value={custom}
                placeholder="свой %"
                aria-label={`Процент выполнения ДЗ: ${studentName}`}
                onChange={(event) => {
                  const raw = event.target.value;
                  setCustom(raw);
                  if (raw === "") return;
                  const parsed = Math.max(0, Math.min(100, Math.round(Number(raw))));
                  if (Number.isFinite(parsed)) onChange({ ...value, completionPercent: parsed });
                }}
                className="w-16 bg-transparent text-right outline-none"
              />
              %
            </label>
          </div>
          <p className="mt-2 text-right">
            <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-black ${tone.className}`}>
              {value.completionPercent == null ? "Нужна отметка" : tone.label}
            </span>
          </p>
        </div>
      </div>
      <label className="mt-3 block text-xs font-bold text-stone-600">
        Комментарий (необязательно)
        <textarea
          value={value.comment}
          disabled={disabled}
          rows={1}
          onChange={(event) => onChange({ ...value, comment: event.target.value })}
          placeholder="Что доучить или на что обратить внимание"
          className="mt-1.5 min-h-10 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-normal text-ink outline-none focus:border-amber-400"
        />
      </label>
    </div>
  );
}

export function LearningLessonV2Panel({
  context,
  draft,
  disabled,
  onChange,
  onQuickAddTopic,
  onRenameTopic,
  onRemoveTopic,
  onOpenSector,
}: {
  context: LearningLessonV2Context;
  draft: LearningLessonV2Draft;
  disabled: boolean;
  onChange: (draft: LearningLessonV2Draft) => void;
  onQuickAddTopic?: (input: { title: string; masteryCriteria?: string; directionId: string }) => Promise<void | { success: boolean; topic?: { id: string; title: string } }>;
  /** 01.11 (5в): the topic's own menu — rename or take it out of the sector right here. */
  onRenameTopic?: (topicId: string, input: { title: string; masteryCriteria?: string }) => Promise<unknown>;
  onRemoveTopic?: (topicId: string) => Promise<unknown>;
  /** Plan 1.14: opens the sector editor over the lesson when there is no published sector yet. */
  onOpenSector?: () => void;
}) {
  const [topicMenuId, setTopicMenuId] = useState<string | null>(null);
  const [renameTopicId, setRenameTopicId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameCriteria, setRenameCriteria] = useState("");
  const [topicBusy, setTopicBusy] = useState(false);
  const [topicError, setTopicError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickCriteria, setQuickCriteria] = useState("");
  const [addingTopic, setAddingTopic] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [quickDirectionId, setQuickDirectionId] = useState("");
  // Plan 1.6: a quick topic goes only into an open published sector, so the direction is chosen
  // from the sectors this lesson shows.
  const sectorDirections = context.plans.filter(plan => plan.canEditTopics !== false && (context.owner.kind !== "group" || plan.scope === "group")).map((plan) => plan.direction)
    .filter((direction, index, all) => all.findIndex(other => other.id === direction.id) === index);
  const canQuickAdd = Boolean(onQuickAddTopic) && !disabled && sectorDirections.length > 0;

  async function handleAddTopicSubmit(e: React.FormEvent) {
    e.preventDefault();
    const directionId = quickDirectionId || sectorDirections[0]?.id;
    if (!quickTitle.trim() || !onQuickAddTopic || addingTopic) return;
    if (!directionId) {
      setAddError("Сначала откройте сектор в карточке ученика");
      return;
    }
    setAddingTopic(true);
    setAddError(null);
    try {
      const res = await onQuickAddTopic({
        title: quickTitle.trim(),
        masteryCriteria: quickCriteria.trim() || undefined,
        directionId,
      });
      setQuickTitle("");
      setQuickCriteria("");
      setShowAddForm(false);
      if (res && res.topic) {
        onChange({ ...draft, topicId: res.topic.id });
      }
    } catch (err: any) {
      setAddError(err?.message || "Не удалось сохранить тему в план");
    } finally {
      setAddingTopic(false);
    }
  }
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
    plan.topics.map((topic) => ({ ...topic, directionTitle: plan.direction.title, ownerName: plan.ownerName, scope: plan.scope, sequence: plan.sequence, canEditTopics: plan.canEditTopics, sharedGroupPlan:plan.sharedGroupPlan }))
  )).filter((topic, index, all) => all.findIndex(other => other.id === topic.id) === index);
  const directionTitles = new Set(
    context.plans.map((plan) => plan.direction.title.trim()).filter(Boolean),
  );
  const showDirectionTitle = directionTitles.size > 1;
  const selectedTopic = topics.find((topic) => topic.id === draft.topicId) ?? null;
  const selectedTopicProgress = selectedTopic ? draft.topicProgress[selectedTopic.id] : null;
  const selectedExpectedPercent = selectedTopicProgress?.expectedPercent
    ?? selectedTopic?.progressPercent
    ?? null;
  const selectedToPercent = selectedTopicProgress?.toPercent
    ?? selectedTopic?.progressPercent
    ?? null;
  const pendingCount = pendingLearningHomeworkCount(context);

  /** 31.10: the topic's percent changed after the draft was filled — start from the new one. */
  function refreshTopicStart(topic: typeof topics[number]) {
    const current = draft.topicProgress[topic.id];
    if (!current) return;
    const topicProgress = { ...draft.topicProgress };
    if (current.toPercent === topic.progressPercent) {
      delete topicProgress[topic.id];
    } else {
      topicProgress[topic.id] = { ...current, expectedPercent: topic.progressPercent };
    }
    onChange({ ...draft, topicProgress });
  }

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

      {context.examReadiness?.length ? <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50 p-4">
        <p className="text-sm font-bold text-ink">Готовность к экзамену</p>
        <p className="mt-1 text-sm text-stone-600">Решение преподавателя при любом прогрессе тем. Администратор увидит его после подтверждения урока в CRM.</p>
        <div className="mt-3 grid gap-2">
          {context.examReadiness.map(plan => <label key={plan.planId} className="flex min-h-11 items-center gap-3 rounded-lg bg-white p-3 text-sm">
            <input type="checkbox" disabled={disabled || Boolean(plan.readyAt)}
              checked={Boolean(plan.readyAt) || Boolean(draft.readySectorIds?.includes(plan.planId))}
              onChange={event => onChange({ ...draft, readySectorIds: event.target.checked
                ? [...new Set([...(draft.readySectorIds ?? []), plan.planId])]
                : (draft.readySectorIds ?? []).filter(id => id !== plan.planId) })} />
            <span>{plan.studentName} · сектор {plan.sequence} · {plan.direction}{plan.readyAt ? " · готовность подтверждена" : " · готов к экзамену"}</span>
          </label>)}
        </div>
      </div> : null}

      <div className="mt-5 border-t border-stone-200 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-black text-ink">Прогресс тем</p>
          {canQuickAdd ? (
            <button
              type="button"
              onClick={() => {
                setShowAddForm(!showAddForm);
                setAddError(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900 transition hover:bg-amber-100"
            >
              <Plus size={14} className="text-amber-700" />
              {showAddForm ? "Скрыть форму" : context.owner.kind === "group" ? "+ Добавить тему в план группы" : "+ Добавить тему в сектор"}
            </button>
          ) : null}
        </div>

        {showAddForm ? (
          <form onSubmit={handleAddTopicSubmit} className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-amber-700" />
              <p className="text-xs font-bold uppercase tracking-wider text-amber-900">
                Новая тема в сектор
              </p>
            </div>
            <p className="mt-1 text-xs text-amber-900/70">
              Тема сразу добавится в опубликованный сектор{sectorDirections.length === 1 ? ` «${sectorDirections[0]!.title}»` : ""} и появится для выбора на этом уроке. Черновик сектора тоже её получит.
            </p>
            <div className="mt-3 space-y-2.5">
              {sectorDirections.length > 1 ? (
                <select
                  aria-label="Направление сектора"
                  value={quickDirectionId || sectorDirections[0]?.id}
                  disabled={addingTopic}
                  onChange={(e) => setQuickDirectionId(e.target.value)}
                  className="h-10 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm font-medium text-ink focus:border-amber-500 focus:outline-none"
                >
                  {sectorDirections.map((direction) => (
                    <option key={direction.id} value={direction.id}>{direction.title}</option>
                  ))}
                </select>
              ) : null}
              <input
                type="text"
                placeholder="Название темы (например: «Гамма До-мажор в 2 октавы»)*"
                value={quickTitle}
                disabled={addingTopic}
                onChange={(e) => setQuickTitle(e.target.value)}
                className="h-10 w-full rounded-xl border border-stone-300 bg-white px-3.5 text-sm font-medium text-ink placeholder:text-stone-400 focus:border-amber-500 focus:outline-none"
              />
              <input
                type="text"
                placeholder="Критерий освоения (например: «Без запинок в темпе 80 bpm»)"
                value={quickCriteria}
                disabled={addingTopic}
                onChange={(e) => setQuickCriteria(e.target.value)}
                className="h-10 w-full rounded-xl border border-stone-300 bg-white px-3.5 text-sm font-medium text-ink placeholder:text-stone-400 focus:border-amber-500 focus:outline-none"
              />
              {addError ? (
                <p className="text-xs font-semibold text-red-600">{addError}</p>
              ) : null}
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={!quickTitle.trim() || addingTopic}
                  className="flex h-9 items-center gap-1.5 rounded-xl bg-amber-600 px-4 text-xs font-bold text-white transition hover:bg-amber-700 disabled:opacity-50"
                >
                  {addingTopic ? <LoaderCircle className="animate-spin" size={14} /> : <Plus size={14} />}
                  Сохранить тему в план
                </button>
                <button
                  type="button"
                  disabled={addingTopic}
                  onClick={() => setShowAddForm(false)}
                  className="h-9 rounded-xl border border-stone-200 bg-white px-3 text-xs font-bold text-stone-600 hover:bg-stone-100"
                >
                  Отмена
                </button>
              </div>
            </div>
          </form>
        ) : null}
        {topics.length ? (
          <>
            <div className="mt-3 flex flex-wrap gap-2">
              {topics.map((topic) => {
                const selected = topic.id === draft.topicId;
                const topicDraft = draft.topicProgress[topic.id];
                return (
                  <div key={topic.id} className="relative inline-flex items-stretch">
                  <button
                    type="button"
                    disabled={disabled || topic.progressPercent === 100}
                    aria-pressed={selected}
                    data-testid="lesson-topic-option"
                    onClick={() => {
                      onChange({
                        ...draft,
                        topicId: topic.id,
                      });
                    }}
                    className={`rounded-lg border px-3 py-2 text-left text-sm font-bold transition disabled:opacity-50 ${
                      selected
                        ? "border-amber-600 bg-amber-50 text-amber-950"
                        : "border-stone-200 bg-white text-stone-700 hover:border-amber-400"
                    }`}
                  >
                    <span className="block">{context.owner.kind === "group" && topic.ownerName ? `${topic.ownerName} · ` : ""}{topic.title}</span>
                    <span className="mt-0.5 block text-xs font-semibold opacity-65">
                      {showDirectionTitle ? `${topic.directionTitle} · ` : ""}{topicDraft && topicDraft.toPercent !== topic.progressPercent
                        ? `${topic.progressPercent}% → ${topicDraft.toPercent}%`
                        : `${topic.progressPercent}%`}
                    </span>
                    {topic.percentConflict ? (
                      <span className="mt-0.5 block text-[11px] font-semibold text-amber-700">
                        процент у администратора
                      </span>
                    ) : topicDraft && topicDraft.expectedPercent !== topic.progressPercent ? (
                      <span className="mt-0.5 block text-[11px] font-semibold text-red-700">
                        процент изменился
                      </span>
                    ) : topic.pendingFromLesson ? (
                      <span className="mt-0.5 block text-[11px] font-semibold text-amber-700">
                        ждёт подтверждения
                      </span>
                    ) : null}
                  </button>
                  {topic.canEditTopics !== false && (onRenameTopic || onRemoveTopic) ? (
                    <button
                      type="button"
                      disabled={disabled || topicBusy}
                      aria-label={`Действия с темой «${context.owner.kind === "group" && topic.ownerName ? `${topic.ownerName} · ` : ""}{topic.title}»`}
                      aria-expanded={topicMenuId === topic.id}
                      onClick={() => { setTopicMenuId(topicMenuId === topic.id ? null : topic.id); setTopicError(null); }}
                      className="ml-1 grid w-8 place-items-center self-center rounded-lg border border-stone-200 bg-white text-stone-500 hover:border-amber-400 hover:text-ink disabled:opacity-50"
                    >
                      <MoreHorizontal size={16} />
                    </button>
                  ) : null}
                  {topicMenuId === topic.id ? (
                    <div role="menu" className="absolute left-0 top-full z-20 mt-1 w-52 rounded-xl border border-stone-200 bg-white p-1 shadow-lg" data-testid="lesson-topic-menu">
                      {onRenameTopic ? (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setRenameTopicId(topic.id);
                            setRenameTitle(topic.title);
                            setRenameCriteria(topic.masteryCriteria ?? "");
                            setTopicMenuId(null);
                          }}
                          className="block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-ink hover:bg-stone-50"
                        >
                          Переименовать
                        </button>
                      ) : null}
                      {onRemoveTopic ? (
                        <button
                          type="button"
                          role="menuitem"
                          disabled={topic.progressPercent === 100}
                          onClick={async () => {
                            const progress = topic.approvedPercent ?? topic.progressPercent;
                            const question = progress > 0
                              ? `Убрать тему «${context.owner.kind === "group" && topic.ownerName ? `${topic.ownerName} · ` : ""}{topic.title}» из сектора? У неё уже ${progress}% — тема отложится, проценты и баллы останутся.`
                              : `Убрать тему «${context.owner.kind === "group" && topic.ownerName ? `${topic.ownerName} · ` : ""}{topic.title}» из сектора?`;
                            if (!window.confirm(question)) return;
                            setTopicMenuId(null);
                            setTopicBusy(true);
                            setTopicError(null);
                            try {
                              await onRemoveTopic(topic.id);
                              if (draft.topicId === topic.id) {
                                const topicProgress = { ...draft.topicProgress };
                                delete topicProgress[topic.id];
                                onChange({ ...draft, topicId: null, topicProgress });
                              }
                            } catch (reason) {
                              setTopicError(reason instanceof Error ? reason.message : "Не удалось убрать тему");
                            } finally {
                              setTopicBusy(false);
                            }
                          }}
                          className="block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          Убрать из сектора
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  </div>
                );
              })}
            </div>
            {topicError ? <p className="mt-2 text-xs font-semibold text-red-700" role="alert">{topicError}</p> : null}
            {renameTopicId && onRenameTopic ? (
              <form
                className="mt-3 rounded-2xl border border-stone-200 bg-stone-50 p-4"
                data-testid="lesson-topic-rename"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!renameTitle.trim()) return;
                  setTopicBusy(true);
                  setTopicError(null);
                  try {
                    await onRenameTopic(renameTopicId, { title: renameTitle.trim(), masteryCriteria: renameCriteria.trim() });
                    setRenameTopicId(null);
                  } catch (reason) {
                    setTopicError(reason instanceof Error ? reason.message : "Не удалось переименовать тему");
                  } finally {
                    setTopicBusy(false);
                  }
                }}
              >
                <p className="text-xs font-bold uppercase tracking-wider text-stone-600">Переименовать тему</p>
                <input
                  type="text"
                  aria-label="Название темы"
                  value={renameTitle}
                  disabled={topicBusy}
                  onChange={(event) => setRenameTitle(event.target.value)}
                  className="mt-2 h-10 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm font-medium text-ink focus:border-amber-500 focus:outline-none"
                />
                <input
                  type="text"
                  aria-label="Критерий освоения"
                  placeholder="Критерий освоения"
                  value={renameCriteria}
                  disabled={topicBusy}
                  onChange={(event) => setRenameCriteria(event.target.value)}
                  className="mt-2 h-10 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm font-medium text-ink placeholder:text-stone-400 focus:border-amber-500 focus:outline-none"
                />
                <div className="mt-3 flex gap-2">
                  <button type="submit" disabled={topicBusy || !renameTitle.trim()} className="min-h-10 rounded-xl bg-ink px-4 text-sm font-bold text-white disabled:opacity-50">
                    Сохранить
                  </button>
                  <button type="button" disabled={topicBusy} onClick={() => setRenameTopicId(null)} className="min-h-10 rounded-xl border border-stone-200 bg-white px-4 text-sm font-bold text-stone-700">
                    Отмена
                  </button>
                </div>
              </form>
            ) : null}
            {selectedTopic ? (
              <div className="mt-4 rounded-lg bg-stone-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-ink">{selectedTopic.title}</p>
                    <p className="mt-1 text-xs font-semibold text-stone-500">
                      Было {selectedExpectedPercent ?? 0}% · будет {selectedToPercent ?? 0}%
                    </p>
                    {selectedTopic.pendingFromLesson ? (
                      <p className="mt-1 text-xs leading-5 text-amber-800" data-testid="topic-pending-from-lesson">
                        {selectedTopic.progressPercent}% — по отчёту прошлого урока
                        {selectedTopic.pendingFromLesson.date ? ` ${pendingLessonDay(selectedTopic.pendingFromLesson.date)}` : ""},
                        {selectedTopic.pendingFromLesson.approvedWaitingForEarlier
                          ? " он принят, процент запишется после подтверждения урока до него."
                          : " он ждёт подтверждения админом."} Сейчас в теме {selectedTopic.approvedPercent ?? 0}%.
                      </p>
                    ) : selectedTopic.percentConflict ? (
                      <p className="mt-1 text-xs leading-5 text-amber-800" data-testid="topic-percent-conflict">
                        {selectedTopic.percentConflict.own ? "Урок принят, но" : (
                          <>Урок{selectedTopic.percentConflict.lessonDate ? ` ${pendingLessonDay(selectedTopic.percentConflict.lessonDate)}` : ""} принят, но</>
                        )}{" "}
                        его {selectedTopic.percentConflict.toPercent}% по этой теме не записаны: в теме сейчас {selectedTopic.percentConflict.currentPercent}%.
                        Какой процент оставить, решит администратор.
                        {selectedTopic.percentConflict.own ? null : ` Тема начинается с ${selectedTopic.progressPercent}%.`}
                      </p>
                    ) : null}
                    {!selectedTopic.percentConflict && selectedTopicProgress && selectedTopicProgress.expectedPercent !== selectedTopic.progressPercent ? (
                      <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800" data-testid="topic-start-changed">
                        <p>
                          После заполнения прошлый урок по этой теме изменили: тема теперь начинается с{" "}
                          {selectedTopic.progressPercent}%, а не с {selectedTopicProgress.expectedPercent ?? 0}%.
                        </p>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => refreshTopicStart(selectedTopic)}
                          className="mt-2 min-h-11 rounded-lg border border-red-300 bg-white px-3 py-2 font-bold text-red-800"
                        >
                          Начать с {selectedTopic.progressPercent}%
                        </button>
                      </div>
                    ) : null}
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
                      {value === 100 ? selectedTopic?.sharedGroupPlan ? "100% · Пройдено группой" : "100% · Освоено" : `${value}%`}
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
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/40 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-amber-700" />
              <h4 className="text-sm font-bold text-amber-950">
                {sectorDirections.length ? "В открытом секторе пока нет активных тем" : "Сектор ещё не открыт"}
              </h4>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-amber-900/80">
              {sectorDirections.length
                ? "Добавьте тему прямо сейчас: она попадёт в опубликованный сектор, и вы сразу отметите прогресс её освоения."
                : onOpenSector && !disabled
                  ? "Откройте сектор прямо здесь: выберите шаблон ступени или начните с пустого, опубликуйте — и темы появятся на этом шаге."
                  : "Темы на уроке добавляются только в опубликованный сектор. Откройте и опубликуйте сектор в карточке ученика."}
            </p>
            {!sectorDirections.length && onOpenSector && !disabled ? (
              <button
                type="button"
                onClick={onOpenSector}
                className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-amber-700"
              >
                <Plus size={16} /> Открыть сектор
              </button>
            ) : null}
            {canQuickAdd && !showAddForm ? (
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(true);
                  setAddError(null);
                }}
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-amber-700 shadow-sm"
              >
                <Plus size={14} />
                + Добавить первую тему в план
              </button>
            ) : null}
          </div>
        )}
      </div>

      <div className="mt-6 border-t border-stone-200 pt-5">
        <p className="flex items-center gap-2 text-sm font-black text-ink">
          <ClipboardCheck size={17} className="text-amber-700" />
          Проверка прошлого ДЗ
        </p>
        <p className="mt-1 text-xs text-stone-500">
          Отметьте, насколько выполнено домашнее задание каждого присутствующего. 0 закрывает задание как невыполненное, любой процент выше даёт XP.
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
                    completionPercent: null,
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
            Открытых домашних заданий у учеников этого урока нет.
          </p>
        )}
      </div>
    </section>
  );
}
