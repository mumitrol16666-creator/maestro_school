"use client";

import {
  CheckCircle2,
  ExternalLink,
  FilePlus2,
  LoaderCircle,
  Plus,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { LearningTopicProgressEditor } from "@/components/learning-topic-progress-editor";
import { PlanMonthField } from "@/components/plan-month-field";
import { LearningHomeworkAssignmentComposer } from "@/components/learning-homework-assignment-composer";
import { useApiResource } from "@/hooks/use-api-resource";
import { ApiError } from "@/lib/api-client";
import { learningHomeworkApi } from "@/lib/learning-homework-api";
import { teacherStudentsApi } from "@/lib/teacher-students-api";
import { currentAqtobeMonth } from "@/lib/aqtobe-month";
import type {
  GroupMonthlyPlan,
  LearningPlanMode,
  MonthlyPlanItemStatus,
  TeacherCrmDirection,
} from "@/types/teacher-students";

function emptyPlan(month: string): GroupMonthlyPlan {
  return {
    month,
    goal: "",
    expectedResult: "",
    skills: "",
    checkpoint: "",
    note: "",
    items: [],
    materials: [],
  };
}
const itemStatuses: Array<{ value: MonthlyPlanItemStatus; label: string }> = [
  { value: "planned", label: "Запланировано" },
  { value: "in_progress", label: "В работе" },
  { value: "completed", label: "Выполнено" },
];

function materialHref(value: string) {
  const input = value.trim();
  if (!input) return null;
  try {
    const url = new URL(input);
    return ["http:", "https:"].includes(url.protocol) && url.hostname ? url.toString() : null;
  } catch {
    return null;
  }
}

export function GroupMonthlyPlanEditor({
  crmGroupId,
  directionTitle,
}: {
  crmGroupId: string;
  directionTitle: string;
}) {
  const modeResource = useApiResource(() => teacherStudentsApi.learningPlanMode(), []);

  if (modeResource.loading) {
    return <p className="py-6 text-sm text-stone-500">Загружаем направления…</p>;
  }
  if (modeResource.error || !modeResource.data) {
    return <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{modeResource.error ?? "Не удалось загрузить направления"}</p>;
  }
  const directions = modeResource.data.mode === "v2"
    ? modeResource.data.directions.filter((direction) => direction.title === directionTitle)
    : [];
  if (modeResource.data.mode === "v2" && !directions.length) {
    return <p className="mt-5 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">Для группы не выбрано направление обучения.</p>;
  }

  return (
    <GroupMonthlyPlanEditorContent
      crmGroupId={crmGroupId}
      mode={modeResource.data}
      directions={directions}
    />
  );
}

function GroupMonthlyPlanEditorContent({
  crmGroupId,
  mode,
  directions,
}: {
  crmGroupId: string;
  mode: LearningPlanMode;
  directions: TeacherCrmDirection[];
}) {
  const [month, setMonth] = useState(currentAqtobeMonth);
  const [crmDirectionId, setCrmDirectionId] = useState(() => directions[0]?.crmDirectionId ?? "");
  const resource = useApiResource(
    () => teacherStudentsApi.groupMonthlyPlan(crmGroupId, month, crmDirectionId || undefined),
    [crmGroupId, month, crmDirectionId],
  );
  const homeworkFlowResource = useApiResource(() => learningHomeworkApi.teacherAvailability(), []);
  const [draft, setDraft] = useState<GroupMonthlyPlan>(() => emptyPlan(month));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staleDraft, setStaleDraft] = useState(false);

  useEffect(() => {
    setDraft(resource.data?.plan ?? emptyPlan(month));
    setSaved(false);
    setError(null);
    setStaleDraft(false);
  }, [month, resource.data]);

  function setField(field: keyof GroupMonthlyPlan, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setSaved(false);
  }

  function addItem() {
    setDraft((current) => ({
      ...current,
      items: [...current.items, { id: crypto.randomUUID(), title: "", status: "planned" }],
    }));
    setSaved(false);
  }

  function addMaterial() {
    setDraft((current) => ({
      ...current,
      materials: [
        ...current.materials,
        { id: crypto.randomUUID(), title: "", url: "", note: "" },
      ],
    }));
    setSaved(false);
  }

  async function save() {
    const hasInvalidMaterialUrl = draft.materials.some((material) => (
      material.url.trim() && !materialHref(material.url)
    ));
    if (hasInvalidMaterialUrl) {
      setError("Ссылка на материал должна начинаться с http:// или https://");
      return;
    }
    setSaving(true);
    setError(null);
    setStaleDraft(false);
    try {
      const plan = await teacherStudentsApi.saveGroupMonthlyPlan(crmGroupId, {
        ...draft,
        month,
        expectedVersion: mode.mode === "v2" ? draft.version ?? 0 : undefined,
        items: draft.items.filter((item) => item.title.trim()),
        materials: draft.materials.filter((material) => (
          material.title.trim() || material.url.trim() || material.note.trim()
        )),
      }, crmDirectionId || undefined);
      setDraft(plan);
      setSaved(true);
      await resource.reload();
      return plan;
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === "MONTHLY_PLAN_STALE_DRAFT") {
        setError("План группы уже изменился. Обновите данные перед сохранением.");
        setStaleDraft(true);
      } else if (reason instanceof ApiError) {
        setError(reason.message);
      } else {
        setError("Не удалось сохранить план группы. Проверьте интернет и повторите.");
      }
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    setPublishing(true);
    setError(null);
    setStaleDraft(false);
    try {
      const savedPlan = await save();
      if (!savedPlan) return;
      const plan = await teacherStudentsApi.publishGroupMonthlyPlan(
        crmGroupId,
        month,
        savedPlan.version ?? savedPlan.publication?.draftRevision,
        crmDirectionId || undefined,
      );
      setDraft(plan);
      setSaved(true);
      await resource.reload();
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === "MONTHLY_PLAN_STALE_DRAFT") {
        setError("План группы уже изменился. Обновите данные перед публикацией.");
        setStaleDraft(true);
      } else if (reason instanceof ApiError) {
        setError(reason.message);
      } else {
        setError("Не удалось опубликовать план группы. Проверьте фокус и темы.");
      }
    } finally {
      setPublishing(false);
    }
  }

  if (resource.loading) {
    return <p className="py-6 text-sm text-stone-500">Загружаем план группы…</p>;
  }

  return (
    <section className="mt-5 rounded-[22px] border border-amber-200 bg-amber-50/40 p-4 sm:p-5">
      <div className="border-b border-amber-200/60 pb-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-800">
            Учебный маршрут группы
          </p>
          <h3 className="mt-1 font-display text-xl">План и материалы</h3>
        </div>
        <div className={`mt-4 grid min-w-0 gap-3 ${
          mode.mode === "v2"
            ? "sm:grid-cols-2"
            : "sm:ml-auto sm:max-w-[260px]"
        }`}>
          {mode.mode === "v2" ? (
            <label className="block min-w-0 text-[10px] font-black uppercase tracking-wider text-stone-500">
              Направление
              <select
                value={crmDirectionId}
                onChange={(event) => setCrmDirectionId(event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-amber-200 bg-white px-3 text-sm font-bold normal-case tracking-normal text-ink"
              >
                {directions.map((direction) => (
                  <option key={direction.crmDirectionId} value={direction.crmDirectionId}>{direction.title}</option>
                ))}
              </select>
            </label>
          ) : null}
          <PlanMonthField value={month} onChange={setMonth} />
        </div>
      </div>

      {resource.error ? (
        <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
          {resource.error}
        </p>
      ) : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <PlanField label="Фокус месяца" value={draft.goal} onChange={(value) => setField("goal", value)} />
        <PlanField label="Ожидаемый результат" value={draft.expectedResult} onChange={(value) => setField("expectedResult", value)} />
        <PlanField label="Навыки для закрепления" value={draft.skills} onChange={(value) => setField("skills", value)} />
        <PlanField label="Контрольная точка" value={draft.checkpoint} onChange={(value) => setField("checkpoint", value)} />
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-black uppercase tracking-wider text-stone-500">Темы по порядку</p>
          <button
            type="button"
            onClick={addItem}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-amber-200 bg-white px-3 text-xs font-bold"
          >
            <Plus size={14} />
            Тема
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {draft.items.map((item, index) => (
            <div key={item.id} className="grid gap-2 rounded-2xl border border-stone-200 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_180px_40px]">
              <div className="min-w-0 space-y-2">
                <input
                  value={item.title}
                  onChange={(event) => {
                    const title = event.target.value;
                    setDraft((current) => ({
                      ...current,
                      items: current.items.map((entry, itemIndex) => (
                        itemIndex === index ? { ...entry, title } : entry
                      )),
                    }));
                    setSaved(false);
                  }}
                  placeholder={`Тема ${index + 1}`}
                  className="h-10 w-full rounded-xl bg-stone-50 px-3 text-sm outline-none focus:ring-2 focus:ring-amber-200"
                />
                {mode.mode === "v2" ? (
                  <input
                    value={item.masteryCriteria ?? ""}
                    onChange={(event) => {
                      const masteryCriteria = event.target.value;
                      setDraft((current) => ({
                        ...current,
                        items: current.items.map((entry, itemIndex) => (
                          itemIndex === index ? { ...entry, masteryCriteria } : entry
                        )),
                      }));
                      setSaved(false);
                    }}
                    placeholder="Критерий освоения"
                    className="h-9 w-full rounded-xl bg-stone-50 px-3 text-xs outline-none focus:ring-2 focus:ring-amber-200"
                  />
                ) : null}
              </div>
              {mode.mode === "v2" ? (
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
              ) : (
                <select
                  value={item.status}
                  onChange={(event) => {
                    const status = event.target.value as MonthlyPlanItemStatus;
                    setDraft((current) => ({
                      ...current,
                      items: current.items.map((entry, itemIndex) => (
                        itemIndex === index ? { ...entry, status } : entry
                      )),
                    }));
                    setSaved(false);
                  }}
                  className="h-10 rounded-xl border border-stone-200 bg-white px-2 text-xs font-bold"
                >
                  {itemStatuses.map((status) => (
                    <option key={status.value} value={status.value}>{status.label}</option>
                  ))}
                </select>
              )}
              <button
                type="button"
                aria-label="Удалить тему"
                onClick={() => {
                  setDraft((current) => ({
                    ...current,
                    items: current.items.filter((_, itemIndex) => itemIndex !== index),
                  }));
                  setSaved(false);
                }}
                className="grid h-10 w-10 place-items-center rounded-xl text-stone-400 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 size={16} />
              </button>
              {mode.mode === "v2" && homeworkFlowResource.data && item.progressPercent !== undefined && item.title.trim() ? (
                <div className="min-w-0 sm:col-span-3">
                  <LearningHomeworkAssignmentComposer topicId={item.id} topicTitle={item.title} />
                </div>
              ) : null}
            </div>
          ))}
          {!draft.items.length ? (
            <p className="text-sm text-stone-500">Добавьте темы, которые квартет или группа пройдут в этом месяце.</p>
          ) : null}
        </div>
      </div>

      <div className="mt-6 border-t border-amber-200 pt-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FilePlus2 size={16} className="text-gold" />
            <p className="text-xs font-black uppercase tracking-wider text-stone-500">Материалы группы</p>
          </div>
          <button
            type="button"
            onClick={addMaterial}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-amber-200 bg-white px-3 text-xs font-bold"
          >
            <Plus size={14} />
            Материал
          </button>
        </div>
        <div className="mt-3 space-y-3">
          {draft.materials.map((material, index) => {
            const href = materialHref(material.url);
            return (
              <div key={material.id} className="rounded-2xl border border-stone-200 bg-white p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_40px]">
                  <input
                    value={material.title}
                    onChange={(event) => {
                      const title = event.target.value;
                      setDraft((current) => ({
                        ...current,
                        materials: current.materials.map((entry, itemIndex) => (
                          itemIndex === index ? { ...entry, title } : entry
                        )),
                      }));
                      setSaved(false);
                    }}
                    placeholder="Название материала"
                    className="h-10 rounded-xl bg-stone-50 px-3 text-sm outline-none focus:ring-2 focus:ring-amber-200"
                  />
                  <div className="flex min-w-0 gap-2">
                    <input
                      type="url"
                      value={material.url}
                      onChange={(event) => {
                        const url = event.target.value;
                        setDraft((current) => ({
                          ...current,
                          materials: current.materials.map((entry, itemIndex) => (
                            itemIndex === index ? { ...entry, url } : entry
                          )),
                        }));
                        setSaved(false);
                      }}
                      placeholder="Ссылка"
                      className="h-10 min-w-0 flex-1 rounded-xl bg-stone-50 px-3 text-sm outline-none focus:ring-2 focus:ring-amber-200"
                    />
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Открыть материал"
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-stone-200 text-stone-500 hover:text-ink"
                      >
                        <ExternalLink size={15} />
                      </a>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    aria-label="Удалить материал"
                    onClick={() => {
                      setDraft((current) => ({
                        ...current,
                        materials: current.materials.filter((_, itemIndex) => itemIndex !== index),
                      }));
                      setSaved(false);
                    }}
                    className="grid h-10 w-10 place-items-center rounded-xl text-stone-400 hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <textarea
                  value={material.note}
                  onChange={(event) => {
                    const note = event.target.value;
                    setDraft((current) => ({
                      ...current,
                      materials: current.materials.map((entry, itemIndex) => (
                        itemIndex === index ? { ...entry, note } : entry
                      )),
                    }));
                    setSaved(false);
                  }}
                  rows={2}
                  placeholder="Что сделать с материалом"
                  className="mt-2 w-full rounded-xl bg-stone-50 p-3 text-sm outline-none focus:ring-2 focus:ring-amber-200"
                />
              </div>
            );
          })}
          {!draft.materials.length ? (
            <p className="text-sm text-stone-500">Здесь можно хранить ноты, аудио, видео и другие ссылки для всей группы.</p>
          ) : null}
        </div>
      </div>

      <label className="mt-5 block text-xs font-bold text-stone-600">
        Заметка преподавателя
        <textarea
          value={draft.note}
          onChange={(event) => setField("note", event.target.value)}
          rows={3}
          className="mt-2 w-full rounded-2xl border border-stone-200 bg-white p-3 text-sm outline-none focus:border-amber-300"
        />
      </label>

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
      <div className="sticky bottom-[72px] z-20 -mx-4 mt-5 flex flex-col gap-2 border-y border-amber-200/70 bg-amber-50/95 px-4 py-3 shadow-[0_-12px_30px_rgba(41,37,36,0.08)] backdrop-blur sm:bottom-4 sm:mx-0 sm:flex-row sm:rounded-2xl sm:border">
        <button
          type="button"
          disabled={saving || publishing}
          onClick={() => void save()}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-5 text-sm font-bold text-ink disabled:opacity-60 sm:w-auto"
        >
          {saving ? <LoaderCircle size={16} className="animate-spin" /> : saved ? <CheckCircle2 size={16} /> : <Save size={16} />}
          {saving ? "Сохраняем…" : "Сохранить черновик"}
        </button>
        <button
          type="button"
          disabled={saving || publishing || !draft.goal.trim() || !draft.items.some((item) => item.title.trim())}
          onClick={() => void publish()}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink px-5 text-sm font-bold text-white disabled:opacity-50 sm:w-auto"
        >
          {publishing ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}
          {publishing ? "Публикуем…" : draft.publication?.isPublished ? "Обновить у учеников" : "Опубликовать группе"}
        </button>
      </div>
    </section>
  );
}

function PlanField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-xs font-bold text-stone-600">
      {label}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="mt-2 w-full rounded-2xl border border-stone-200 bg-white p-3 text-sm font-normal outline-none focus:border-amber-300"
      />
    </label>
  );
}
