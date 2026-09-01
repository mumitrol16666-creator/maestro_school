"use client";

import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  CircleDot,
  Clock3,
  GraduationCap,
  ListTodo,
  RotateCcw,
  Target,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { ProgressBar } from "@/components/progress-bar";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api-client";
import { homeworkStatisticsApi } from "@/lib/homework-statistics-api";
import { aqtobeMonthKey, formatMonthKey } from "@/lib/school-month";
import type { UnifiedTask } from "@/types/unified-tasks";

export default function LearningWorkspacePage() {
  const { user } = useAuth();
  const homeworkFlowV2 = Boolean(user?.productFeatures?.homeworkFlowV2);
  const resource = useApiResource(async () => {
    const month = aqtobeMonthKey();
    const [plans, tasks, homeworkStatistics] = await Promise.all([
      api.studentMonthlyPlans(),
      api.studentTasks({ scope: "active", limit: 12 }),
      homeworkFlowV2
        ? homeworkStatisticsApi.student({ month }).catch(() => null)
        : Promise.resolve(null),
    ]);
    return { plans, tasks, homeworkStatistics, month };
  }, [homeworkFlowV2]);

  if (resource.loading) return <LoadingState label="Собираем текущее обучение" />;
  if (resource.error || !resource.data) {
    return <ErrorState message={resource.error ?? "Не удалось открыть обучение"} retry={resource.reload} />;
  }

  const { plans, tasks, homeworkStatistics, month } = resource.data;
  const activeTasks = tasks.data.items.filter((task) => task.actionRequired).slice(0, 4);
  const activeTopics = plans.plans
    .flatMap((plan) => plan.items
      .filter((item) => item.state !== "moved" && item.status !== "completed")
      .map((item) => ({
        ...item,
        planId: plan.id,
        planGoal: plan.goal,
        direction: plan.direction?.title ?? null,
      })))
    .sort((left, right) => Number(right.status === "in_progress") - Number(left.status === "in_progress"));
  const nextTask = activeTasks[0] ?? null;
  const remainingTasks = nextTask ? activeTasks.slice(1) : activeTasks;
  const leadTopic = activeTopics[0] ?? null;
  const assignedHomework = homeworkStatistics?.totals.assigned ?? 0;
  const acceptedHomework = homeworkStatistics?.totals.accepted ?? 0;
  const homeworkProgress = assignedHomework > 0
    ? Math.round((acceptedHomework / assignedHomework) * 100)
    : 0;

  return (
    <div className="mx-auto max-w-7xl">
      <header className="grid gap-6 border-b border-stone-200/80 pb-7 lg:grid-cols-[minmax(0,1fr)_minmax(460px,0.82fr)] lg:items-end">
        <div className="min-w-0">
          <p className="section-eyebrow text-xs font-black uppercase text-gold">Учебный маршрут</p>
          <h1 className="font-display mt-2 text-4xl leading-none text-ink sm:text-5xl">Обучение</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-stone-500">
            Всё важное на сегодня: следующий шаг, темы месяца и домашняя работа.
          </p>
        </div>

        <section className="grid grid-cols-3 divide-x divide-stone-200 border-y border-stone-200" aria-label="Краткая сводка обучения">
          <Summary href="/monthly-plan" icon={Target} label="Темы" value={activeTopics.length} />
          <Summary href="/tasks" icon={ListTodo} label="Сделать" value={tasks.data.counts.actionRequired} tone="text-red-700" />
          <Summary href="/tasks" icon={Clock3} label="Проверка" value={tasks.data.counts.waitingReview} tone="text-blue-700" />
        </section>
      </header>

      <LearningFocus task={nextTask} topic={leadTopic} />

      <div className="mt-10 grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <section className="min-w-0" aria-labelledby="current-topics-title">
          <SectionHeading
            icon={Target}
            eyebrow="Сейчас в плане"
            title="Текущие темы"
            id="current-topics-title"
            href="/monthly-plan"
            action="Весь план"
          />

          {activeTopics.length ? (
            <div className="mt-4 divide-y divide-stone-200 border-y border-stone-200">
              {activeTopics.slice(0, 4).map((topic) => {
                const inProgress = topic.status === "in_progress";
                const percent = topic.progressPercent == null ? 0 : Math.max(0, Math.min(100, Math.round(topic.progressPercent)));
                return (
                  <article key={`${topic.planId}:${topic.id}`} className="grid min-w-0 gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_150px] sm:items-center sm:gap-5">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        {inProgress ? <CircleDot size={17} className="shrink-0 text-gold" /> : <CheckCircle2 size={17} className="shrink-0 text-stone-300" />}
                        <h3 className="truncate text-sm font-bold text-ink sm:text-base">{topic.title}</h3>
                      </div>
                      <p className="mt-1 truncate pl-6 text-xs text-stone-500">
                        {[topic.direction, topic.planGoal].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="min-w-0 pl-6 sm:pl-0">
                      <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-bold text-stone-500">
                        <span>{inProgress ? "В работе" : "Запланировано"}</span>
                        <span className="tabular-nums">{percent}%</span>
                      </div>
                      <ProgressBar value={percent} />
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState title="Активных тем пока нет" description="После публикации плана текущие темы появятся здесь." />
            </div>
          )}
        </section>

        <section className="min-w-0 lg:border-l lg:border-stone-200 lg:pl-8" aria-labelledby="homework-month-title">
          <SectionHeading
            icon={BookOpenCheck}
            eyebrow={`ДЗ за ${formatMonthKey(month, "short")}`}
            title="Ваш результат"
            id="homework-month-title"
            href="/school-lessons?tab=homework"
            action="История ДЗ"
          />

          {homeworkStatistics ? (
            <>
              <div className="mt-5 border-y border-stone-200 py-4">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold text-stone-500">Освоено за месяц</p>
                    <p className="font-display mt-1 text-3xl tabular-nums text-ink">
                      {acceptedHomework} <span className="text-lg text-stone-400">из {assignedHomework}</span>
                    </p>
                  </div>
                  <p className="text-sm font-black tabular-nums text-emerald-700">{homeworkProgress}%</p>
                </div>
                <div className="mt-3">
                  <ProgressBar value={homeworkProgress} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-5">
                <HomeworkMetric label="Назначено" value={assignedHomework} />
                <HomeworkMetric label="Освоено" value={acceptedHomework} tone="text-emerald-700" />
                <HomeworkMetric label="Ждёт проверки" value={homeworkStatistics.totals.waitingReview} tone="text-blue-700" />
                <HomeworkMetric label="Доработать" value={homeworkStatistics.totals.revision} tone="text-red-700" />
              </div>

              {homeworkStatistics.totals.noAttempt > 0 ? (
                <Link
                  href="/school-lessons?tab=homework"
                  className="mt-5 flex items-center justify-between gap-3 border-l-2 border-amber-400 bg-amber-50/70 px-4 py-3 text-xs font-semibold text-amber-950 transition hover:bg-amber-50"
                >
                  <span>Без ответа: {homeworkStatistics.totals.noAttempt}</span>
                  <span className="inline-flex items-center gap-1 font-black">Открыть <ArrowRight size={14} /></span>
                </Link>
              ) : null}
            </>
          ) : (
            <div className="mt-5">
              <EmptyState
                title="Итоги ДЗ появятся здесь"
                description="После подключения нового формата домашних заданий здесь будет виден результат за месяц."
              />
            </div>
          )}
        </section>
      </div>

      {tasks.meta?.partial ? (
        <div className="mt-8 flex items-start gap-2 border-y border-amber-200 bg-amber-50/70 py-3 text-sm font-semibold text-amber-950">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          Не всё удалось загрузить. Ниже показаны доступные задания.
        </div>
      ) : null}

      {remainingTasks.length ? (
        <section className="mt-10" aria-labelledby="current-tasks-title">
          <SectionHeading
            icon={ListTodo}
            eyebrow="После главного"
            title="Другие задания"
            id="current-tasks-title"
            href="/tasks"
            action="Все задания"
          />
          <div className="mt-4 divide-y divide-stone-200 border-y border-stone-200">
            {remainingTasks.map((task) => <LearningTaskRow key={task.id} task={task} />)}
          </div>
        </section>
      ) : !nextTask ? (
        <section className="mt-10 flex items-center gap-3 border-y border-emerald-200 bg-emerald-50/70 py-5 text-emerald-950" aria-label="Статус заданий">
          <CheckCircle2 size={20} className="shrink-0 text-emerald-700" />
          <div>
            <h2 className="font-bold">Сейчас всё сделано</h2>
            <p className="mt-1 text-sm text-emerald-900/70">Новые задания появятся после урока или внутри курса.</p>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function LearningFocus({
  task,
  topic,
}: {
  task: UnifiedTask | null;
  topic: { title: string; direction: string | null; planGoal: string | null } | null;
}) {
  const revision = task?.status === "needs_revision";
  const label = task
    ? revision ? "Вернитесь к заданию" : "Следующий шаг"
    : topic ? "Продолжайте тему" : "На сегодня";
  const title = task?.title ?? topic?.title ?? "Маршрут готовится";
  const description = task
    ? [task.context.primary, task.context.teacherName].filter(Boolean).join(" · ")
    : topic
      ? [topic.direction, topic.planGoal].filter(Boolean).join(" · ")
      : "Новые темы и задания появятся после публикации учебного плана.";
  const href = task?.target.href ?? "/monthly-plan";
  const action = task?.target.actionLabel ?? "Открыть план";
  const FocusIcon = revision ? RotateCcw : task ? ListTodo : GraduationCap;

  return (
    <section className="mt-6 border-y border-black bg-ink px-5 py-5 text-white sm:px-7 sm:py-6" aria-labelledby="learning-focus-title">
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-gold">
            <FocusIcon size={16} /> {label}
          </p>
          <h2 id="learning-focus-title" className="font-display mt-2 text-2xl leading-tight sm:text-3xl">
            {title}
          </h2>
          <p className="mt-2 max-w-2xl truncate text-sm text-white/60">{description}</p>
        </div>
        <Link
          href={href}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-gold px-5 text-sm font-black text-ink transition hover:bg-[#d4aa55] sm:w-auto"
        >
          {action} <ArrowRight size={16} />
        </Link>
      </div>
    </section>
  );
}

function SectionHeading({
  icon: Icon,
  eyebrow,
  title,
  id,
  href,
  action,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  id: string;
  href: string;
  action: string;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.15em] text-gold">
          <Icon size={15} /> {eyebrow}
        </p>
        <h2 id={id} className="font-display mt-1 text-2xl leading-tight text-ink sm:text-3xl">{title}</h2>
      </div>
      <Link
        href={href}
        aria-label={action}
        className="group inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 text-xs font-bold text-stone-600 transition hover:border-gold/40 hover:text-ink"
      >
        <span className="hidden sm:inline">{action}</span>
        <ArrowRight size={15} className="transition group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}

function LearningTaskRow({ task }: { task: UnifiedTask }) {
  const revision = task.status === "needs_revision";
  const StatusIcon = revision ? RotateCcw : Clock3;
  const statusLabel = revision ? "Нужна доработка" : "Нужно сделать";
  return (
    <Link
      href={task.target.href}
      className="group grid min-w-0 grid-cols-[36px_minmax(0,1fr)_32px] items-center gap-3 py-4 transition hover:bg-white/60 sm:grid-cols-[40px_minmax(0,1fr)_auto] sm:px-2"
    >
      <span className={`grid h-9 w-9 place-items-center rounded-lg ${revision ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
        <StatusIcon size={16} />
      </span>
      <span className="min-w-0">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <strong className="truncate text-sm text-ink sm:text-base">{task.title}</strong>
          <span className={`text-[10px] font-black uppercase tracking-[0.08em] ${revision ? "text-red-700" : "text-stone-400"}`}>
            {statusLabel}
          </span>
        </span>
        <span className="mt-1 block truncate text-xs text-stone-500">
          {task.context.primary}{task.context.teacherName ? ` · ${task.context.teacherName}` : ""}
        </span>
      </span>
      <span className="grid h-8 w-8 place-items-center rounded-lg border border-stone-200 bg-white text-stone-500 transition group-hover:border-gold/40 group-hover:text-gold sm:w-auto sm:grid-cols-[auto_16px] sm:gap-2 sm:px-3">
        <span className="hidden text-xs font-bold sm:block">{task.target.actionLabel}</span>
        <ArrowRight size={15} />
      </span>
    </Link>
  );
}

function Summary({
  href,
  icon: Icon,
  label,
  value,
  tone = "text-ink",
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <Link href={href} className="group min-w-0 px-3 py-3 transition hover:bg-white/70 sm:px-4 sm:py-4">
      <div className="flex items-center gap-2 text-stone-400 transition group-hover:text-gold">
        <Icon size={15} className="shrink-0" />
        <p className="truncate text-[9px] font-black uppercase tracking-[0.08em] sm:text-[10px] sm:tracking-[0.12em]">{label}</p>
      </div>
      <p className={`font-display mt-1 text-2xl tabular-nums sm:text-3xl ${tone}`}>{value}</p>
    </Link>
  );
}

function HomeworkMetric({ label, value, tone = "text-ink" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="min-w-0 border-b border-stone-200 py-4">
      <p className={`text-2xl font-black tabular-nums ${tone}`}>{value}</p>
      <p className="mt-1 text-[10px] font-bold uppercase leading-4 tracking-[0.07em] text-stone-500">{label}</p>
    </div>
  );
}
