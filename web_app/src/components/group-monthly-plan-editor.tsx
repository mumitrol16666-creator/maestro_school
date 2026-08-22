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
import { useApiResource } from "@/hooks/use-api-resource";
import { teacherStudentsApi } from "@/lib/teacher-students-api";
import { currentAqtobeMonth } from "@/lib/aqtobe-month";
import type {
  GroupMonthlyPlan,
  MonthlyPlanItemStatus,
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

export function GroupMonthlyPlanEditor({ crmGroupId }: { crmGroupId: string }) {
  const [month, setMonth] = useState(currentAqtobeMonth);
  const resource = useApiResource(
    () => teacherStudentsApi.groupMonthlyPlan(crmGroupId, month),
    [crmGroupId, month],
  );
  const [draft, setDraft] = useState<GroupMonthlyPlan>(() => emptyPlan(month));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(resource.data?.plan ?? emptyPlan(month));
    setSaved(false);
    setError(null);
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
    try {
      const plan = await teacherStudentsApi.saveGroupMonthlyPlan(crmGroupId, {
        ...draft,
        month,
        items: draft.items.filter((item) => item.title.trim()),
        materials: draft.materials.filter((material) => (
          material.title.trim() || material.url.trim() || material.note.trim()
        )),
      });
      setDraft(plan);
      setSaved(true);
      await resource.reload();
      return plan;
    } catch {
      setError("Не удалось сохранить план группы. Проверьте интернет и повторите.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    setPublishing(true);
    setError(null);
    try {
      const savedPlan = await save();
      if (!savedPlan) return;
      const plan = await teacherStudentsApi.publishGroupMonthlyPlan(
        crmGroupId,
        month,
        savedPlan.publication?.draftRevision,
      );
      setDraft(plan);
      setSaved(true);
      await resource.reload();
    } catch {
      setError("Не удалось опубликовать план группы. Проверьте фокус и темы.");
    } finally {
      setPublishing(false);
    }
  }

  if (resource.loading) {
    return <p className="py-6 text-sm text-stone-500">Загружаем план группы…</p>;
  }

  return (
    <section className="mt-5 rounded-[22px] border border-amber-200 bg-amber-50/40 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-800">
            Учебный маршрут группы
          </p>
          <h3 className="mt-1 font-display text-xl">План и материалы</h3>
        </div>
        <input
          type="month"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
          className="h-11 rounded-xl border border-amber-200 bg-white px-3 text-sm font-bold"
        />
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
            <div key={item.id} className="grid gap-2 rounded-2xl border border-stone-200 bg-white p-3 sm:grid-cols-[1fr_150px_40px]">
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
                className="h-10 rounded-xl bg-stone-50 px-3 text-sm outline-none focus:ring-2 focus:ring-amber-200"
              />
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

      {error ? <p className="mt-3 text-sm font-semibold text-red-700">{error}</p> : null}
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={saving || publishing}
          onClick={() => void save()}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-stone-300 bg-white px-5 text-sm font-bold text-ink disabled:opacity-60"
        >
          {saving ? <LoaderCircle size={16} className="animate-spin" /> : saved ? <CheckCircle2 size={16} /> : <Save size={16} />}
          {saving ? "Сохраняем…" : "Сохранить черновик"}
        </button>
        <button
          type="button"
          disabled={saving || publishing || !draft.goal.trim() || !draft.items.some((item) => item.title.trim())}
          onClick={() => void publish()}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-bold text-white disabled:opacity-50"
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
