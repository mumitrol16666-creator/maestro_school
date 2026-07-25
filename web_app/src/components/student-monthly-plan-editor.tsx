"use client";

import { CheckCircle2, LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useApiResource } from "@/hooks/use-api-resource";
import { teacherStudentsApi } from "@/lib/teacher-students-api";
import { currentAqtobeMonth } from "@/lib/aqtobe-month";
import type {
  MonthlyPlanItemStatus,
  StudentMonthlyPlan,
} from "@/types/teacher-students";

function emptyPlan(month: string): StudentMonthlyPlan {
  return {
    month,
    goal: "",
    expectedResult: "",
    skills: "",
    checkpoint: "",
    note: "",
    items: [],
  };
}

const itemStatuses: Array<{ value: MonthlyPlanItemStatus; label: string }> = [
  { value: "planned", label: "Запланировано" },
  { value: "in_progress", label: "В работе" },
  { value: "completed", label: "Выполнено" },
  { value: "moved", label: "Перенесено" },
];

export function StudentMonthlyPlanEditor({ crmStudentId }: { crmStudentId: string }) {
  const [month, setMonth] = useState(currentAqtobeMonth);
  const resource = useApiResource(
    () => teacherStudentsApi.monthlyPlan(crmStudentId, month),
    [crmStudentId, month],
  );
  const [draft, setDraft] = useState<StudentMonthlyPlan>(() => emptyPlan(month));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(resource.data?.plan ?? emptyPlan(month));
    setSaved(false);
    setError(null);
  }, [month, resource.data]);

  function setField(field: keyof StudentMonthlyPlan, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setSaved(false);
  }

  function addItem() {
    setDraft((current) => ({
      ...current,
      items: [
        ...current.items,
        { id: crypto.randomUUID(), title: "", status: "planned" },
      ],
    }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const plan = await teacherStudentsApi.saveMonthlyPlan(crmStudentId, {
        ...draft,
        month,
        items: draft.items.filter((item) => item.title.trim()),
      });
      setDraft(plan);
      setSaved(true);
      await resource.reload();
    } catch {
      setError("Не удалось сохранить план. Проверьте интернет и повторите.");
    } finally {
      setSaving(false);
    }
  }

  if (resource.loading) {
    return <p className="py-6 text-sm text-stone-500">Загружаем учебный план…</p>;
  }

  return (
    <section className="mt-5 rounded-[22px] border border-amber-200 bg-amber-50/40 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-800">Учебный план</p>
          <h3 className="mt-1 font-display text-xl">План на месяц</h3>
        </div>
        <input
          type="month"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
          className="h-11 rounded-xl border border-amber-200 bg-white px-3 text-sm font-bold"
        />
      </div>

      {resource.error ? (
        <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{resource.error}</p>
      ) : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <PlanField label="Главная цель месяца" value={draft.goal} onChange={(value) => setField("goal", value)} />
        <PlanField label="Ожидаемый результат" value={draft.expectedResult} onChange={(value) => setField("expectedResult", value)} />
        <PlanField label="Навыки для закрепления" value={draft.skills} onChange={(value) => setField("skills", value)} />
        <PlanField label="Контрольная точка" value={draft.checkpoint} onChange={(value) => setField("checkpoint", value)} />
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-black uppercase tracking-wider text-stone-500">Темы по порядку</p>
          <button type="button" onClick={addItem} className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-white px-3 py-2 text-xs font-bold">
            <Plus size={14} />
            Добавить тему
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
                    items: current.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, title } : entry),
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
                    items: current.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, status } : entry),
                  }));
                  setSaved(false);
                }}
                className="h-10 rounded-xl border border-stone-200 bg-white px-2 text-xs font-bold"
              >
                {itemStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
              </select>
              <button
                type="button"
                aria-label="Удалить тему"
                onClick={() => {
                  setDraft((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }));
                  setSaved(false);
                }}
                className="grid h-10 w-10 place-items-center rounded-xl text-stone-400 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {!draft.items.length ? <p className="text-sm text-stone-500">Добавьте темы, которые планируете пройти в этом месяце.</p> : null}
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
      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-bold text-white disabled:opacity-60"
      >
        {saving ? <LoaderCircle size={16} className="animate-spin" /> : saved ? <CheckCircle2 size={16} /> : <Save size={16} />}
        {saving ? "Сохраняем…" : saved ? "План сохранён" : "Сохранить план"}
      </button>
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
