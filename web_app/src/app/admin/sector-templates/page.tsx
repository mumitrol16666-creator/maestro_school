"use client";

import { ArrowDown, ArrowUp, Layers3, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { inputClass, primaryButton, PublishBadge, secondaryButton } from "@/components/admin-ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { ApiError } from "@/lib/api-client";
import { cmsApi } from "@/lib/cms-api";
import type { SectorTemplate, SectorTemplateTopic } from "@/types/teacher-students";

const lineOptions: Array<{ value: SectorTemplateTopic["line"]; label: string }> = [
  { value: "melody", label: "Мелодия" },
  { value: "chords", label: "Аккорды" },
  { value: "theory", label: "Теория" },
  { value: "song", label: "Песня" },
  { value: "other", label: "Тема" },
];

type TopicDraft = { key: string; line: SectorTemplateTopic["line"]; title: string; masteryCriteria: string };

type Draft = {
  id: string | null;
  crmDirectionId: string;
  number: string;
  title: string;
  summary: string;
  preparedTestId: string;
  topics: TopicDraft[];
};

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random());
}

function emptyTopic(line: SectorTemplateTopic["line"] = "other"): TopicDraft {
  return { key: newKey(), line, title: "", masteryCriteria: "" };
}

function draftFrom(template: SectorTemplate | null, nextNumber: number, crmDirectionId: string): Draft {
  if (!template) {
    return {
      id: null, crmDirectionId, number: String(nextNumber), title: "", summary: "", preparedTestId: "",
      topics: [emptyTopic("melody"), emptyTopic("chords"), emptyTopic("theory")],
    };
  }
  return {
    id: template.id,
    crmDirectionId: template.direction?.crmDirectionId ?? "",
    number: String(template.number),
    title: template.title,
    summary: template.summary,
    preparedTestId: template.preparedTest?.id ?? "",
    topics: template.topics.map((topic) => ({ key: topic.id, line: topic.line, title: topic.title, masteryCriteria: topic.masteryCriteria })),
  };
}

export default function SectorTemplatesAdminPage() {
  const [crmDirectionId, setCrmDirectionId] = useState("");
  const directions = useApiResource(() => cmsApi.directions("", 1, 100), []);
  const templates = useApiResource(() => cmsApi.sectorTemplates(crmDirectionId), [crmDirectionId]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const directionList = (directions.data?.data ?? []).filter((item) => item.crmDirectionId);
  const list = templates.data ?? [];
  const nextNumber = list.reduce((max, item) => Math.max(max, item.number), 0) + 1;

  useEffect(() => {
    if (!crmDirectionId && directionList[0]?.crmDirectionId) setCrmDirectionId(directionList[0].crmDirectionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directions.data]);

  async function run(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await action();
      await templates.reload();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось сохранить ступень");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!draft) return;
    const body = {
      crmDirectionId: draft.crmDirectionId || null,
      number: Number(draft.number),
      title: draft.title.trim(),
      summary: draft.summary.trim(),
      // Plan 1.10: a step carries no test; its sector closes with an exam at the school.
      preparedTestId: null,
      topics: draft.topics
        .filter((topic) => topic.title.trim())
        .map((topic) => ({ line: topic.line, title: topic.title.trim(), masteryCriteria: topic.masteryCriteria.trim() })),
    };
    await run("save", async () => {
      if (draft.id) await cmsApi.updateSectorTemplate(draft.id, body);
      else await cmsApi.createSectorTemplate(body);
      setDraft(null);
    });
  }

  return (
    <>
      <PageHeader
        eyebrow="Программы и контент"
        title="Ступени программы"
        description="Готовые секторы по направлению. Преподаватель открывает ступень ученику одним нажатием и правит темы под него."
      />

      <div className="mb-5 flex flex-wrap items-center gap-3 border-y border-stone-200 py-4">
        <label className="text-xs font-black uppercase tracking-wider text-stone-500">
          Направление
          <select
            value={crmDirectionId}
            onChange={(event) => { setCrmDirectionId(event.target.value); setDraft(null); }}
            className={`${inputClass} mt-1 block min-w-[240px] normal-case tracking-normal`}
          >
            <option value="">Все направления</option>
            {directionList.map((item) => (
              <option key={item.id} value={item.crmDirectionId ?? ""}>{item.title}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={`${primaryButton} ml-auto inline-flex items-center gap-2`}
          onClick={() => setDraft(draftFrom(null, nextNumber, crmDirectionId))}
          disabled={Boolean(draft)}
        >
          <Plus size={16} /> Новая ступень
        </button>
      </div>

      {error ? <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}

      {draft ? (
        <TemplateForm
          draft={draft}
          directions={directionList.map((item) => ({ id: item.crmDirectionId ?? "", title: item.title }))}
          saving={busy === "save"}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSave={() => void save()}
        />
      ) : null}

      {templates.loading && !templates.data ? <LoadingState label="Загружаем ступени" /> : null}
      {templates.error ? <ErrorState message={templates.error} retry={templates.reload} /> : null}
      {templates.data && !list.length && !draft ? (
        <EmptyState
          title="Ступеней пока нет"
          description="Создайте первую ступень: номер, цель, темы по линиям и тест. После публикации она появится у преподавателей."
        />
      ) : null}

      {list.length ? (
        <div className="divide-y divide-stone-200 border-y border-stone-200">
          {list.map((template) => (
            <article key={template.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-amber-50 text-xs font-black text-amber-900">{template.number}</span>
                  <h2 className="text-sm font-bold text-ink sm:text-base">{template.title}</h2>
                  <PublishBadge published={template.isPublished} />
                  {template.direction?.title ? <span className="text-xs text-stone-500">{template.direction.title}</span> : null}
                </div>
                {template.summary ? <p className="mt-1 text-xs text-stone-500">{template.summary}</p> : null}
                <p className="mt-2 text-xs text-stone-600">
                  {template.topics.length} тем
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {template.topics.map((topic) => (
                    <li key={topic.id} className="rounded-md bg-stone-100 px-2 py-1 text-[11px] font-semibold text-stone-700">
                      {lineOptions.find((option) => option.value === topic.line)?.label}: {topic.title}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex shrink-0 flex-wrap items-start gap-2">
                <button
                  type="button"
                  className={secondaryButton}
                  disabled={Boolean(draft) || busy !== null}
                  onClick={() => setDraft(draftFrom(template, nextNumber, crmDirectionId))}
                >
                  Изменить
                </button>
                <button
                  type="button"
                  className={template.isPublished ? secondaryButton : primaryButton}
                  disabled={busy !== null || (!template.isPublished && !template.topics.length)}
                  onClick={() => void run(template.id, () => cmsApi.publishSectorTemplate(template.id, !template.isPublished))}
                >
                  {busy === template.id ? <LoaderCircle size={14} className="animate-spin" /> : template.isPublished ? "Снять с публикации" : "Опубликовать"}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </>
  );
}

function TemplateForm({
  draft,
  directions,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  draft: Draft;
  directions: Array<{ id: string; title: string }>;
  saving: boolean;
  onChange: (draft: Draft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => onChange({ ...draft, [key]: value });
  const setTopic = (key: string, patch: Partial<TopicDraft>) =>
    set("topics", draft.topics.map((topic) => (topic.key === key ? { ...topic, ...patch } : topic)));
  const move = (index: number, delta: number) => {
    const next = [...draft.topics];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    set("topics", next);
  };
  const canSave = draft.title.trim() && Number(draft.number) >= 1 && !saving;

  return (
    <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/40 p-4 sm:p-5">
      <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-900">
        <Layers3 size={15} /> {draft.id ? "Изменить ступень" : "Новая ступень"}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
        <label className="text-[10px] font-black uppercase tracking-wider text-stone-500">
          Номер
          <input type="number" min={1} value={draft.number} onChange={(event) => set("number", event.target.value)} className={`${inputClass} mt-1`} />
        </label>
        <label className="text-[10px] font-black uppercase tracking-wider text-stone-500">
          Название ступени
          <input value={draft.title} onChange={(event) => set("title", event.target.value)} placeholder="Например: Первые аккорды и бой" className={`${inputClass} mt-1 normal-case tracking-normal`} />
        </label>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-[10px] font-black uppercase tracking-wider text-stone-500">
          Направление
          <select value={draft.crmDirectionId} onChange={(event) => set("crmDirectionId", event.target.value)} className={`${inputClass} mt-1 normal-case tracking-normal`}>
            <option value="">Для всех направлений</option>
            {directions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
      </div>
      <label className="mt-3 block text-[10px] font-black uppercase tracking-wider text-stone-500">
        Что ученик умеет после ступени
        <textarea value={draft.summary} onChange={(event) => set("summary", event.target.value)} rows={2} className={`${inputClass} mt-1 min-h-[64px] normal-case tracking-normal`} />
      </label>

      <div className="mt-5 flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-wider text-stone-500">Темы ступени</p>
        <button type="button" className={`${secondaryButton} inline-flex items-center gap-1`} onClick={() => set("topics", [...draft.topics, emptyTopic()])}>
          <Plus size={14} /> Тема
        </button>
      </div>
      <div className="mt-2 grid gap-2">
        {draft.topics.map((topic, index) => (
          <div key={topic.key} className="grid gap-2 rounded-xl border border-stone-200 bg-white p-3 sm:grid-cols-[130px_minmax(0,1fr)_auto]">
            <select value={topic.line} onChange={(event) => setTopic(topic.key, { line: event.target.value as TopicDraft["line"] })} className={inputClass}>
              {lineOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <div className="grid gap-2">
              <input value={topic.title} onChange={(event) => setTopic(topic.key, { title: event.target.value })} placeholder="Тема или песня" className={inputClass} />
              <input value={topic.masteryCriteria} onChange={(event) => setTopic(topic.key, { masteryCriteria: event.target.value })} placeholder="Критерий освоения (необязательно)" className={inputClass} />
            </div>
            <div className="flex items-start gap-1">
              <button type="button" aria-label="Выше" onClick={() => move(index, -1)} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100"><ArrowUp size={14} /></button>
              <button type="button" aria-label="Ниже" onClick={() => move(index, 1)} className="rounded-lg p-2 text-stone-500 hover:bg-stone-100"><ArrowDown size={14} /></button>
              <button type="button" aria-label="Удалить" onClick={() => set("topics", draft.topics.filter((item) => item.key !== topic.key))} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" className={`${primaryButton} inline-flex items-center gap-2`} disabled={!canSave} onClick={onSave}>
          {saving ? <LoaderCircle size={14} className="animate-spin" /> : null} Сохранить
        </button>
        <button type="button" className={secondaryButton} disabled={saving} onClick={onCancel}>Отмена</button>
      </div>
    </section>
  );
}
