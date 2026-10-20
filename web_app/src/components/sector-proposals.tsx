"use client";

import { CheckCircle2, Circle, CircleDot, Lightbulb, LoaderCircle, Send } from "lucide-react";
import { useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { StudentHomeMonthlyPlan } from "@/types/api";
import type { SectorProposal } from "@/types/teacher-students";

const proposalKinds = [
  { value: "topic", label: "Тема" },
  { value: "song", label: "Песня" },
  { value: "goal", label: "Цель" },
] as const;

type ProposalDirection = [string, NonNullable<StudentHomeMonthlyPlan["direction"]>];

/** The directions of the student's open sectors a proposal can go to. */
export function sectorProposalDirections(plans: StudentHomeMonthlyPlan[]) {
  return Array.from(
    new Map(plans.filter((plan) => plan.status !== "closed").map((plan) => [plan.direction?.crmDirectionId ?? "", plan.direction])).entries(),
  ).filter(([id, direction]) => id && direction) as ProposalDirection[];
}

/**
 * Plan 2.2: «Предложить тему или песню» — on «Обучение» and on the sector page. The student sees
 * each proposal's status and the teacher's answer.
 */
export function SectorProposalSection({
  directions,
  proposals,
  onCreated,
}: {
  directions: ProposalDirection[];
  proposals: SectorProposal[];
  onCreated?: (proposal: SectorProposal) => void;
}) {
  // A sent proposal shows at once; the page does not reload under the form.
  const [sent, setSent] = useState<SectorProposal[]>([]);
  const shown = [...sent, ...proposals.filter((item) => !sent.some((own) => own.id === item.id))];
  const [kind, setKind] = useState<"topic" | "song" | "goal">("song");
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [crmDirectionId, setCrmDirectionId] = useState(directions[0]?.[0] ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const directionId = crmDirectionId || directions[0]?.[0] || "";

  async function submit() {
    if (!text.trim() || !directionId || sending) return;
    setSending(true);
    setError(null);
    try {
      const created = await api.createSectorProposal({ crmDirectionId: directionId, kind, text: text.trim(), link: link.trim() || null });
      setSent((current) => [created, ...current]);
      setText("");
      setLink("");
      setDone(true);
      onCreated?.(created);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Не удалось отправить предложение");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="mt-8 rounded-lg border border-sky-200 bg-sky-50/50 p-5 sm:p-7">
      <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-sky-900">
        <Lightbulb size={15} /> Предложить в сектор
      </p>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        Хочешь разобрать песню или тему? Напиши — преподаватель добавит её в сектор или ответит, когда до неё дойдём.
      </p>
      {!directions.length ? (
        <p className="mt-3 text-xs font-semibold text-stone-500">Предложения появятся, когда преподаватель откроет первый сектор.</p>
      ) : (
        <div className="mt-4 grid gap-3">
          <div className="flex flex-wrap gap-2">
            {proposalKinds.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setKind(option.value)}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold ${kind === option.value ? "border-sky-700 bg-sky-700 text-white" : "border-stone-300 bg-white text-stone-700"}`}
              >
                {option.label}
              </button>
            ))}
            {directions.length > 1 ? (
              <select
                value={directionId}
                onChange={(event) => setCrmDirectionId(event.target.value)}
                className="ml-auto h-9 rounded-lg border border-stone-300 bg-white px-2 text-xs font-bold"
              >
                {directions.map(([id, direction]) => <option key={id} value={id}>{direction.title}</option>)}
              </select>
            ) : null}
          </div>
          <textarea
            value={text}
            onChange={(event) => { setText(event.target.value); setDone(false); }}
            rows={3}
            maxLength={2000}
            placeholder={kind === "song" ? "Например: «Кукла колдуна» — Король и Шут" : kind === "goal" ? "Например: научиться играть перебором" : "Например: баррэ на F"}
            className="w-full rounded-lg border border-stone-200 bg-white p-3 text-sm font-semibold text-ink outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
          />
          <input
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="Ссылка на видео или разбор (необязательно)"
            className="h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none focus:border-sky-400"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={sending || !text.trim()}
              onClick={() => void submit()}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-ink px-5 text-sm font-bold text-white disabled:opacity-50"
            >
              {sending ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />} Отправить преподавателю
            </button>
            {done ? <span className="text-xs font-bold text-emerald-700">Отправлено</span> : null}
            {error ? <span className="text-xs font-bold text-red-700">{error}</span> : null}
          </div>
        </div>
      )}
      {shown.length ? (
        <ul className="mt-5 divide-y divide-sky-100 border-t border-sky-100">
          {shown.slice(0, 10).map((proposal) => (
            <li key={proposal.id} className="flex items-start gap-3 py-3">
              {proposal.status === "accepted"
                ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                : proposal.status === "declined"
                  ? <Circle size={16} className="mt-0.5 shrink-0 text-stone-300" />
                  : <CircleDot size={16} className="mt-0.5 shrink-0 text-sky-700" />}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-stone-800">{proposal.text}</p>
                <p className="text-xs text-stone-500">
                  {proposal.status === "accepted" ? "Принято в сектор" : proposal.status === "declined" ? "Пока нет" : "Ждёт ответа преподавателя"}
                  {proposal.teacherReply ? ` · ${proposal.teacherReply}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

