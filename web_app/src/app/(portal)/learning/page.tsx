"use client";

import { ArrowRight, BookOpenCheck, ListTodo, Target } from "lucide-react";
import Link from "next/link";
import { ErrorState } from "@/components/data-states";
import { ProgressBar } from "@/components/progress-bar";
import { SectorExamSummary } from "@/components/sector-exam-summary";
import { SectorProposalSection, sectorProposalDirections } from "@/components/sector-proposals";
import { UnifiedTaskCard } from "@/components/unified-task-card";
import { useApiResource } from "@/hooks/use-api-resource";
import { learningTaskContext } from "@/lib/learning-overview";
import { sectorTitle } from "@/lib/sector-label";
import { invalidateStudentHome, loadStudentHome } from "@/lib/student-home";
import type { StudentHomeMonthlyPlan } from "@/types/api";
import type { UnifiedTask } from "@/types/unified-tasks";

const linkStyle = "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold text-amber-800 transition-colors hover:bg-amber-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-700";

export default function LearningWorkspacePage() {
  // Plan 2.1: «Обучение» reads the same home as «Сейчас»: sector, tasks and proposals in one request.
  const resource = useApiResource(() => loadStudentHome(), []);

  if (resource.loading) return (
    <div className="mx-auto max-w-6xl py-8" role="status" aria-live="polite" aria-busy="true">
      <p className="text-sm text-stone-600">Загружаем сектор и задания…</p>
    </div>
  );
  if (resource.error || !resource.data) {
    return <ErrorState message={resource.error ?? "Не удалось загрузить обучение"} retry={() => { invalidateStudentHome(); return resource.reload(); }} />;
  }

  const home = resource.data;
  const tasks = home.tasks;
  const plans = home.monthlyPlans;
  const nextTask = tasks?.items.find((task) => task.actionRequired) ?? null;
  const partial = !tasks || tasks.partial || !home.school;
  const pendingCount = tasks?.counts.actionRequired ?? 0;
  const waitingCount = tasks?.counts.waitingReview ?? 0;
  const otherTasks = (tasks?.items ?? []).filter((task) => task.id !== nextTask?.id).slice(0, 4);

  return (
    <div className="mx-auto max-w-6xl" data-testid="learning-overview">
      <header className="mb-6">
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-amber-800">Моё обучение</p>
        <h1 className="font-display mt-2 text-4xl leading-tight text-ink">Обучение</h1>
        <p className="mt-2 text-sm leading-6 text-stone-600">Сектор, задания и твои предложения преподавателю.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <section className="flex min-w-0 flex-col rounded-xl border border-ink bg-ink p-5 text-white sm:p-7" aria-labelledby="learning-focus-title">
          <p className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.13em] text-gold-ink">
            <BookOpenCheck size={17} aria-hidden="true" /> {nextTask ? "Задание" : "Задания"}
          </p>
          <h2 id="learning-focus-title" className="font-display mt-4 break-words text-2xl leading-tight sm:text-3xl">
            {nextTask?.title ?? (partial ? "Проверим ваши задания" : waitingCount ? "Задания на проверке" : "Незавершённых заданий нет")}
          </h2>
          {nextTask ? <TaskDetails task={nextTask} /> : (
            <p className="mt-3 text-sm leading-6 text-stone-300">
              {partial ? "Часть данных недоступна. Нельзя сказать, что все задания выполнены."
                : waitingCount ? "Ответ отправлен. Результат появится после проверки преподавателем."
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
                  {pendingCount} незавершённых{partial ? " · данные неполные" : ""}
                </span>}
                {waitingCount > 0 && <span className="text-xs font-semibold text-blue-800">На проверке: {waitingCount}</span>}
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

/** The open sectors in brief: goal, progress and the exam, with the way to the sector page. */
function SectorCard({ plans }: { plans: StudentHomeMonthlyPlan[] }) {
  const active = plans.filter((plan) => plan.status !== "closed");
  const first = active[0] ?? null;
  const completed = active.reduce((total, plan) => total + plan.progress.completed, 0);
  const total = active.reduce((total, plan) => total + plan.progress.total, 0);
  const percent = total ? Math.round((completed / total) * 100) : 0;
  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-stone-200 bg-white p-5 sm:p-7" aria-labelledby="learning-plan-title" data-testid="learning-sector-card">
      <p className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.13em] text-amber-800">
        <Target size={17} aria-hidden="true" /> {active.length === 1 ? sectorTitle(first!, "student") : active.length ? "Мои сектора" : "Сектор"}
      </p>
      <h2 id="learning-plan-title" className="font-display mt-4 break-words text-2xl leading-tight sm:text-3xl">
        {first ? (active.length === 1 ? first.goal || "Темы сектора" : `${active.length} открытых сектора`) : "Сектор ещё не открыт"}
      </h2>
      {first ? (
        <div className="mt-4">
          <ProgressBar value={percent} />
          <p className="mt-2 text-xs font-semibold text-stone-500">{completed} из {total} тем закрыто</p>
        </div>
      ) : <p className="mt-3 text-sm leading-6 text-stone-600">Темы появятся, когда преподаватель откроет сектор.</p>}
      {active.map((plan) => plan.exam ? <SectorExamSummary key={plan.id} exam={plan.exam} /> : null)}
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
