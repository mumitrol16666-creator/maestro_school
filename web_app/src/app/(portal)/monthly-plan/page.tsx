"use client";

import {
  CheckCircle2,
  ExternalLink,
  History,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ScreenError } from "@/components/app-error-screen";
import { EmptyState } from "@/components/data-states";
import { SectorStatistics } from "@/components/sector-statistics";
import { SectorProgressOverview } from "@/components/sector-progress-overview";
import { SectorTopicList } from "@/components/sector-topic-list";
import { ScreenSkeleton } from "@/components/screen-skeleton";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api-client";
import type { StudentHomeMonthlyPlan } from "@/types/api";
import type { SectorProposal } from "@/types/teacher-students";
import { GroupSectorPassBadge, SectorExamSummary } from "@/components/sector-exam-summary";
import { SectorSwitch } from "@/components/sector-switch";
import { useSectorChoice } from "@/hooks/use-sector-choice";
import { groupOpenSectorsByDirection } from "@/lib/sector-switch";
import { sectorTitle } from "@/lib/sector-label";
import { SectorProposalSection, sectorProposalDirections } from "@/components/sector-proposals";
import { sameSiteMediaUrl } from "@/lib/media-url";
import { materialsApi } from "@/lib/materials-api";
import { formatOutOf } from "@/lib/plural";

const TOPICS_GENITIVE = ["темы", "тем", "тем"] as const;


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
  // Uploaded files are same-site paths (plan 1.12); old absolute ones are turned into paths too.
  const sameSite = sameSiteMediaUrl(value);
  if (sameSite.startsWith("/api/v1/media/")) return sameSite;
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
  const directions = sectorProposalDirections(active);
  const choice = useSectorChoice();
  // 07.11: a direction may have two personal open sectors — the current one and the one waiting for its exam.
  const blocks = groupOpenSectorsByDirection(active).map((block) => ({
    ...block,
    shown: choice.pick(block.key, block.personal),
  }));
  const shown = blocks.flatMap((block) => [...(block.shown ? [block.shown] : []), ...block.group]);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-stone-200 pb-6">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-gold-ink">Учебный маршрут</p>
          <h1 className="font-display mt-2 text-3xl leading-tight sm:text-4xl">
            {shown.length === 1 ? sectorTitle(shown[0]!, "student") : shown.length > 1 ? "Мои сектора" : "Мой сектор"}
          </h1>
        </div>
        <div className="min-w-[220px] max-w-sm flex-1 sm:flex-none">
          <button
            type="button"
            onClick={() => setShowHistory((value) => !value)}
            className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-xs font-bold text-stone-500 hover:text-ink"
          >
            <History size={14} /> {showHistory ? "Скрыть закрытые секторы" : "Закрытые секторы"}
          </button>
        </div>
      </header>

      {resource.loading && !resource.data ? (
        <div className="mt-7"><ScreenSkeleton variant="section" label="Открываем сектор" /></div>
      ) : !resource.data ? (
        <div className="mt-7">
          {resource.errorCode === "CRM_NOT_LINKED" ? (
            <EmptyState
              title="Профиль школы не подключён"
              description="Обратись к администратору школы. После подключения здесь появится сектор."
            />
          ) : (
            <ScreenError message={resource.error} code={resource.errorCode} retry={resource.reload} />
          )}
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
          {blocks.map((block) => (
            <div key={block.key} className="grid gap-5">
              <SectorSwitch
                sectors={block.personal}
                selectedId={block.shown?.id}
                onSelect={(id) => choice.select(block.key, id)}
                audience="student"
                label={`Секторы направления ${block.title}`}
              />
              {block.shown ? <SectorDetails plan={block.shown} hasCurrent={block.personal.some((plan) => plan.status !== "awaiting_exam")} /> : null}
              {block.group.map((plan) => <SectorDetails key={plan.id} plan={plan} />)}
            </div>
          ))}
        </div>
      )}

      <SectorStatistics endpoint="/students/me/sector-statistics" />

      {showHistory && (resource.data || !resource.error) ? (
        <section className="mt-8">
          <h2 className="font-display text-2xl text-ink">Закрытые секторы</h2>
          {resource.loading && !closed.length ? (
            <div className="mt-4"><ScreenSkeleton variant="section" label="Открываем закрытые секторы" /></div>
          ) : !closed.length && resource.error ? (
            <div className="mt-3 flex flex-wrap items-center gap-3" role="alert">
              <p className="text-sm font-semibold text-red-700">Не получилось загрузить закрытые секторы</p>
              <button
                type="button"
                onClick={() => void resource.reload()}
                className="inline-flex min-h-11 items-center rounded-lg border border-stone-200 bg-white px-4 text-sm font-bold text-ink"
              >
                Повторить
              </button>
            </div>
          ) : !closed.length ? (
            <p className="mt-3 text-sm text-stone-500">Закрытых секторов пока нет.</p>
          ) : (
            <div className="mt-4 grid gap-3">
              {closed.map((plan) => (
                <article key={plan.id} className="min-w-0 rounded-lg border border-stone-200 bg-white px-4 py-3">
                  <div className="flex items-center gap-4">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-50 text-sm font-black text-emerald-800">{plan.sequence}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-ink">{plan.goal}</p>
                      <p className="text-xs text-stone-500">
                        {plan.scope === "group" ? `${sectorTitle(plan, "student")} · ` : ""}{plan.direction?.title ? `${plan.direction.title} · ` : ""}{formatOutOf(plan.progress.completed, plan.progress.total, TOPICS_GENITIVE)}
                        {plan.closedAt ? ` · закрыт ${formatDate(plan.closedAt)}` : ""}
                      </p>
                    </div>
                    <CheckCircle2 size={18} className="text-emerald-600" />
                  </div>
                  <GroupSectorPassBadge pass={plan.memberPass} />
                  <SectorExamSummary exam={plan.exam} />
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <SharedLessonsSection />

      <SectorProposalSection
        directions={directions}
        proposals={proposals.data ?? []}
        onCreated={() => void proposals.reload()}
      />
    </div>
  );
}

function SectorDetails({ plan, hasCurrent = false }: { plan: StudentHomeMonthlyPlan; hasCurrent?: boolean }) {
  return (
    <article className="rounded-lg border border-stone-200 bg-white p-5 shadow-soft sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-stone-500">
            {plan.scope === "group" ? <Users size={14} aria-hidden="true" /> : null}
            <span>{sectorTitle(plan, "student")}</span>
            {plan.direction?.title ? <span className="text-amber-800">{plan.direction.title}</span> : null}
          </div>
          <h2 className="font-display mt-2 break-words text-2xl leading-tight text-ink sm:text-3xl">{plan.goal}</h2>
          <p className="mt-2 text-sm font-semibold text-stone-500">
            {plan.teacher.name || "Преподаватель Maestro"}
          </p>
        </div>
      </div>

      <SectorProgressOverview plan={plan} />

      <GroupSectorPassBadge pass={plan.memberPass} />
      {plan.status === "awaiting_exam" ? (
        <p className="mt-5 rounded-lg bg-sky-50 px-4 py-3 text-sm font-bold text-sky-950" data-testid="sector-awaiting-exam">
          {hasCurrent ? "Ждёт экзамена. Ты уже занимаешься в следующем секторе, а этот сдашь на экзамене в школе." : "Ждёт экзамена. Этот сектор ты сдашь на экзамене в школе. Новый сектор преподаватель откроет после урока."}
        </p>
      ) : null}
      <SectorExamSummary exam={plan.exam} />

      {plan.expectedResult ? (
        <div className="mt-5 rounded-lg bg-stone-50 px-4 py-3">
          <p className="text-xs font-black uppercase tracking-wide text-stone-500">Результат сектора</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-stone-700">{plan.expectedResult}</p>
        </div>
      ) : null}

      <SectorTopicList items={plan.items} />

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

function PlanMaterial({
  material,
}: {
  material: NonNullable<StudentHomeMonthlyPlan["materials"]>[number];
}) {
  const href = supportedMaterialUrl(material.url);
  const className = "flex min-h-11 min-w-0 items-center gap-3 rounded-lg border border-stone-200 px-3 py-3 text-sm font-bold text-stone-700";
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


/** Plan 1.12: course lessons the teacher sent, newest first. */
function SharedLessonsSection() {
  const shares = useApiResource(() => materialsApi.studentShares().catch(() => []), []);
  const items = shares.data ?? [];
  if (!items.length) return null;
  return (
    <section className="mt-8" data-testid="sector-shared-lessons">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="font-display text-2xl text-ink">Уроки от преподавателя</h2>
        <Link href="/shared-lessons" className="inline-flex min-h-11 min-w-11 items-center justify-center text-sm font-bold text-gold-ink hover:underline">Все</Link>
      </div>
      <ul className="mt-3 grid gap-2">
        {items.slice(0, 3).map((share) => (
          <li key={share.id}>
            <Link href={`/shared-lessons/${share.id}`} className="flex min-h-14 min-w-0 items-center gap-3 rounded-lg border border-stone-200 bg-white px-4 py-3 transition hover:border-amber-300">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-ink">{share.lesson.title}</span>
                <span className="block truncate text-xs text-stone-500">{share.lesson.courseTitle}</span>
              </span>
              {!share.viewedAt ? <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-900">новое</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
