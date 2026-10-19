"use client";

import { CheckCircle2, ClipboardCheck, LoaderCircle, MessageSquareQuote, Plus, Sparkles, XCircle } from "lucide-react";
import { useState } from "react";
import { useApiResource } from "@/hooks/use-api-resource";
import { ApiError } from "@/lib/api-client";
import { teacherStudentsApi } from "@/lib/teacher-students-api";
import type { SectorHistoryEntry, SectorProposal, SectorTemplate } from "@/types/teacher-students";

const lineLabels = {
  melody: "Мелодия",
  chords: "Аккорды",
  theory: "Теория",
  song: "Песня",
  other: "Тема",
} as const;

function shortDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "Asia/Aqtobe" }).format(date);
}

/** Closed sectors of the owner in this direction, newest first. */
export function SectorHistoryList({ history }: { history: SectorHistoryEntry[] }) {
  return (
    <ul className="mt-4 divide-y divide-amber-200/60 rounded-2xl border border-amber-200/60 bg-white">
      {history.map((entry) => (
        <li key={entry.id} className="flex items-center gap-3 px-4 py-3 text-sm">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-50 text-xs font-black text-emerald-800">{entry.sequence}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold text-ink">{entry.goal || `Сектор ${entry.sequence}`}</p>
            <p className="text-xs text-stone-500">
              {entry.topicsCompleted} из {entry.topicsTotal} тем · {entry.closeReason === "completed" ? "закрыт" : "закрыт без завершения"} {shortDate(entry.closedAt)}
            </p>
          </div>
          <CheckCircle2 size={16} className={entry.closeReason === "completed" ? "text-emerald-600" : "text-stone-300"} />
        </li>
      ))}
    </ul>
  );
}

/** Opening a new sector: pick a published step of the programme or start empty. */
export function SectorTemplatePicker({
  crmDirectionId,
  onPick,
}: {
  crmDirectionId: string;
  onPick: (template: SectorTemplate) => void;
}) {
  const templates = useApiResource(() => teacherStudentsApi.sectorTemplates(crmDirectionId || undefined), [crmDirectionId]);
  const [picked, setPicked] = useState<string | null>(null);
  if (templates.loading) return <p className="mt-4 text-xs text-stone-500">Загружаем ступени программы…</p>;
  if (!templates.data?.length) {
    return (
      <p className="mt-4 rounded-xl border border-dashed border-amber-300 bg-white p-3 text-xs text-stone-600">
        Ступеней программы для этого направления пока нет — заполните сектор вручную.
      </p>
    );
  }
  return (
    <div className="mt-4 rounded-2xl border border-amber-200 bg-white p-4">
      <p className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-amber-900">
        <Sparkles size={14} className="text-gold-ink" /> Ступень программы
      </p>
      <p className="mt-1 text-[11px] text-stone-500">Темы ступени станут темами сектора, их можно править под ученика.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {templates.data.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => { setPicked(template.id); onPick(template); }}
            className={`rounded-xl border p-3 text-left transition ${picked === template.id ? "border-amber-500 bg-amber-50" : "border-stone-200 hover:border-amber-300"}`}
          >
            <p className="text-sm font-bold text-ink">{template.number}. {template.title}</p>
            <p className="mt-1 text-[11px] text-stone-500">
              {template.topics.length} тем
            </p>
            <p className="mt-1 truncate text-[11px] text-stone-400">
              {template.topics.slice(0, 4).map((topic) => `${lineLabels[topic.line]}: ${topic.title}`).join(" · ")}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Student proposals for this student: accept into the sector or decline with a reply. */
export function SectorProposalsPanel({
  crmStudentId,
  onAddTopic,
}: {
  crmStudentId: string;
  onAddTopic: (title: string) => void;
}) {
  const resource = useApiResource(() => teacherStudentsApi.sectorProposals({ crmStudentId }), [crmStudentId]);
  const [busy, setBusy] = useState<string | null>(null);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const open = (resource.data ?? []).filter((proposal) => proposal.status === "new");
  const decided = (resource.data ?? []).filter((proposal) => proposal.status !== "new").slice(0, 3);
  if (!open.length && !decided.length) return null;

  async function decide(proposal: SectorProposal, decision: "accepted" | "declined") {
    setBusy(proposal.id);
    setError(null);
    try {
      await teacherStudentsApi.decideSectorProposal(proposal.id, { decision, reply: replies[proposal.id] ?? null });
      if (decision === "accepted") onAddTopic(proposal.text);
      await resource.reload();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось сохранить решение");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
      <p className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-sky-900">
        <MessageSquareQuote size={14} /> Предложения ученика
      </p>
      {open.map((proposal) => (
        <div key={proposal.id} className="mt-3 rounded-xl border border-sky-200 bg-white p-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-stone-400">
            {proposal.kind === "song" ? "Песня" : proposal.kind === "goal" ? "Цель" : "Тема"} · {shortDate(proposal.createdAt)}
          </p>
          <p className="mt-1 text-sm font-semibold text-ink">{proposal.text}</p>
          {proposal.link ? <a href={proposal.link} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-sky-700 underline">{proposal.link}</a> : null}
          <input
            value={replies[proposal.id] ?? ""}
            onChange={(event) => setReplies((current) => ({ ...current, [proposal.id]: event.target.value }))}
            placeholder="Ответ ученику (обязателен при отказе)"
            className="mt-2 h-9 w-full rounded-lg bg-stone-50 px-3 text-xs outline-none focus:ring-2 focus:ring-sky-200"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy === proposal.id}
              onClick={() => void decide(proposal, "accepted")}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-ink px-3 text-xs font-bold text-white disabled:opacity-50"
            >
              {busy === proposal.id ? <LoaderCircle size={14} className="animate-spin" /> : <Plus size={14} />} В сектор
            </button>
            <button
              type="button"
              disabled={busy === proposal.id || !(replies[proposal.id] ?? "").trim()}
              onClick={() => void decide(proposal, "declined")}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 text-xs font-bold text-stone-700 disabled:opacity-50"
            >
              <XCircle size={14} /> Не сейчас
            </button>
          </div>
        </div>
      ))}
      {decided.length ? (
        <ul className="mt-3 space-y-1 text-xs text-stone-600">
          {decided.map((proposal) => (
            <li key={proposal.id} className="flex items-center gap-2">
              {proposal.status === "accepted" ? <ClipboardCheck size={13} className="text-emerald-600" /> : <XCircle size={13} className="text-stone-400" />}
              <span className="truncate">{proposal.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="mt-2 text-xs font-semibold text-red-700">{error}</p> : null}
    </div>
  );
}
