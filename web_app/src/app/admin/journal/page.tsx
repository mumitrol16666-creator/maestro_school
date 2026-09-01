"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Clock3,
  History,
  ListFilter,
  RefreshCw,
  Save,
  ShieldAlert,
} from "lucide-react";
import { useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { PageHeader } from "@/components/page-header";
import { useApiResource } from "@/hooks/use-api-resource";
import { adminJournalApi } from "@/lib/admin-journal-api";
import type {
  AdminJournalEntry,
  AdminJournalSeverity,
  AdminJournalSource,
  AdminJournalStatus,
  AdminJournalType,
} from "@/types/admin-journal";

const statusMeta: Record<AdminJournalStatus, { label: string; className: string }> = {
  new: { label: "Новые", className: "border-red-200 bg-red-50 text-red-800" },
  in_progress: { label: "В работе", className: "border-amber-200 bg-amber-50 text-amber-900" },
  resolved: { label: "Решённые", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  dismissed: { label: "Отклонённые", className: "border-stone-200 bg-stone-100 text-stone-600" },
};

const severityMeta: Record<AdminJournalSeverity, { label: string; className: string; icon: typeof CircleDot }> = {
  critical: { label: "Критично", className: "border-red-300 bg-red-600 text-white", icon: ShieldAlert },
  high: { label: "Важно", className: "border-orange-200 bg-orange-50 text-orange-800", icon: AlertTriangle },
  normal: { label: "Обычно", className: "border-sky-200 bg-sky-50 text-sky-800", icon: CircleDot },
  low: { label: "Низко", className: "border-stone-200 bg-stone-100 text-stone-600", icon: CircleDot },
};

const typeLabels: Record<AdminJournalType, string> = {
  product_improvement: "Предложение",
  complaint: "Жалоба",
  moderation: "Модерация",
  crm_sync: "Обновление расписания",
  stuck_homework: "Проверка ДЗ",
  stuck_report: "Отчёт урока",
  reward_correction: "Награда",
  parent_access: "Доступ родителя",
};

const sourceLabels: Record<AdminJournalSource, string> = {
  application: "Приложение",
  crm: "CRM",
  system: "Система",
  moderation: "Модерация",
};

const actionLabels: Record<string, string> = {
  created: "Запись создана",
  status_changed: "Статус изменён",
  auto_resolved: "Закрыто системой",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function ageLabel(minutes: number) {
  if (minutes < 60) return `${minutes} мин`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)} ч`;
  return `${Math.floor(minutes / 1_440)} дн`;
}

function JournalRow({ entry, onChanged }: { entry: AdminJournalEntry; onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState<AdminJournalStatus>(entry.status);
  const [resolution, setResolution] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const severity = severityMeta[entry.severity];
  const SeverityIcon = severity.icon;
  const finalStatus = nextStatus === "resolved" || nextStatus === "dismissed";
  const unchanged = nextStatus === entry.status;

  async function saveStatus() {
    if (unchanged) return;
    if (finalStatus && resolution.trim().length < 3) {
      setError("Укажите решение или причину");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await adminJournalApi.changeStatus(entry.id, {
        status: nextStatus,
        resolution: finalStatus ? resolution.trim() : undefined,
        idempotencyKey: crypto.randomUUID(),
      });
      setResolution("");
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось изменить статус");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article data-testid="journal-entry" className="border-b border-stone-200 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 px-4 py-4 text-left transition hover:bg-stone-50 sm:gap-4 sm:px-5"
      >
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border ${severity.className}`} title={severity.label}>
          <SeverityIcon size={17} />
        </span>
        <span className="min-w-0">
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <strong className="break-words text-sm leading-5 text-ink sm:text-base">{entry.title}</strong>
            <span className={`rounded-md border px-2 py-1 text-[10px] font-black uppercase ${statusMeta[entry.status].className}`}>
              {statusMeta[entry.status].label}
            </span>
          </span>
          <span className="mt-1.5 block break-words text-xs leading-5 text-stone-500 sm:text-sm">{entry.summary}</span>
          <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-bold text-stone-400">
            <span>{typeLabels[entry.type]}</span>
            <span>{sourceLabels[entry.source]}</span>
            <span className="inline-flex items-center gap-1"><Clock3 size={12} /> {ageLabel(entry.ageMinutes)}</span>
          </span>
        </span>
        {open ? <ChevronUp size={18} className="mt-2 text-stone-400" /> : <ChevronDown size={18} className="mt-2 text-stone-400" />}
      </button>

      {open ? (
        <div className="border-t border-stone-100 bg-stone-50 px-4 py-5 sm:px-5" data-testid="journal-entry-details">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.72fr)]">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-black uppercase text-stone-500">
                <History size={15} /> История решений
              </div>
              <ol className="mt-3 divide-y divide-stone-200 border-y border-stone-200">
                {entry.actions.map((action) => (
                  <li key={action.id} className="py-3 text-xs leading-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong>{actionLabels[action.action] ?? action.action}</strong>
                      <time className="text-stone-400">{formatDate(action.createdAt)}</time>
                    </div>
                    <p className="mt-1 text-stone-500">
                      {action.actor?.displayName ?? "Система"}
                      {action.fromStatus && action.toStatus ? ` · ${statusMeta[action.fromStatus].label} → ${statusMeta[action.toStatus].label}` : ""}
                    </p>
                    {action.note ? <p className="mt-1 break-words font-medium text-stone-700">{action.note}</p> : null}
                  </li>
                ))}
              </ol>
            </div>

            <div className="min-w-0 border-t border-stone-200 pt-5 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
              <label className="block text-xs font-black uppercase text-stone-500" htmlFor={`status-${entry.id}`}>Статус</label>
              <select
                id={`status-${entry.id}`}
                value={nextStatus}
                onChange={(event) => {
                  setNextStatus(event.target.value as AdminJournalStatus);
                  setError(null);
                }}
                className="mt-2 min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm font-bold outline-none focus:border-gold"
              >
                {Object.entries(statusMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
              </select>
              {finalStatus ? (
                <label className="mt-4 block text-xs font-black uppercase text-stone-500" htmlFor={`resolution-${entry.id}`}>
                  Решение или причина
                  <textarea
                    id={`resolution-${entry.id}`}
                    value={resolution}
                    onChange={(event) => setResolution(event.target.value)}
                    rows={3}
                    maxLength={5_000}
                    placeholder="Что проверили и как решили"
                    className="mt-2 block w-full resize-y rounded-lg border border-stone-300 bg-white p-3 text-sm font-medium normal-case outline-none focus:border-gold"
                  />
                </label>
              ) : null}
              {error ? <p role="alert" className="mt-3 text-xs font-bold text-red-700">{error}</p> : null}
              <button
                type="button"
                onClick={saveStatus}
                disabled={busy || unchanged}
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                Сохранить статус
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export default function AdminJournalPage() {
  const [status, setStatus] = useState<AdminJournalStatus | "">("");
  const [type, setType] = useState<AdminJournalType | "">("");
  const [severity, setSeverity] = useState<AdminJournalSeverity | "">("");
  const [source, setSource] = useState<AdminJournalSource | "">("");
  const resource = useApiResource(
    () => adminJournalApi.list({
      status: status || undefined,
      type: type || undefined,
      severity: severity || undefined,
      source: source || undefined,
      limit: 100,
    }),
    [status, type, severity, source],
  );

  if (resource.loading && !resource.data) return <LoadingState label="Загружаем административный журнал" />;
  if (resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!resource.data) return null;
  const data = resource.data;

  return (
    <>
      <PageHeader
        eyebrow="Контроль школы"
        title="Журнал"
        description="Ошибки обмена с расписанием, изменения родительского доступа и история решений команды."
        action={(
          <button type="button" onClick={() => void resource.reload()} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-4 text-sm font-bold sm:w-auto">
            <RefreshCw size={16} /> Обновить
          </button>
        )}
      />

      <section aria-label="Счётчики журнала" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(Object.keys(statusMeta) as AdminJournalStatus[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatus((current) => current === value ? "" : value)}
            aria-pressed={status === value}
            className={`min-w-0 rounded-lg border p-3 text-left transition ${status === value ? "border-ink bg-ink text-white" : "border-stone-200 bg-white hover:border-stone-400"}`}
          >
            <strong className="block text-2xl">{data.counts[value]}</strong>
            <span className={`mt-1 block truncate text-xs font-bold ${status === value ? "text-white/70" : "text-stone-500"}`}>{statusMeta[value].label}</span>
          </button>
        ))}
      </section>

      <section className="mt-5 border-y border-stone-200 py-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-stone-500"><ListFilter size={15} /> Фильтры</div>
        <div className="grid gap-2 sm:grid-cols-3">
          <select aria-label="Тип записи" value={type} onChange={(event) => setType(event.target.value as AdminJournalType | "")} className="min-h-11 min-w-0 rounded-lg border border-stone-300 bg-white px-3 text-sm font-bold">
            <option value="">Все типы</option>
            {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select aria-label="Важность" value={severity} onChange={(event) => setSeverity(event.target.value as AdminJournalSeverity | "")} className="min-h-11 min-w-0 rounded-lg border border-stone-300 bg-white px-3 text-sm font-bold">
            <option value="">Любая важность</option>
            {Object.entries(severityMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
          </select>
          <select aria-label="Источник" value={source} onChange={(event) => setSource(event.target.value as AdminJournalSource | "")} className="min-h-11 min-w-0 rounded-lg border border-stone-300 bg-white px-3 text-sm font-bold">
            <option value="">Все источники</option>
            {Object.entries(sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </section>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-stone-600">Показано: {data.items.length}</p>
        {status || type || severity || source ? (
          <button type="button" onClick={() => { setStatus(""); setType(""); setSeverity(""); setSource(""); }} className="inline-flex items-center gap-2 text-sm font-bold text-stone-600 hover:text-ink">
            <CheckCircle2 size={15} /> Сбросить фильтры
          </button>
        ) : null}
      </div>

      {data.items.length ? (
        <section aria-label="Записи журнала" className="mt-3 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
          {data.items.map((entry) => (
            <JournalRow key={entry.id} entry={entry} onChanged={resource.reload} />
          ))}
        </section>
      ) : (
        <div className="mt-3"><EmptyState title="Записей нет" description="По выбранным фильтрам журнал пуст." /></div>
      )}
    </>
  );
}
