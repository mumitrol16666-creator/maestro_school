"use client";

import { ArrowRight, BookOpenCheck, ListTodo, Target } from "lucide-react";
import Link from "next/link";
import { ScreenError } from "@/components/app-error-screen";
import { ProgressBar } from "@/components/progress-bar";
import { ScreenSkeleton } from "@/components/screen-skeleton";
import { SectorExamSummary } from "@/components/sector-exam-summary";
import { SectorProposalSection, sectorProposalDirections } from "@/components/sector-proposals";
import { StudentBannersLink } from "@/components/student-banners";
import { UnifiedTaskCard } from "@/components/unified-task-card";
import { useApiResource } from "@/hooks/use-api-resource";
import { learningTaskContext } from "@/lib/learning-overview";
import { formatOutOf, pluralize } from "@/lib/plural";
import { sectorTitle } from "@/lib/sector-label";
import { formatExamDate } from "@/lib/sector-exams-api";
import { invalidateStudentHome, loadStudentHome } from "@/lib/student-home";
import type { StudentHomeMonthlyPlan } from "@/types/api";
import type { UnifiedTask } from "@/types/unified-tasks";

const linkStyle = "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold text-amber-800 transition-colors hover:bg-amber-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-700";

export default function LearningWorkspacePage() {
  // Plan 2.1: «Обучение» reads the same home as «Сейчас»: sector, tasks and proposals in one request.
  const resource = useApiResource(() => loadStudentHome(), []);

  if (resource.loading && !resource.data) return <ScreenSkeleton variant="list" label="Загружаем сектор и задания" />;
  if (!resource.data) {
    return <ScreenError message={resource.error} code={resource.errorCode} retry={() => { invalidateStudentHome(); return resource.reload(); }} />;
  }

  const home = resource.data;
  const tasks = home.tasks;
  const plans = home.monthlyPlans;
  const nextTask = tasks?.items.find((task) => task.actionRequired) ?? null;
  // A student the school has not linked has no school data to miss. A home saved on the phone
  // before this field (up to 12 hours) or an older server only says `school: null`.
  const schoolMissing = home.schoolStatus
    ? home.schoolStatus === "unavailable" || home.schoolStatus === "failed"
    : !home.school;
  const partial = !tasks || tasks.partial || schoolMissing;
  const pendingCount = tasks?.counts.actionRequired ?? 0;
  const waitingCount = tasks?.counts.waitingReview ?? 0;
  // Plan 5.3: the same homework from two CRM lessons is one task to the child.
  const seen = new Set<string>([nextTask ? `${nextTask.title}|${nextTask.descriptionPreview}` : ""]);
  const otherTasks = (tasks?.items ?? [])
    .filter((task) => task.id !== nextTask?.id)
    .filter((task) => {
      const key = `${task.title}|${task.descriptionPreview}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);

  return (
    <div className="mx-auto max-w-6xl" data-testid="learning-overview">
      <header className="mb-6">
        <p className="text-xs font-black uppercase tracking-wide text-amber-800">Моё обучение</p>
        <h1 className="font-display mt-2 text-4xl leading-tight text-ink">Обучение</h1>
        <p className="mt-2 text-sm leading-6 text-stone-600">Сектор, задания и твои предложения преподавателю.</p>
      </header>

      <StudentBannersLink banners={home.banners ?? []} total={home.bannersTotal} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <section className="flex min-w-0 flex-col rounded-xl border border-ink bg-ink p-5 text-white sm:p-7" aria-labelledby="learning-focus-title">
          <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wide text-gold-ink">
            <BookOpenCheck size={17} aria-hidden="true" /> {nextTask ? "Задание" : "Задания"}
          </p>
          <h2 id="learning-focus-title" className="font-display mt-4 break-words text-2xl leading-tight sm:text-3xl">
            {nextTask?.title ?? (partial ? "Проверим ваши задания" : waitingCount ? "Задания на проверке" : "Незавершённых заданий нет")}
          </h2>
          {nextTask ? <TaskDetails task={nextTask} /> : (
            <p className="mt-3 text-sm leading-6 text-stone-300">
              {partial ? "Часть данных недоступна. Нельзя сказать, что все задания выполнены."
                : waitingCount ? "Преподаватель проверит задания на уроке."
                : "Когда появится новое задание, вы увидите его здесь."}
            </p>
          )}
          <div className="mt-6 pt-1">
            <Link
              href={nextTask?.target.href ?? "/tasks"}
              className="inline-flex min-h-11 w-full items-center justify-center gap-3 rounded-lg bg-gold px-5 py-3 text-sm font-black text-ink transition-colors hover:bg-[#d4aa55] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:w-auto"
            >
              {nextTask ? "Открыть задание" : "Открыть задания"} <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </section>
        <SectorCard plans={plans} />
      </div>

      <section className="mt-4 min-w-0 rounded-xl border border-stone-200 bg-white p-5 sm:p-6" aria-labelledby="learning-tasks-title">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <ListTodo size={24} className="mt-1 shrink-0 text-stone-500" aria-hidden="true" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h2 id="learning-tasks-title" className="font-display text-2xl text-ink">Задания</h2>
                {tasks && <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700" data-testid="learning-task-count">
                  {pendingCount} {pluralize(pendingCount, ["незавершённое", "незавершённых", "незавершённых"])}{partial ? " · данные неполные" : ""}
                </span>}
                {waitingCount > 0 && <span className="text-xs font-semibold text-blue-800">Проверит на уроке: {waitingCount}</span>}
              </div>
              <p className="mt-1 text-sm leading-6 text-stone-600">
                {partial ? "Показаны только доступные задания. Полный список пока не загружен."
                  : "Домашние задания уроков и курсов и тесты по теории."}
              </p>
            </div>
          </div>
          <Link href="/tasks" className={linkStyle}>Все задания <ArrowRight size={17} aria-hidden="true" /></Link>
        </div>
        {otherTasks.length ? (
          <div className="mt-4 grid gap-3" data-testid="learning-task-list">
            {otherTasks.map((task) => <UnifiedTaskCard key={task.id} task={task} />)}
          </div>
        ) : null}
      </section>

      <SectorProposalSection
        directions={sectorProposalDirections(plans)}
        proposals={home.sectorProposals}
        onCreated={() => invalidateStudentHome()}
      />

      {partial && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-950" role="status">
          <span>Не всё удалось загрузить. Доступные данные сохранены на экране.</span>
          <button type="button" onClick={() => { invalidateStudentHome(); void resource.reload(); }} className={linkStyle}>Обновить данные</button>
        </div>
      )}
    </div>
  );
}

/**
 * The open sectors in brief. Same split as on «Сейчас»: progress counts the current sectors only;
 * a sector waiting for its exam is a line of its own, not part of the percent.
 */
function SectorCard({ plans }: { plans: StudentHomeMonthlyPlan[] }) {
  const open = plans.filter((plan) => plan.status !== "closed");
  const active = open.filter((plan) => plan.status !== "awaiting_exam");
  const waiting = open.filter((plan) => plan.status === "awaiting_exam");
  // With nothing current the waiting sector is what is left to show.
  const shown = active.length ? active : waiting;
  const first = shown[0] ?? null;
  const completed = active.reduce((total, plan) => total + plan.progress.completed, 0);
  const total = active.reduce((total, plan) => total + plan.progress.total, 0);
  const percent = total ? Math.round((completed / total) * 100) : 0;
  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-stone-200 bg-white p-5 sm:p-7" aria-labelledby="learning-plan-title" data-testid="learning-sector-card">
      <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wide text-amber-800">
        <Target size={17} aria-hidden="true" /> {shown.length === 1 ? sectorTitle(first!, "student") : shown.length ? "Мои сектора" : "Сектор"}
      </p>
      <h2 id="learning-plan-title" className="font-display mt-4 break-words text-2xl leading-tight sm:text-3xl">
        {first
          ? (shown.length === 1
            ? (first.status === "awaiting_exam" ? "Ждёт экзамена" : first.goal || "Темы сектора")
            : `${shown.length} ${pluralize(shown.length, ["открытый сектор", "открытых сектора", "открытых секторов"])}`)
          : "Сектор ещё не открыт"}
      </h2>
      {active.length ? (
        <div className="mt-4">
          <ProgressBar value={percent} />
          <p className="mt-2 text-xs font-semibold text-stone-500">{formatOutOf(completed, total, ["темы", "тем", "тем"])} закрыто</p>
        </div>
      ) : !first ? <p className="mt-3 text-sm leading-6 text-stone-600">Темы появятся, когда преподаватель откроет сектор.</p> : null}
      {waiting.map((plan) => (
        <Link
          key={plan.id}
          href={`/monthly-plan?sector=${encodeURIComponent(plan.id)}`}
          data-testid="learning-sector-awaiting-exam"
          className="mt-3 flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-lg bg-sky-50 px-3 py-2 text-sm font-bold text-sky-950"
        >
          <span className="min-w-0 break-words">
            {sectorTitle(plan, "student")} ждёт экзамена{plan.exam?.status === "scheduled" && plan.exam.scheduledAt ? ` · ${formatExamDate(plan.exam.scheduledAt)}` : ""}
          </span>
          <ArrowRight size={16} className="shrink-0" aria-hidden="true" />
        </Link>
      ))}
      {open.map((plan) => plan.exam ? <SectorExamSummary key={plan.id} exam={plan.exam} /> : null)}
      <div className="mt-auto pt-5">
        <Link href="/monthly-plan" className={linkStyle}>Открыть сектор <ArrowRight size={17} aria-hidden="true" /></Link>
      </div>
    </section>
  );
}

function TaskDetails({ task }: { task: UnifiedTask }) {
  const context = learningTaskContext(task);
  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-white/15 px-3 py-1 text-stone-100">{context.label}</span>
        {context.date && <span className="text-stone-300">{context.date}</span>}
      </div>
      <p className="mt-4 break-words text-sm leading-6 text-stone-200 line-clamp-3">
        {task.descriptionPreview || "Откройте задание, чтобы посмотреть материалы и результат проверки."}
      </p>
      {task.context.teacherName && <p className="mt-2 break-words text-xs leading-5 text-stone-400">{task.context.teacherName}</p>}
    </>
  );
}
