"use client";

import { CheckCircle2, LoaderCircle, Plus, Save, Send, Trash2, Target, Flag, History, Lightbulb, ClipboardCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useApiResource } from "@/hooks/use-api-resource";
import { ApiError } from "@/lib/api-client";
import { teacherStudentsApi } from "@/lib/teacher-students-api";
import { normalizeCrmDirectionTitle } from "@/lib/crm-direction-title";
import { LearningTopicProgressEditor } from "@/components/learning-topic-progress-editor";
import { LearningHomeworkAssignmentComposer } from "@/components/learning-homework-assignment-composer";
import { SectorHistoryList, SectorProposalsPanel, SectorTemplatePicker, SectorTestField } from "@/components/sector-editor-parts";
import { ProgressBar } from "@/components/progress-bar";
import { SectorEarlyClose } from "@/components/sector-early-close";
import { learningHomeworkApi } from "@/lib/learning-homework-api";
import type {
  LearningPlanMode,
  MonthlyPlanItemStatus,
  SectorTemplate,
  StudentMonthlyPlan,
  TeacherCrmDirection,
} from "@/types/teacher-students";

const itemStatuses: Array<{ value: MonthlyPlanItemStatus; label: string }> = [
  { value: "planned", label: "Запланировано" },
  { value: "in_progress", label: "В работе" },
  { value: "completed", label: "Освоено" },
];

function emptyPlan(): StudentMonthlyPlan {
  return {
    goal: "",
    expectedResult: "",
    skills: "",
    checkpoint: "",
    note: "",
    items: [
      { id: crypto.randomUUID(), title: "", status: "planned" },
      { id: crypto.randomUUID(), title: "", status: "planned" },
    ],
  };
}

/** A sector opened from a step template: its topics become the draft items. */
function planFromTemplate(template: SectorTemplate): StudentMonthlyPlan {
  return {
    goal: template.title,
    expectedResult: template.summary,
    skills: "",
    checkpoint: "",
    note: "",
    templateStepIdInput: template.id,
    preparedTestId: template.preparedTest?.id ?? null,
    items: template.topics.map((topic) => ({
      id: crypto.randomUUID(),
      title: topic.title,
      status: "planned" as const,
      masteryCriteria: topic.masteryCriteria,
    })),
  };
}

function publishedDate(value?: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Aqtobe",
  }).format(new Date(value));
}

export function StudentMonthlyPlanEditor({
  crmStudentId,
  directionTitles,
}: {
  crmStudentId: string;
  directionTitles: string[];
}) {
  const modeResource = useApiResource(() => teacherStudentsApi.learningPlanMode(), []);

  if (modeResource.loading) {
    return <p className="py-6 text-sm text-stone-500">Загружаем направления…</p>;
  }
  if (modeResource.error || !modeResource.data) {
    return <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{modeResource.error ?? "Не удалось загрузить направления"}</p>;
  }

  const normalizedDirectionTitles = new Set(directionTitles.map(normalizeCrmDirectionTitle));
  const directions = modeResource.data.mode === "v2"
    ? modeResource.data.directions.filter((direction) => normalizedDirectionTitles.has(normalizeCrmDirectionTitle(direction.title)))
    : [];
  if (modeResource.data.mode === "v2" && !directions.length) {
    return <p className="mt-5 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">Для ученика не выбрано направление обучения.</p>;
  }

  return (
    <StudentMonthlyPlanEditorContent
      crmStudentId={crmStudentId}
      mode={modeResource.data}
      directions={directions}
    />
  );
}

function StudentMonthlyPlanEditorContent({
  crmStudentId,
  mode,
  directions,
}: {
  crmStudentId: string;
  mode: LearningPlanMode;
  directions: TeacherCrmDirection[];
}) {
  const sectors = mode.mode === "v2";
  const [crmDirectionId, setCrmDirectionId] = useState(() => directions[0]?.crmDirectionId ?? "");
  const resource = useApiResource(
    () => teacherStudentsApi.monthlyPlan(crmStudentId, crmDirectionId || undefined),
    [crmStudentId, crmDirectionId],
  );
  const homeworkFlowResource = useApiResource(() => learningHomeworkApi.teacherAvailability(), []);
  const [draft, setDraft] = useState<StudentMonthlyPlan>(() => emptyPlan());
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staleDraft, setStaleDraft] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (resource.data) {
      setDraft(resource.data.plan ?? emptyPlan());
      setSaved(Boolean(resource.data.plan));
    }
  }, [resource.data]);

  function setField<K extends keyof StudentMonthlyPlan>(
    key: K,
    value: StudentMonthlyPlan[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
    setStaleDraft(false);
  }

  function addItem(title = "", masteryCriteria = "") {
    setDraft((current) => ({
      ...current,
      items: [
        ...current.items,
        { id: crypto.randomUUID(), title, status: "planned", masteryCriteria },
      ],
    }));
    setSaved(false);
    setStaleDraft(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setStaleDraft(false);
    try {
      const plan = await teacherStudentsApi.saveMonthlyPlan(crmStudentId, {
        ...draft,
        templateStepId: draft.templateStepIdInput ?? undefined,
        expectedVersion: sectors ? draft.version ?? 0 : undefined,
        items: draft.items
          .filter((item) => item.title.trim())
          .map((item) => item.state && item.state !== "active"
            ? { ...item, status: "planned" as const }
            : item),
      } as StudentMonthlyPlan & { templateStepId?: string }, crmDirectionId || undefined);
      setDraft(plan);
      setSaved(true);
      await resource.reload();
      return plan;
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === "MONTHLY_PLAN_STALE_DRAFT") {
        setError("Сектор уже изменился. Обновите данные перед сохранением.");
        setStaleDraft(true);
      } else if (reason instanceof ApiError) {
        setError(reason.message);
      } else {
        setError("Не удалось сохранить сектор. Проверьте интернет и повторите.");
      }
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (saving || publishing) return;
    if (!draft.publication?.isPublished && !window.confirm("Ученик увидит цель и все темы сектора. Опубликовать?")) {
      return;
    }
    setPublishing(true);
    setError(null);
    setStaleDraft(false);
    try {
      const savedPlan = await save();
      if (!savedPlan) return;
      const plan = await teacherStudentsApi.publishMonthlyPlan(
        crmStudentId,
        savedPlan.version ?? savedPlan.publication?.draftRevision,
        crmDirectionId || undefined,
      );
      setDraft(plan);
      setSaved(true);
      await resource.reload();
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === "MONTHLY_PLAN_STALE_DRAFT") {
        setError("Сектор уже изменился в другой вкладке. Обновите данные перед публикацией.");
        setStaleDraft(true);
      } else if (reason instanceof ApiError) {
        setError(reason.message);
      } else {
        setError("Не удалось опубликовать сектор ученику. Проверьте цель и темы.");
      }
    } finally {
      setPublishing(false);
    }
  }

  if (resource.loading) {
    return <p className="py-6 text-sm text-stone-500">Загружаем сектор…</p>;
  }

  const isNewSector = sectors && !resource.data?.plan;
  const sequence = draft.sequence ?? resource.data?.nextSequence ?? 1;
  const history = resource.data?.history ?? [];
  const activeItems = draft.items.filter((item) => (
    item.title.trim() && (!item.state || item.state === "active")
  ));
  const completedItems = activeItems.filter((item) => item.status === "completed").length;
  const progressPercent = activeItems.length
    ? Math.round((completedItems / activeItems.length) * 100)
    : 0;
  const hasUnpublishedChanges = Boolean(!saved || draft.publication?.hasUnpublishedChanges);
  const publicationLabel = !draft.publication?.isPublished
    ? "Черновик"
    : hasUnpublishedChanges
      ? "Есть неопубликованные изменения"
      : `Опубликовано ученику · ${publishedDate(draft.publication.publishedAt)}`;

  return (
    <section className="mt-5 rounded-[24px] border border-amber-200 bg-amber-50/40 p-5 sm:p-6 shadow-soft">
      <div className="border-b border-amber-200/60 pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-800">Учебная программа</p>
            <h3 className="mt-0.5 font-display text-2xl text-ink">
              {sectors ? (isNewSector ? `Открываем сектор ${sequence}` : `Сектор ${sequence}`) : "План на месяц"}
            </h3>
            {sectors && history.length ? (
              <button
                type="button"
                onClick={() => setShowHistory((value) => !value)}
                className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-stone-500 hover:text-ink"
              >
                <History size={13} /> Закрыто секторов: {history.length}
              </button>
            ) : null}
          </div>
          <span className={`max-w-full self-start rounded-full px-3 py-1.5 text-[11px] font-black leading-5 ${
            draft.publication?.isPublished && !hasUnpublishedChanges
              ? "bg-emerald-100 text-emerald-800"
              : hasUnpublishedChanges && draft.publication?.isPublished
                ? "bg-amber-200 text-amber-950"
                : "bg-stone-100 text-stone-600"
          }`}>
            {publicationLabel}
          </span>
        </div>

        {sectors ? (
          <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
            <label className="block min-w-0 text-[10px] font-black uppercase tracking-wider text-stone-500">
              Направление
              <select
                value={crmDirectionId}
                onChange={(event) => setCrmDirectionId(event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-amber-200 bg-white px-3 text-sm font-bold normal-case tracking-normal text-ink shadow-xs outline-none"
              >
                {directions.map((direction) => (
                  <option key={direction.crmDirectionId} value={direction.crmDirectionId}>{direction.title}</option>
                ))}
              </select>
            </label>
            <SectorTestField
              value={draft.preparedTestId === undefined ? draft.preparedTest?.id ?? null : draft.preparedTestId}
              passedAt={draft.preparedTest?.passedAt ?? null}
              onChange={(preparedTestId) => setField("preparedTestId", preparedTestId)}
            />
          </div>
        ) : null}
      </div>

      {showHistory && history.length ? <SectorHistoryList history={history} /> : null}

      {resource.error ? (
        <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{resource.error}</p>
      ) : null}

      {isNewSector ? (
        <SectorTemplatePicker
          crmDirectionId={crmDirectionId}
          onPick={(template) => {
            setDraft(planFromTemplate(template));
            setSaved(false);
          }}
        />
      ) : null}

      {sectors && crmDirectionId ? (
        <SectorProposalsPanel
          crmStudentId={crmStudentId}
          onAddTopic={(title) => addItem(title)}
        />
      ) : null}

      {/* 1. Цель сектора */}
      <div className="mt-5">
        <label className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-amber-950">
          <Target size={15} className="text-gold-ink" />
          1. Цель сектора
        </label>
        <p className="mt-1 text-[11px] text-amber-900/70">
          Что ученик будет уметь, когда сектор закроется?
        </p>
        <textarea
          value={draft.goal}
          onChange={(event) => setField("goal", event.target.value)}
          rows={2}
          placeholder="Например: Разобрать 2 песни с боем и выучить соло"
          className="mt-2 w-full rounded-2xl border border-amber-300 bg-white p-3.5 text-sm font-semibold text-ink outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
        />
      </div>

      {/* 2. Темы и произведения по порядку */}
      <div className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-stone-800">
              2. Темы и произведения по порядку
            </p>
            <p className="text-[11px] text-stone-500">Сектор закрывается, когда каждая тема на 100 %{draft.preparedTest ? " и сдан тест сектора" : ""}</p>
          </div>
          <button
            type="button"
            onClick={() => addItem()}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-white px-3.5 py-1.5 text-xs font-bold text-ink shadow-xs transition hover:bg-amber-50"
          >
            <Plus size={14} />
            Добавить тему
          </button>
        </div>

        <div className="mt-3 space-y-2.5">
          {draft.items.map((item, index) => {
            const transferred = Boolean(item.state && item.state !== "active");
            return (
            <div key={item.id} className={`grid gap-2 rounded-2xl border p-3 shadow-xs sm:grid-cols-[minmax(0,1fr)_180px_40px] ${transferred ? "border-stone-200 bg-stone-50" : "border-stone-200 bg-white"}`}>
              <div className="min-w-0 space-y-2">
                {transferred ? (
                  <p className="text-[10px] font-black uppercase tracking-wider text-stone-500">Заменена другой темой</p>
                ) : null}
                <input
                  disabled={transferred}
                  value={item.title}
                  onChange={(event) => {
                    const title = event.target.value;
                    setDraft((current) => ({
                      ...current,
                      items: current.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, title } : entry),
                    }));
                    setSaved(false);
                    setStaleDraft(false);
                  }}
                  placeholder="Песня или навык (напр. Кукла колдуна)"
                  className="h-10 w-full rounded-xl bg-stone-50 px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-amber-200"
                />
                {sectors ? (
                  <input
                    disabled={transferred}
                    value={item.masteryCriteria ?? ""}
                    onChange={(event) => {
                      const masteryCriteria = event.target.value;
                      setDraft((current) => ({
                        ...current,
                        items: current.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, masteryCriteria } : entry),
                      }));
                      setSaved(false);
                      setStaleDraft(false);
                    }}
                    placeholder="Критерий освоения"
                    className="h-9 w-full rounded-xl bg-stone-50 px-3 text-xs outline-none focus:ring-2 focus:ring-amber-200"
                  />
                ) : null}
              </div>
              {sectors && !transferred ? (
                <LearningTopicProgressEditor
                  topicId={item.id}
                  progressPercent={item.progressPercent}
                  onSaved={(result) => {
                    setDraft((current) => ({
                      ...current,
                      items: current.items.map((entry) => entry.id === item.id ? { ...entry, ...result } : entry),
                    }));
                    void resource.reload();
                  }}
                />
              ) : !sectors ? (
                <select
                  value={item.status}
                  onChange={(event) => {
                    const status = event.target.value as MonthlyPlanItemStatus;
                    setDraft((current) => ({
                      ...current,
                      items: current.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, status } : entry),
                    }));
                    setSaved(false);
                    setStaleDraft(false);
                  }}
                  className={"h-10 rounded-xl border px-2.5 text-xs font-bold " + (
                    item.status === "completed"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                      : item.status === "in_progress"
                      ? "border-amber-300 bg-amber-50 text-amber-900"
                      : "border-stone-200 bg-white text-stone-600"
                  )}
                >
                  {itemStatuses.map((status) => (
                    <option key={status.value} value={status.value}>{status.label}</option>
                  ))}
                </select>
              ) : (
                <div className="flex h-10 items-center justify-center rounded-xl bg-stone-200 px-2 text-center text-[11px] font-bold text-stone-600">
                  История сохранена
                </div>
              )}
              {!transferred ? <button
                type="button"
                aria-label="Удалить тему"
                onClick={() => {
                  setDraft((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }));
                  setSaved(false);
                  setStaleDraft(false);
                }}
                className="grid h-10 w-10 place-items-center rounded-xl text-stone-400 hover:bg-red-50 hover:text-red-700 transition"
              >
                <Trash2 size={16} />
              </button> : <span />}
              {sectors && !transferred && homeworkFlowResource.data && item.progressPercent !== undefined && item.title.trim() ? (
                <div className="min-w-0 sm:col-span-3">
                  <LearningHomeworkAssignmentComposer topicId={item.id} topicTitle={item.title} />
                </div>
              ) : null}
            </div>
          );})}
          {!draft.items.length ? (
            <p className="rounded-xl border border-dashed border-stone-300 p-4 text-center text-xs text-stone-500">
              Нажмите «+ Добавить тему» или выберите ступень программы выше.
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-5 border-y border-amber-200/60 py-4">
        <div className="flex items-center justify-between gap-3 text-sm font-bold text-stone-700">
          <span>Закрыто тем: {completedItems} из {activeItems.length}</span>
          <strong className="text-amber-900">{progressPercent}%</strong>
        </div>
        <div className="mt-3"><ProgressBar value={progressPercent} /></div>
        {draft.preparedTest ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600">
            <ClipboardCheck size={14} className={draft.preparedTest.passedAt ? "text-emerald-600" : "text-amber-700"} />
            Тест сектора «{draft.preparedTest.title}»: {draft.preparedTest.passedAt ? "сдан" : "ещё не сдан"}
          </p>
        ) : null}
      </div>

      {/* 3. Teacher-only checkpoint */}
      <div className="mt-6">
        <label className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-stone-800">
          <Flag size={15} className="text-amber-700" />
          3. Контрольная точка (скрыта от ученика)
        </label>
        <p className="mt-1 text-[11px] text-stone-500">
          Как поймём, что сектор действительно закрыт?
        </p>
        <textarea
          value={draft.checkpoint}
          onChange={(event) => setField("checkpoint", event.target.value)}
          rows={2}
          placeholder="Например: Сыграть обе песни под оригинальный трек без остановок или записать видео"
          className="mt-2 w-full rounded-2xl border border-stone-200 bg-white p-3.5 text-sm outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
        />
      </div>

      {/* 4. Внутренняя заметка преподавателя */}
      <div className="mt-6 border-t border-amber-200/60 pt-4">
        <label className="block text-xs font-bold text-stone-500">
          Заметка преподавателя (скрыта от ученика)
          <textarea
            value={draft.note}
            onChange={(event) => setField("note", event.target.value)}
            rows={2}
            placeholder="Индивидуальные особенности, пожелания или заметки для себя"
            className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white p-3 text-xs outline-none focus:border-amber-300"
          />
        </label>
      </div>

      {error ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm font-semibold text-red-700">
          <p>{error}</p>
          {staleDraft ? (
            <button type="button" onClick={() => void resource.reload()} className="underline">
              Обновить данные
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="sticky bottom-[72px] z-20 -mx-5 mt-6 flex flex-col gap-2 border-y border-amber-200/70 bg-amber-50/95 px-5 py-3 shadow-[0_-12px_30px_rgba(41,37,36,0.08)] backdrop-blur sm:bottom-4 sm:mx-0 sm:flex-row sm:rounded-2xl sm:border">
        <button
          type="button"
          disabled={saving || publishing}
          onClick={() => void save()}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-stone-300 bg-white px-5 text-sm font-bold text-ink shadow-xs transition hover:bg-stone-50 disabled:opacity-60 sm:w-auto"
        >
          {saving ? <LoaderCircle size={16} className="animate-spin" /> : saved ? <CheckCircle2 size={16} className="text-emerald-600" /> : <Save size={16} />}
          {saving ? "Сохраняем…" : "Сохранить черновик"}
        </button>
        <button
          type="button"
          disabled={saving || publishing || !draft.goal.trim() || !draft.items.some((item) => item.title.trim())}
          onClick={() => void publish()}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-ink px-6 text-sm font-bold text-white shadow-soft transition hover:bg-stone-800 disabled:opacity-50 sm:w-auto"
        >
          {publishing ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}
          {publishing ? "Публикуем…" : draft.publication?.isPublished ? "Обновить сектор ученику" : "Опубликовать ученику"}
        </button>
      </div>

      {sectors && crmDirectionId && draft.publication?.isPublished && draft.status !== "closed" ? (
        <SectorEarlyClose
          crmStudentId={crmStudentId}
          crmDirectionId={crmDirectionId}
          sequence={draft.sequence ?? resource.data?.plan?.sequence ?? 1}
          completed={draft.items.filter((item) => item.status === "completed").length}
          total={draft.items.filter((item) => item.title.trim() && item.status !== "moved").length}
          onClosed={(awarded) => {
            window.alert(awarded ? `Сектор закрыт, начислено ${awarded} баллов.` : "Сектор закрыт без баллов.");
            void resource.reload();
          }}
        />
      ) : null}

      {draft.publication?.isPublished ? (
        <p className="mt-3 text-xs font-semibold text-emerald-700">
          Сектор опубликован и доступен ученику{hasUnpublishedChanges ? ", но последние правки ещё не опубликованы" : ""}.
        </p>
      ) : null}
      {!sectors ? null : (
        <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-stone-500">
          <Lightbulb size={13} /> Следующий сектор откроется, когда этот закроется: все темы на 100 % и сдан тест.
        </p>
      )}
    </section>
  );
}
