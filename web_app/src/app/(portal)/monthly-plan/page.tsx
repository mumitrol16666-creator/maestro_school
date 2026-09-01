"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  CircleDot,
  ExternalLink,
  Users,
  Target,
} from "lucide-react";
import Link from "next/link";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { ProgressBar } from "@/components/progress-bar";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api-client";
import type { StudentHomeMonthlyPlan } from "@/types/api";

const monthNames = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
];

const itemStatus = {
  planned: { label: "Запланировано", icon: Circle, className: "text-stone-500" },
  in_progress: { label: "В работе", icon: CircleDot, className: "text-amber-800" },
  completed: { label: "Выполнено", icon: CheckCircle2, className: "text-emerald-700" },
  moved: { label: "Перенесено", icon: Circle, className: "text-stone-400" },
} as const;

function monthTitle(month: string) {
  return monthNames[Number(month.slice(5, 7)) - 1] ?? "месяц";
}

function publishedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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

export default function MonthlyPlanPage() {
  const resource = useApiResource(() => api.studentMonthlyPlans(), []);

  if (resource.loading) {
    return <LoadingState label="Открываем ваш план месяца" />;
  }
  if (resource.error || !resource.data) {
    const message = resource.errorCode === "CRM_NOT_LINKED"
      ? "Профиль школы не подключён. Обратитесь к администратору Maestro."
      : resource.error ?? "Не удалось загрузить план месяца";
    return <ErrorState message={message} retry={resource.reload} />;
  }

  const { month, plans, aggregateProgress } = resource.data;
  if (!plans.length) {
    return (
      <EmptyState
        title={`План на ${monthTitle(month)} ещё не опубликован`}
        description="Преподаватель ещё не опубликовал план на этот месяц."
        action={(
          <Link href="/dashboard" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-bold text-white">
            <ArrowLeft size={16} /> На главную
          </Link>
        )}
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-stone-200 pb-6">
        <div>
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-bold text-stone-500 hover:text-ink">
            <ArrowLeft size={16} /> Главная
          </Link>
          <p className="mt-6 text-xs font-black uppercase tracking-[0.18em] text-gold">Учебный маршрут</p>
          <h1 className="font-display mt-2 text-4xl leading-tight sm:text-5xl">
            План на {monthTitle(month)}
          </h1>
        </div>
        <div className="min-w-[220px] max-w-sm flex-1 sm:flex-none">
          <div className="flex items-end justify-between gap-4">
            <span className="text-sm font-bold text-stone-600">
              {aggregateProgress.completed} из {aggregateProgress.total} выполнено
            </span>
            <strong className="text-2xl text-ink">{aggregateProgress.percent}%</strong>
          </div>
          <div className="mt-3"><ProgressBar value={aggregateProgress.percent} /></div>
        </div>
      </header>

      <div className="mt-7 grid gap-5">
        {plans.map((plan) => <PlanDetails key={plan.id} plan={plan} />)}
      </div>
    </div>
  );
}

function PlanDetails({ plan }: { plan: StudentHomeMonthlyPlan }) {
  return (
    <article className="rounded-lg border border-stone-200 bg-white p-5 shadow-soft sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-stone-500">
            {plan.scope === "group" ? <Users size={14} aria-hidden="true" /> : null}
            <span>{plan.scope === "group" ? "Групповой план" : "Индивидуальный план"}</span>
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
          Выполнено {plan.progress.completed} из {plan.progress.total}
          {plan.progress.inProgress ? `, в работе ${plan.progress.inProgress}` : ""}
        </p>
      </div>

      {plan.expectedResult ? (
        <div className="mt-5 rounded-lg bg-stone-50 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-stone-400">Результат месяца</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-stone-700">{plan.expectedResult}</p>
        </div>
      ) : null}

      <div className="mt-6 divide-y divide-stone-100 border-y border-stone-100">
        {plan.items.map((item) => {
          const status = itemStatus[item.status] ?? itemStatus.planned;
          const Icon = status.icon;
          return (
            <div key={item.id} className="flex items-start gap-3 py-4">
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
                <span className={`text-xs font-bold ${status.className}`}>{status.label}</span>
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

      {publishedAt(plan.publishedAt) ? (
        <p className="mt-6 text-xs font-semibold text-stone-400">
          План обновлён {publishedAt(plan.publishedAt)}
        </p>
      ) : null}
    </article>
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
