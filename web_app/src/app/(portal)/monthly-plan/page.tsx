"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  CircleDot,
  ClipboardCheck,
  ExternalLink,
  History,
  Lightbulb,
  LoaderCircle,
  Send,
  Users,
  Target,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { ProgressBar } from "@/components/progress-bar";
import { useApiResource } from "@/hooks/use-api-resource";
import { api, ApiError } from "@/lib/api-client";
import type { StudentHomeMonthlyPlan } from "@/types/api";
import type { SectorProposal } from "@/types/teacher-students";

const itemStatus = {
  planned: { label: "Запланировано", icon: Circle, className: "text-stone-500" },
  in_progress: { label: "В работе", icon: CircleDot, className: "text-amber-800" },
  completed: { label: "Выполнено", icon: CheckCircle2, className: "text-emerald-700" },
  moved: { label: "Заменена", icon: Circle, className: "text-stone-400" },
} as const;

const proposalKinds = [
  { value: "topic", label: "Тема" },
  { value: "song", label: "Песня" },
  { value: "goal", label: "Цель" },
] as const;

function formatDate(value: string | null | undefined, withTime = false) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "Asia/Aqtobe",
  }).format(date);
}

function supportedMaterialUrl(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && url.hostname ? url.toString() : null;
  } catch {
    return null;
  }
}

export default function SectorPage() {
  const [showHistory, setShowHistory] = useState(false);
  const resource = useApiResource(() => api.studentMonthlyPlans({ history: showHistory }), [showHistory]);
  const proposals = useApiResource(() => api.sectorProposals().catch(() => [] as SectorProposal[]), []);

  const plans = resource.data?.plans ?? [];
  const active = plans.filter((plan) => plan.status !== "closed");
  const closed = plans.filter((plan) => plan.status === "closed");
  const aggregateProgress = resource.data?.aggregateProgress ?? { completed: 0, total: 0, percent: 0 };
  const directions = Array.from(
    new Map(active.map((plan) => [plan.direction?.crmDirectionId ?? "", plan.direction])).entries(),
  ).filter(([id, direction]) => id && direction) as Array<[string, NonNullable<StudentHomeMonthlyPlan["direction"]>]>;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-stone-200 pb-6">
        <div>
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-bold text-stone-500 hover:text-ink">
            <ArrowLeft size={16} /> Главная
          </Link>
          <p className="mt-6 text-xs font-black uppercase tracking-[0.18em] text-gold-ink">Учебный маршрут</p>
          <h1 className="font-display mt-2 text-4xl leading-tight sm:text-5xl">
            {active.length === 1 && active[0]?.sequence ? `Сектор ${active[0].sequence}` : "Мой сектор"}
          </h1>
        </div>
        <div className="min-w-[220px] max-w-sm flex-1 sm:flex-none">
          {resource.data && active.length ? (
            <>
              <div className="flex items-end justify-between gap-4">
                <span className="text-sm font-bold text-stone-600">
                  {aggregateProgress.completed} из {aggregateProgress.total} тем закрыто
                </span>
                <strong className="text-2xl text-ink">{aggregateProgress.percent}%</strong>
              </div>
              <div className="mt-3"><ProgressBar value={aggregateProgress.percent} /></div>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => setShowHistory((value) => !value)}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-stone-500 hover:text-ink"
          >
            <History size={14} /> {showHistory ? "Скрыть закрытые секторы" : "Закрытые секторы"}
          </button>
        </div>
      </header>

      {resource.loading ? (
        <div className="mt-7"><LoadingState label="Открываем сектор" /></div>
      ) : resource.error || !resource.data ? (
        <div className="mt-7">
          <ErrorState
            message={resource.errorCode === "CRM_NOT_LINKED"
              ? "Профиль школы не подключён. Обратитесь к администратору Maestro."
              : resource.error ?? "Не удалось загрузить сектор"}
            retry={resource.reload}
          />
        </div>
      ) : !active.length ? (
        <div className="mt-7">
          <EmptyState
            title="Сектор ещё не открыт"
            description="Преподаватель откроет следующий сектор после урока. Пока можно предложить тему или песню ниже."
          />
        </div>
      ) : (
        <div className="mt-7 grid gap-5">
          {active.map((plan) => <SectorDetails key={plan.id} plan={plan} />)}
        </div>
      )}

      {showHistory ? (
        <section className="mt-8">
          <h2 className="font-display text-2xl text-ink">Закрытые секторы</h2>
          {!closed.length ? (
            <p className="mt-3 text-sm text-stone-500">Закрытых секторов пока нет.</p>
          ) : (
            <div className="mt-4 grid gap-3">
              {closed.map((plan) => (
                <article key={plan.id} className="flex items-center gap-4 rounded-lg border border-stone-200 bg-white px-4 py-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-50 text-sm font-black text-emerald-800">{plan.sequence}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">{plan.goal}</p>
                    <p className="text-xs text-stone-500">
                      {plan.direction?.title ? `${plan.direction.title} · ` : ""}{plan.progress.completed} из {plan.progress.total} тем
                      {plan.closedAt ? ` · закрыт ${formatDate(plan.closedAt)}` : ""}
                    </p>
                  </div>
                  <CheckCircle2 size={18} className="text-emerald-600" />
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <ProposalSection
        directions={directions}
        proposals={proposals.data ?? []}
        onCreated={() => void proposals.reload()}
      />
    </div>
  );
}

function SectorDetails({ plan }: { plan: StudentHomeMonthlyPlan }) {
  const test = plan.preparedTest;
  return (
    <article className="rounded-lg border border-stone-200 bg-white p-5 shadow-soft sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-stone-500">
            {plan.scope === "group" ? <Users size={14} aria-hidden="true" /> : null}
            <span>{plan.sequence ? `Сектор ${plan.sequence}` : "Сектор"}{plan.scope === "group" ? " · группа" : ""}</span>
            {plan.direction?.title ? <span className="text-amber-800">{plan.direction.title}</span> : null}
          </div>
          <h2 className="font-display mt-2 break-words text-3xl leading-tight text-ink">{plan.goal}</h2>
          <p className="mt-2 text-sm font-semibold text-stone-500">
            {plan.teacher.name || "Преподаватель Maestro"}
          </p>
        </div>
        <span className="inline-flex items-center gap-2 text-sm font-black text-amber-900">
          <Target size={17} /> {plan.progress.percent}%
        </span>
      </div>

      <div className="mt-5">
        <ProgressBar value={plan.progress.percent} />
        <p className="mt-2 text-xs font-semibold text-stone-500">
          Закрыто {plan.progress.completed} из {plan.progress.total} тем
          {plan.progress.inProgress ? `, в работе ${plan.progress.inProgress}` : ""}
        </p>
      </div>

      {test ? (
        <div className={`mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 ${test.passedAt ? "bg-emerald-50" : "bg-amber-50"}`}>
          <div className="flex items-center gap-2 text-sm font-semibold text-stone-800">
            <ClipboardCheck size={16} className={test.passedAt ? "text-emerald-700" : "text-amber-800"} />
            Тест сектора: {test.title}
            {test.passedAt ? <span className="text-xs text-emerald-700">· сдан {formatDate(test.passedAt)}</span> : null}
          </div>
          {!test.passedAt ? (
            <Link href={`/tests/${encodeURIComponent(test.id)}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-ink px-4 text-sm font-bold text-white">
              Сдать тест · +20 XP
            </Link>
          ) : null}
        </div>
      ) : null}

      {plan.expectedResult ? (
        <div className="mt-5 rounded-lg bg-stone-50 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-stone-400">Результат сектора</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-stone-700">{plan.expectedResult}</p>
        </div>
      ) : null}

      <div className="mt-6 divide-y divide-stone-100 border-y border-stone-100">
        {plan.items.map((item) => {
          const status = itemStatus[item.status] ?? itemStatus.planned;
          const Icon = status.icon;
          const transferred = item.state === "transferred" || item.state === "replaced";
          return (
            <div key={item.id} className={`flex items-start gap-3 py-4 ${transferred ? "opacity-60" : ""}`}>
              <Icon size={20} className={`mt-0.5 shrink-0 ${status.className}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-bold leading-6 text-stone-800">{item.title}</p>
                {item.masteryCriteria ? (
                  <p className="mt-1 break-words text-xs leading-5 text-stone-500">{item.masteryCriteria}</p>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                {typeof item.progressPercent === "number" ? (
                  <strong className={`block text-sm ${status.className}`}>{item.progressPercent}%</strong>
                ) : null}
                <span className={`text-xs font-bold ${status.className}`}>
                  {transferred ? "Заменена" : status.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {plan.materials?.length ? (
        <div className="mt-6">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-stone-400">Материалы</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {plan.materials.map((material) => <PlanMaterial key={material.id} material={material} />)}
          </div>
        </div>
      ) : null}

      {formatDate(plan.publishedAt, true) ? (
        <p className="mt-6 text-xs font-semibold text-stone-400">
          Сектор обновлён {formatDate(plan.publishedAt, true)}
        </p>
      ) : null}
    </article>
  );
}

function ProposalSection({
  directions,
  proposals,
  onCreated,
}: {
  directions: Array<[string, NonNullable<StudentHomeMonthlyPlan["direction"]>]>;
  proposals: SectorProposal[];
  onCreated: () => void;
}) {
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
      await api.createSectorProposal({ crmDirectionId: directionId, kind, text: text.trim(), link: link.trim() || null });
      setText("");
      setLink("");
      setDone(true);
      onCreated();
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
      {proposals.length ? (
        <ul className="mt-5 divide-y divide-sky-100 border-t border-sky-100">
          {proposals.slice(0, 10).map((proposal) => (
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

function PlanMaterial({
  material,
}: {
  material: NonNullable<StudentHomeMonthlyPlan["materials"]>[number];
}) {
  const href = supportedMaterialUrl(material.url);
  const className = "flex min-w-0 items-center gap-3 rounded-lg border border-stone-200 px-3 py-3 text-sm font-bold text-stone-700";
  const content = (
    <>
      <span className="min-w-0 flex-1 truncate">{material.title || material.note || "Материал"}</span>
      {href ? <ExternalLink size={15} className="shrink-0" aria-hidden="true" /> : null}
    </>
  );
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`${className} transition hover:border-amber-300 hover:text-ink`}
    >
      {content}
    </a>
  ) : <div className={className}>{content}</div>;
}
