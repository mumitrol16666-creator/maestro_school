"use client";

import { CheckCircle2, LoaderCircle, Plus, Save, Send, Trash2, Target, Flag } from "lucide-react";
import { useEffect, useState } from "react";
import { useApiResource } from "@/hooks/use-api-resource";
import { teacherStudentsApi } from "@/lib/teacher-students-api";
import { currentAqtobeMonth } from "@/lib/aqtobe-month";
import type {
  MonthlyPlanItemStatus,
  StudentMonthlyPlan,
} from "@/types/teacher-students";

const itemStatuses: Array<{ value: MonthlyPlanItemStatus; label: string }> = [
  { value: "planned", label: "Запланировано" },
  { value: "in_progress", label: "В работе" },
  { value: "completed", label: "Освоено" },
];

function emptyPlan(month: string): StudentMonthlyPlan {
  return {
    month,
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

export function StudentMonthlyPlanEditor({
  crmStudentId,
}: {
  crmStudentId: string;
}) {
  const [month, setMonth] = useState(() => currentAqtobeMonth());
  const resource = useApiResource(
    () => teacherStudentsApi.monthlyPlan(crmStudentId, month),
    [crmStudentId, month],
  );
  const [draft, setDraft] = useState<StudentMonthlyPlan>(() => emptyPlan(month));
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (resource.data) {
      setDraft(resource.data.plan ?? emptyPlan(month));
      setSaved(Boolean(resource.data.plan));
    }
  }, [resource.data, month]);

  function setField<K extends keyof StudentMonthlyPlan>(
    key: K,
    value: StudentMonthlyPlan[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
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
      return plan;
    } catch {
      setError("Не удалось сохранить план. Проверьте интернет и повторите.");
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
      const plan = await teacherStudentsApi.publishMonthlyPlan(
        crmStudentId,
        month,
        savedPlan.publication?.draftRevision,
      );
      setDraft(plan);
      setSaved(true);
      await resource.reload();
    } catch {
      setError("Не удалось опубликовать план ученику. Проверьте цель и темы.");
    } finally {
      setPublishing(false);
    }
  }

  if (resource.loading) {
    return <p className="py-6 text-sm text-stone-500">Загружаем учебный план…</p>;
  }

  return (
    <section className="mt-5 rounded-[24px] border border-amber-200 bg-amber-50/40 p-5 sm:p-6 shadow-soft">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-amber-200/60 pb-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-800">Учебная программа</p>
          <h3 className="mt-0.5 font-display text-2xl text-ink">План на месяц</h3>
        </div>
        <input
          type="month"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
          className="h-11 rounded-xl border border-amber-200 bg-white px-3 text-sm font-bold shadow-xs outline-none"
        />
      </div>

      {resource.error ? (
        <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{resource.error}</p>
      ) : null}

      {/* 1. Главная цель на месяц */}
      <div className="mt-5">
        <label className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-amber-950">
          <Target size={15} className="text-gold" />
          1. Главная цель на месяц
        </label>
        <p className="mt-1 text-[11px] text-amber-900/70">
          Какую ключевую задачу ставим перед учеником в этом месяце?
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
            <p className="text-[11px] text-stone-500">Конкретные шаги и песни к достижению цели</p>
          </div>
          <button
            type="button"
            onClick={addItem}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-white px-3.5 py-1.5 text-xs font-bold text-ink shadow-xs transition hover:bg-amber-50"
          >
            <Plus size={14} />
            Добавить тему
          </button>
        </div>

        <div className="mt-3 space-y-2.5">
          {draft.items.map((item, index) => (
            <div key={item.id} className="grid gap-2 rounded-2xl border border-stone-200 bg-white p-3 sm:grid-cols-[1fr_160px_40px] shadow-xs">
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
                placeholder="Песня или навык (напр. Кукла колдуна)"
                className="h-10 rounded-xl bg-stone-50 px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-amber-200"
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
              <button
                type="button"
                aria-label="Удалить тему"
                onClick={() => {
                  setDraft((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }));
                  setSaved(false);
                }}
                className="grid h-10 w-10 place-items-center rounded-xl text-stone-400 hover:bg-red-50 hover:text-red-700 transition"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {!draft.items.length ? (
            <p className="rounded-xl border border-dashed border-stone-300 p-4 text-center text-xs text-stone-500">
              Нажмите «+ Добавить тему», чтобы указать песни или техники на этот месяц.
            </p>
          ) : null}
        </div>
      </div>

      {/* 3. Финальный результат месяца (Контрольная точка) */}
      <div className="mt-6">
        <label className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-stone-800">
          <Flag size={15} className="text-amber-700" />
          3. Финальный результат месяца (Контрольная точка)
        </label>
        <p className="mt-1 text-[11px] text-stone-500">
          Как поймём в конце месяца, что цель достигнута?
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

      {error ? <p className="mt-3 text-sm font-semibold text-red-700">{error}</p> : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={saving || publishing}
          onClick={() => void save()}
          className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-stone-300 bg-white px-5 text-sm font-bold text-ink shadow-xs transition hover:bg-stone-50 disabled:opacity-60"
        >
          {saving ? <LoaderCircle size={16} className="animate-spin" /> : saved ? <CheckCircle2 size={16} className="text-emerald-600" /> : <Save size={16} />}
          {saving ? "Сохраняем…" : "Сохранить черновик"}
        </button>
        <button
          type="button"
          disabled={saving || publishing || !draft.goal.trim() || !draft.items.some((item) => item.title.trim())}
          onClick={() => void publish()}
          className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-ink px-6 text-sm font-bold text-white shadow-soft transition hover:bg-stone-800 disabled:opacity-50"
        >
          {publishing ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />}
          {publishing ? "Публикуем…" : draft.publication?.isPublished ? "Обновить у ученика" : "Опубликовать ученику"}
        </button>
      </div>

      {draft.publication?.isPublished ? (
        <p className="mt-3 text-xs font-semibold text-emerald-700">
          ✓ План опубликован и виден на главной странице ученика{draft.publication.hasUnpublishedChanges ? " (есть неопубликованные правки)" : ""}.
        </p>
      ) : null}
    </section>
  );
}
