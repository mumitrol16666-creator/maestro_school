"use client";

import { ArrowRight, BookOpenCheck, CalendarDays, ListTodo, Target } from "lucide-react";
import Link from "next/link";
import { useApiResource } from "@/hooks/use-api-resource";
import { api } from "@/lib/api-client";
import { nearestLearningLesson, learningTaskContext, schoolDateLabel } from "@/lib/learning-overview";
import type { SchoolOfflineLesson } from "@/types/school-offline";
import type { UnifiedTask } from "@/types/unified-tasks";

const linkStyle = "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold text-amber-800 transition-colors hover:bg-amber-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-700";

export default function LearningWorkspacePage() {
  const resource = useApiResource(async () => {
    // Each block has its own unavailable state. A CRM outage must not erase course tasks
    // or turn an unavailable plan into an apparently empty plan.
    const [plans, tasks, school] = await Promise.all([
      api.studentMonthlyPlans().catch(() => null),
      api.studentTasks({ scope: "active", limit: 12 }).catch(() => null),
      api.studentOfflineSummary().catch(() => null),
    ]);
    return { plans, tasks, school };
  }, []);

  if (resource.loading || !resource.data) return (
    <div className="mx-auto max-w-6xl py-8" role="status" aria-live="polite" aria-busy="true">
      <p className="text-sm text-stone-600">Загружаем ближайший урок и задания…</p>
    </div>
  );

  const { plans, tasks, school } = resource.data;
  const nextTask = tasks?.data.items.find((task) => task.actionRequired) ?? null;
  const nextLesson = nearestLearningLesson(school?.upcomingLessons ?? []);
  const partial = !tasks || Boolean(tasks.meta?.partial);
  const counts = tasks?.data.counts;
  const pendingCount = counts?.actionRequired ?? 0;
  const waitingCount = counts?.waitingReview ?? 0;
  const hasPlans = Boolean(plans?.plans.length);
  const planItems = plans?.plans.flatMap((plan) => plan.items) ?? [];
  const activeTopics = planItems.filter((item) => (!item.state || item.state === "active") && item.status !== "completed");
  const planTitle = !plans ? "Не удалось загрузить план"
    : !hasPlans ? "Учебный план пока не опубликован"
    : activeTopics.length ? "Ваш учебный план"
    : planItems.length ? "Все текущие темы завершены" : "Темы плана готовятся";
  const planDescription = !plans ? "Не можем проверить темы. Попробуйте обновить данные."
    : !hasPlans ? "Темы появятся после публикации преподавателем."
    : activeTopics.length ? "Темы, критерии и прогресс — во вкладке «План»."
    : planItems.length ? "Результаты сохранены во вкладке «План»."
    : "В опубликованном плане пока нет тем.";

  return (
    <div className="mx-auto max-w-6xl" data-testid="learning-overview">
      <header className="mb-6">
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-amber-800">Моё обучение</p>
        <h1 className="font-display mt-2 text-4xl leading-tight text-ink">Сейчас</h1>
        <p className="mt-2 text-sm leading-6 text-stone-600">Ближайший урок и то, что нужно подготовить.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <section className="flex min-w-0 flex-col rounded-xl border border-ink bg-ink p-5 text-white sm:p-7" aria-labelledby="learning-focus-title">
          <p className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.13em] text-gold">
            <BookOpenCheck size={17} aria-hidden="true" /> {nextTask ? "Задание" : "Подготовка к уроку"}
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
        <LessonCard lesson={nextLesson} unavailable={!school} />
      </div>

      <section className="mt-4 flex min-w-0 flex-col gap-3 rounded-xl border border-stone-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6" aria-labelledby="learning-tasks-title">
        <div className="flex min-w-0 items-start gap-4">
          <ListTodo size={24} className="mt-1 shrink-0 text-stone-500" aria-hidden="true" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2 id="learning-tasks-title" className="font-display text-2xl text-ink">Задания</h2>
              {counts && <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700" data-testid="learning-task-count">
                {pendingCount} незавершённых{partial ? " · данные неполные" : ""}
              </span>}
              {waitingCount > 0 && <span className="text-xs font-semibold text-blue-800">На проверке: {waitingCount}</span>}
            </div>
            <p className="mt-1 text-sm leading-6 text-stone-600">
              {partial ? "Показаны только доступные задания. Полный список пока не загружен."
                : "Незавершённые задания из уроков и курсов, включая прошлые."}
            </p>
          </div>
        </div>
        <Link href="/tasks" className={linkStyle}>Все задания <ArrowRight size={17} aria-hidden="true" /></Link>
      </section>

      <section className="mt-4 flex min-w-0 flex-col gap-3 rounded-xl border border-stone-200 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6" aria-labelledby="learning-plan-title">
        <div className="flex min-w-0 items-start gap-4">
          <Target size={25} className="mt-1 shrink-0 text-stone-500" aria-hidden="true" />
          <div className="min-w-0">
            <h2 id="learning-plan-title" className="font-display break-words text-xl text-ink sm:text-2xl">{planTitle}</h2>
            <p className="mt-1 text-sm leading-6 text-stone-600">{planDescription}</p>
          </div>
        </div>
        <Link href="/monthly-plan" className={linkStyle}>Открыть план <ArrowRight size={17} aria-hidden="true" /></Link>
      </section>

      {(!plans || !school || partial) && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-950" role="status">
          <span>Не всё удалось загрузить. Доступные данные сохранены на экране.</span>
          <button type="button" onClick={resource.reload} className={linkStyle}>Обновить данные</button>
        </div>
      )}
      <p className="mt-6 text-center text-xs leading-5 text-stone-500">Подробности — в плане, заданиях и расписании.</p>
    </div>
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

function LessonCard({ lesson, unavailable }: { lesson: SchoolOfflineLesson | null; unavailable: boolean }) {
  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-stone-200 bg-white p-5 sm:p-7" aria-labelledby="learning-lesson-title">
      <p className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.13em] text-amber-800">
        <CalendarDays size={17} aria-hidden="true" /> Ближайший урок
      </p>
      <h2 id="learning-lesson-title" className="font-display mt-4 break-words text-2xl leading-tight sm:text-3xl">
        {unavailable ? "Расписание недоступно" : lesson ? schoolDateLabel(lesson.date) : "Урок пока не назначен"}
      </h2>
      {lesson ? (
        <>
          <p className="mt-2 text-sm font-medium text-stone-600">
            {schoolDateLabel(lesson.date, true)} · {lesson.startTime}–{lesson.endTime}
          </p>
          <div className="mt-5 border-t border-stone-200 pt-4 text-sm leading-6 text-stone-600">
            <p>{lesson.deliveryFormat === "online" ? "Онлайн" : lesson.classType === "individual" ? "Индивидуально" : lesson.classType === "theory" ? "Теория" : "В группе"}{lesson.groupName ? ` · ${lesson.groupName}` : ""}</p>
            {lesson.teacherName && <p className="break-words">{lesson.teacherName}</p>}
            {lesson.deliveryFormat !== "online" && lesson.roomName && <p>{lesson.roomName}</p>}
          </div>
        </>
      ) : <p className="mt-3 text-sm leading-6 text-stone-600">{unavailable ? "Не можем проверить время занятия. Обновите данные или уточните у администратора." : "После назначения здесь появятся дата и время занятия."}</p>}
      <div className="mt-auto pt-5">
        <Link href="/school-lessons" className={linkStyle}>Расписание <ArrowRight size={17} aria-hidden="true" /></Link>
      </div>
    </section>
  );
}
