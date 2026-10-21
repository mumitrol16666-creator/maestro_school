"use client";

import { LoaderCircle, MessageSquareText, Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { inputClass, primaryButton, secondaryButton } from "@/components/admin-ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { ApiError } from "@/lib/api-client";
import { cmsApi } from "@/lib/cms-api";
import { lessonTemplatesApi } from "@/lib/teacher-offline-api";
import type { LessonTextTemplate } from "@/types/teacher-offline";

const kinds: Array<{ value: LessonTextTemplate["kind"]; title: string; hint: string }> = [
  { value: "summary", title: "Итог урока", hint: "Что сделали на уроке" },
  { value: "homework", title: "Домашнее задание", hint: "Что задать на дом" },
];

/**
 * Plan 1.14: the school's phrases for the lesson summary and homework, per direction. Teachers see
 * the phrases of the lesson direction and the shared ones next to their own.
 */
export default function LessonTemplatesPage() {
  const [crmDirectionId, setCrmDirectionId] = useState("");
  const directions = useApiResource(() => cmsApi.directions("", 1, 100), []);
  const templates = useApiResource(() => lessonTemplatesApi.school(crmDirectionId || null), [crmDirectionId]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newText, setNewText] = useState<Record<LessonTextTemplate["kind"], string>>({ summary: "", homework: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const directionList = (directions.data?.data ?? []).filter((item) => item.crmDirectionId);
  const directionTitle = (id: string | null) => id ? directionList.find((item) => item.crmDirectionId === id)?.title ?? id : "Все направления";

  async function run(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await action();
      await templates.reload();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось сохранить");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Программы и контент"
        title="Шаблоны урока"
        description="Фразы для итога и домашнего задания. Преподаватель видит фразы направления урока и общие, рядом со своими."
      />

      <div className="mb-5 flex flex-wrap items-center gap-3 border-y border-stone-200 py-4">
        <label className="text-xs font-black uppercase tracking-wider text-stone-500">
          Направление
          <select
            value={crmDirectionId}
            onChange={(event) => setCrmDirectionId(event.target.value)}
            className={`${inputClass} mt-1 block min-w-[240px] normal-case tracking-normal`}
          >
            <option value="">Общие для всех направлений</option>
            {directionList.map((item) => (
              <option key={item.id} value={item.crmDirectionId ?? ""}>{item.title}</option>
            ))}
          </select>
        </label>
      </div>

      {error ? <p className="mb-4 rounded-2xl border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">{error}</p> : null}

      {templates.loading && !templates.data ? <LoadingState label="Загружаем шаблоны" /> : null}
      {templates.error ? <ErrorState message={templates.error} retry={templates.reload} /> : null}

      {templates.data ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {kinds.map((kind) => {
            const rows = templates.data!.filter((item) => item.kind === kind.value && (crmDirectionId ? item.crmDirectionId === crmDirectionId : item.crmDirectionId === null));
            const shared = crmDirectionId ? templates.data!.filter((item) => item.kind === kind.value && item.crmDirectionId === null) : [];
            return (
              <section key={kind.value} className="rounded-[24px] border border-stone-200 bg-white p-5" data-testid={`lesson-templates-${kind.value}`}>
                <h2 className="inline-flex items-center gap-2 font-display text-2xl"><MessageSquareText size={20} className="text-gold-ink" /> {kind.title}</h2>
                <p className="mt-1 text-xs text-stone-500">{kind.hint} · {directionTitle(crmDirectionId || null)}</p>
                <ul className="mt-4 space-y-2">
                  {rows.map((item) => (
                    <li key={item.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input
                        aria-label={`Фраза: ${item.text}`}
                        className={`${inputClass} min-w-0 flex-1`}
                        value={drafts[item.id] ?? item.text}
                        maxLength={500}
                        onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                      />
                      <div className="flex gap-2">
                        <button type="button" className={`${secondaryButton} inline-flex min-h-11 items-center gap-1.5`}
                          disabled={busy != null || !(drafts[item.id] ?? "").trim() || drafts[item.id] === item.text}
                          onClick={() => void run(`save:${item.id}`, () => lessonTemplatesApi.updateSchool(item.id, { text: drafts[item.id] }))}>
                          <Save size={15} /> Сохранить
                        </button>
                        <button type="button" aria-label={`Удалить: ${item.text}`} className="grid h-11 w-11 place-items-center rounded-xl border border-stone-200 text-stone-500 hover:border-red-200 hover:text-red-700"
                          disabled={busy != null}
                          onClick={() => void run(`delete:${item.id}`, () => lessonTemplatesApi.removeSchool(item.id))}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                {!rows.length ? <div className="mt-3"><EmptyState title="Фраз пока нет" description="Пока фраз нет, преподаватель видит нейтральный набор." /></div> : null}
                {shared.length ? (
                  <p className="mt-3 text-xs text-stone-500">Ещё общие для всех: {shared.map((item) => `«${item.text}»`).join(", ")}</p>
                ) : null}
                <form
                  className="mt-4 flex flex-col gap-2 border-t border-stone-100 pt-4 sm:flex-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const text = newText[kind.value].trim();
                    if (!text) return;
                    void run(`add:${kind.value}`, async () => {
                      await lessonTemplatesApi.addSchool({ kind: kind.value, text, crmDirectionId: crmDirectionId || null });
                      setNewText((current) => ({ ...current, [kind.value]: "" }));
                    });
                  }}
                >
                  <input
                    aria-label={`Новая фраза: ${kind.title}`}
                    className={`${inputClass} min-w-0 flex-1`}
                    placeholder={kind.value === "summary" ? "Например: Разобрали аккомпанемент" : "Например: Играть 15 минут в день"}
                    value={newText[kind.value]}
                    maxLength={500}
                    onChange={(event) => setNewText((current) => ({ ...current, [kind.value]: event.target.value }))}
                  />
                  <button type="submit" className={`${primaryButton} inline-flex min-h-11 items-center justify-center gap-1.5`} disabled={busy != null || !newText[kind.value].trim()}>
                    {busy === `add:${kind.value}` ? <LoaderCircle size={15} className="animate-spin" /> : <Plus size={15} />} Добавить
                  </button>
                </form>
              </section>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
