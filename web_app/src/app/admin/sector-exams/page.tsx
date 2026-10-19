"use client";

import { CalendarClock, LoaderCircle, Plus, Send, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { inputClass, primaryButton, secondaryButton } from "@/components/admin-ui";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { ApiError } from "@/lib/api-client";
import { formatExamDate, sectorExamsApi, sectorExamStatusLabel, sectorExamOutcomeLabel } from "@/lib/sector-exams-api";
import type { AdminSectorExamRow, SectorExamItemDraft } from "@/types/sector-exam";

type Filter = "ready" | "waiting" | "scheduled" | "all";

const filters: Array<{ key: Filter; label: string }> = [
  { key: "ready", label: "Готовы к экзамену" },
  { key: "waiting", label: "Ждут назначения" },
  { key: "scheduled", label: "Назначены" },
  { key: "all", label: "Все секторы" },
];

function examNeeded(row: AdminSectorExamRow) {
  return !row.exam || row.exam.status === "completed" || row.exam.status === "cancelled";
}

function matches(row: AdminSectorExamRow, filter: Filter) {
  if (filter === "ready") return row.progress.ready && (examNeeded(row) || row.exam?.status === "draft");
  if (filter === "waiting") return row.exam?.status === "awaiting_schedule";
  if (filter === "scheduled") return row.exam?.status === "scheduled" || row.exam?.status === "in_progress";
  return true;
}

const statusTone: Record<string, string> = {
  draft: "bg-stone-100 text-stone-700",
  awaiting_schedule: "bg-amber-100 text-amber-900",
  scheduled: "bg-sky-100 text-sky-900",
  in_progress: "bg-sky-600 text-white",
  completed: "bg-emerald-100 text-emerald-900",
  cancelled: "bg-stone-100 text-stone-500",
};

export default function SectorExamsPage() {
  const board = useApiResource(() => sectorExamsApi.board(), []);
  const [chosen, setFilter] = useState<Filter | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const counts = useMemo(() => Object.fromEntries(filters.map((item) => [
    item.key, (board.data?.sectors ?? []).filter((row) => matches(row, item.key)).length,
  ])) as Record<Filter, number>, [board.data]);
  // Nobody ready yet: show every sector so the admin can prepare an exam ahead.
  const filter: Filter = chosen ?? (counts.ready ? "ready" : "all");
  const rows = useMemo(() => (board.data?.sectors ?? []).filter((row) => matches(row, filter)), [board.data, filter]);

  return (
    <div className="grid min-w-0 gap-5">
      <PageHeader
        eyebrow="Учебный контроль"
        title="Экзамены секторов"
        description="Экзамен проходит вживую в школе как бесплатный дополнительный урок. Здесь вы готовите список того, что проверяет преподаватель, и отправляете его в CRM на назначение."
      />

      <nav aria-label="Отбор секторов" className="flex gap-1 overflow-x-auto rounded-2xl border border-stone-200 bg-white p-1">
        {filters.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={filter === item.key}
            onClick={() => setFilter(item.key)}
            className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-bold ${filter === item.key ? "bg-ink text-white" : "text-stone-600 hover:bg-stone-50"}`}
          >
            {item.label}
            <span className={`rounded-full px-1.5 text-[10px] ${filter === item.key ? "bg-gold text-ink" : "bg-stone-100 text-stone-700"}`}>{counts[item.key] ?? 0}</span>
          </button>
        ))}
      </nav>

      {board.loading && !board.data ? <LoadingState label="Загружаем секторы" /> : null}
      {board.error ? <ErrorState message={board.error} retry={board.reload} /> : null}
      {board.data && !rows.length ? (
        <EmptyState
          title="Здесь пусто"
          description={filter === "ready" ? "Пока ни один ученик не закрыл все темы сектора." : "В этом отборе нет секторов."}
        />
      ) : null}

      <ul className="grid min-w-0 grid-cols-1 gap-3" data-testid="sector-exam-board">
        {rows.map((row) => (
          <li key={row.planId} className="min-w-0 rounded-2xl border border-stone-200 bg-white p-4" data-testid="sector-exam-row">
            <SectorRow
              row={row}
              editing={editing === row.planId}
              onEdit={() => setEditing(row.planId)}
              onClose={() => setEditing(null)}
              onChanged={() => { setEditing(null); void board.reload(); }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SectorRow({ row, editing, onEdit, onClose, onChanged }: {
  row: AdminSectorExamRow;
  editing: boolean;
  onEdit: () => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const exam = row.exam;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-800">
            Сектор {row.sequence} · {row.direction.title}
          </p>
          <h2 className="mt-1 break-words text-base font-bold text-ink">{row.studentName}</h2>
          {row.goal ? <p className="mt-0.5 break-words text-xs text-stone-500">{row.goal}</p> : null}
        </div>
        <div className="text-right">
          <strong className={`text-xl ${row.progress.ready ? "text-emerald-700" : "text-ink"}`}>{row.progress.percent}%</strong>
          <p className="text-[11px] font-semibold text-stone-500">{row.progress.completed} из {row.progress.total} тем</p>
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {exam ? (
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${statusTone[exam.status] ?? ""}`} data-testid="sector-exam-status">
            {exam.attempt > 1 ? `Пересдача ${exam.attempt - 1} · ` : ""}{sectorExamStatusLabel[exam.status]}
            {exam.status === "completed" && exam.outcome ? ` · ${sectorExamOutcomeLabel[exam.outcome]}` : ""}
          </span>
        ) : (
          <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-black text-stone-600">Экзамен не готовился</span>
        )}
        {exam?.scheduledAt && exam.status !== "completed" ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-900">
            <CalendarClock size={13} /> {formatExamDate(exam.scheduledAt)}
          </span>
        ) : null}
        {!row.progress.ready ? <span className="text-[11px] text-stone-500">Начать экзамен можно, когда все темы на 100 %</span> : null}
      </div>

      {!editing ? (
        <div className="flex flex-wrap gap-2">
          {examNeeded(row) ? (
            <button type="button" className={primaryButton} onClick={onEdit}><Plus size={14} /> Подготовить экзамен</button>
          ) : null}
          {exam && (exam.status === "draft" || exam.status === "awaiting_schedule") ? (
            <button type="button" className={secondaryButton} onClick={onEdit}>Изменить пункты</button>
          ) : null}
          {exam?.status === "draft" ? (
            <button type="button" className={primaryButton} disabled={busy} onClick={() => void run(() => sectorExamsApi.send(exam.id))}>
              <Send size={14} /> Отправить на назначение
            </button>
          ) : null}
          {exam && ["draft", "awaiting_schedule", "scheduled"].includes(exam.status) ? (
            <button type="button" className={secondaryButton} disabled={busy} onClick={() => void run(() => sectorExamsApi.cancel(exam.id))}>
              <X size={14} /> Отменить экзамен
            </button>
          ) : null}
        </div>
      ) : (
        <ExamEditor row={row} onClose={onClose} onSaved={onChanged} />
      )}
      {error ? <p className="text-xs font-bold text-red-700">{error}</p> : null}
    </div>
  );
}

type ItemDraft = SectorExamItemDraft & { key: string };

function ExamEditor({ row, onClose, onSaved }: { row: AdminSectorExamRow; onClose: () => void; onSaved: () => void }) {
  const editable = row.exam && (row.exam.status === "draft" || row.exam.status === "awaiting_schedule") ? row.exam : null;
  const template = useApiResource(
    () => editable
      ? Promise.resolve({ planId: row.planId, items: editable.items.map((item) => ({ kind: item.kind, topicId: item.topicId, title: item.title, criteria: item.criteria })) })
      : sectorExamsApi.template(row.planId),
    [row.planId, editable?.id],
  );
  const [items, setItems] = useState<ItemDraft[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = items ?? (template.data?.items ?? []).map((item, index) => ({ ...item, key: `t-${index}` }));

  function update(key: string, patch: Partial<ItemDraft>) {
    setItems(list.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  async function save(send: boolean) {
    const payload = list.map(({ key: _key, ...item }) => ({ ...item, title: item.title.trim(), criteria: item.criteria?.trim() ?? "" }));
    if (!payload.length || payload.some((item) => !item.title)) {
      setError("У каждого пункта должно быть название");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (editable) {
        await sectorExamsApi.updateItems(editable.id, payload);
        if (send && editable.status === "draft") await sectorExamsApi.send(editable.id);
      } else {
        await sectorExamsApi.create(row.planId, payload, send);
      }
      onSaved();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось сохранить экзамен");
    } finally {
      setBusy(false);
    }
  }

  if (template.loading && !template.data) return <LoadingState label="Готовим список тем" />;
  if (template.error) return <ErrorState message={template.error} retry={template.reload} />;

  return (
    <section className="grid min-w-0 gap-3 rounded-2xl border border-amber-200 bg-amber-50/40 p-3 sm:p-4" data-testid="sector-exam-editor">
      <p className="text-xs font-semibold leading-5 text-amber-900">
        Пункты из тем сектора уже с критериями освоения. Добавьте свои пункты, если преподаватель должен проверить что-то ещё.
      </p>
      <ol className="grid min-w-0 grid-cols-1 gap-2">
        {list.map((item, index) => (
          <li key={item.key} className="grid min-w-0 gap-2 rounded-xl border border-stone-200 bg-white p-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="w-6 shrink-0 text-xs font-black text-stone-400">{index + 1}</span>
              <input
                aria-label={`Пункт ${index + 1}`}
                className={`${inputClass} min-w-0 flex-1`}
                value={item.title}
                maxLength={255}
                onChange={(event) => update(item.key, { title: event.target.value })}
              />
              <button
                type="button"
                aria-label={`Убрать пункт ${index + 1}`}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-stone-500 hover:bg-stone-50"
                onClick={() => setItems(list.filter((row) => row.key !== item.key))}
              >
                <Trash2 size={15} />
              </button>
            </div>
            <textarea
              aria-label={`Что проверить в пункте ${index + 1}`}
              className={`${inputClass} min-h-16`}
              placeholder="Что именно проверить"
              value={item.criteria ?? ""}
              maxLength={2000}
              onChange={(event) => update(item.key, { criteria: event.target.value })}
            />
            <p className="text-[11px] font-semibold text-stone-500">{item.kind === "topic" ? "Тема сектора" : "Свой пункт"}</p>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className={`${secondaryButton} justify-self-start`}
        onClick={() => setItems([...list, { key: `c-${Date.now()}`, kind: "custom", topicId: null, title: "", criteria: "" }])}
      >
        <Plus size={14} /> Добавить свой пункт
      </button>
      {error ? <p className="text-xs font-bold text-red-700">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        {!editable || editable.status === "draft" ? (
          <button type="button" className={primaryButton} disabled={busy} onClick={() => void save(true)}>
            {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Send size={14} />} Отправить на назначение
          </button>
        ) : (
          <button type="button" className={primaryButton} disabled={busy} onClick={() => void save(false)}>
            {busy ? <LoaderCircle size={14} className="animate-spin" /> : null} Сохранить пункты
          </button>
        )}
        {!editable || editable.status === "draft" ? (
          <button type="button" className={secondaryButton} disabled={busy} onClick={() => void save(false)}>Сохранить черновик</button>
        ) : null}
        <button type="button" className={secondaryButton} disabled={busy} onClick={onClose}>Закрыть</button>
      </div>
    </section>
  );
}
