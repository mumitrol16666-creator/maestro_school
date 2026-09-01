import type { ApiDashboard, StudentHomeMonthlyPlan } from "@/types/api";
import type { SchoolOfflineLesson } from "@/types/school-offline";
import type { UnifiedTask } from "@/types/unified-tasks";

const MINUTE = 60_000;
const SCHOOL_TIME_ZONE_OFFSET = "+05:00";

export type StudentHomeHero = {
  kind: "task" | "school_lesson" | "online_lesson" | "plan" | "course";
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string | null;
  detail: string | null;
  badge: { label: string; tone: "danger" | "warning" | "success" } | null;
  href: string;
  actionLabel: string;
  external?: boolean;
};

type SelectStudentHomeHeroInput = {
  tasks: UnifiedTask[];
  schoolLessons: SchoolOfflineLesson[];
  plans: StudentHomeMonthlyPlan[];
  dashboard: ApiDashboard;
  now?: Date;
};

function schoolDateTime(lesson: SchoolOfflineLesson, time: string) {
  const date = lesson.date.slice(0, 10);
  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  return new Date(`${date}T${normalizedTime}${SCHOOL_TIME_ZONE_OFFSET}`);
}

function timeValue(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Aqtobe",
  }).format(value);
}

function sourceLabel(task: UnifiedTask) {
  if (task.source === "offline") return "Урок с преподавателем";
  if (task.source === "online") return "Онлайн с преподавателем";
  return "Самостоятельный курс";
}

function taskDetail(task: UnifiedTask) {
  if (task.status === "needs_revision") {
    if (task.result.reviewComment?.trim()) return task.result.reviewComment.trim();
    if (task.source === "offline" && task.result.completionPercent != null) {
      return `Выполнено на ${Math.round(task.result.completionPercent)}%. Текстового комментария преподаватель не оставил.`;
    }
    return "Работа возвращена без текстового комментария преподавателя.";
  }
  if (!task.timing.dueAt) return null;
  const due = formatDateTime(new Date(task.timing.dueAt));
  if (task.timing.dueKind === "next_lesson") return `К следующему уроку: ${due}`;
  if (task.timing.overdue) return `Срок прошёл: ${due}`;
  return `Сдать до ${due}`;
}

function taskHero(task: UnifiedTask): StudentHomeHero {
  const badge = task.status === "needs_revision"
    ? { label: "Нужна доработка", tone: "danger" as const }
    : task.timing.overdue
      ? { label: "Срок прошёл", tone: "danger" as const }
      : { label: "Нужно сделать", tone: "warning" as const };
  const context = [sourceLabel(task), task.context.primary, task.context.secondary]
    .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index)
    .join(" · ");

  return {
    kind: "task",
    id: task.id,
    eyebrow: `Сейчас · ${sourceLabel(task).toLocaleLowerCase("ru-RU")}`,
    title: task.title,
    subtitle: context || null,
    detail: taskDetail(task),
    badge,
    href: task.target.href,
    actionLabel: task.target.actionLabel,
  };
}

function liveSchoolHero(lesson: SchoolOfflineLesson, now: Date): StudentHomeHero {
  const startsAt = schoolDateTime(lesson, lesson.startTime);
  const started = startsAt.getTime() <= now.getTime();
  const isOnline = lesson.deliveryFormat === "online";
  const context = [lesson.teacherName, lesson.groupName, isOnline ? "Онлайн" : lesson.roomName]
    .filter(Boolean)
    .join(" · ");

  return {
    kind: isOnline ? "online_lesson" : "school_lesson",
    id: lesson.crmClassId,
    eyebrow: isOnline ? "Сейчас · онлайн-урок" : "Сейчас · урок в школе",
    title: lesson.title,
    subtitle: context || null,
    detail: started
      ? `Урок уже идёт · до ${lesson.endTime}`
      : `Начало через ${Math.max(1, Math.ceil((startsAt.getTime() - now.getTime()) / MINUTE))} мин · ${lesson.startTime}`,
    badge: { label: started ? "Урок идёт" : "Скоро начало", tone: "success" },
    href: isOnline && lesson.meetingUrl ? lesson.meetingUrl : `/school-lessons?tab=schedule${isOnline ? "&format=online" : ""}`,
    actionLabel: isOnline && lesson.meetingUrl ? "Подключиться" : "Детали урока",
    external: Boolean(isOnline && lesson.meetingUrl),
  };
}

function upcomingSchoolHero(lesson: SchoolOfflineLesson): StudentHomeHero {
  const startsAt = schoolDateTime(lesson, lesson.startTime);
  const isOnline = lesson.deliveryFormat === "online";
  const context = [lesson.teacherName, lesson.groupName, isOnline ? "Онлайн" : lesson.roomName]
    .filter(Boolean)
    .join(" · ");
  return {
    kind: isOnline ? "online_lesson" : "school_lesson",
    id: lesson.crmClassId,
    eyebrow: isOnline ? "Дальше · онлайн-урок" : "Дальше · урок в школе",
    title: lesson.title,
    subtitle: context || null,
    detail: formatDateTime(startsAt),
    badge: null,
    href: `/school-lessons?tab=schedule${isOnline ? "&format=online" : ""}`,
    actionLabel: "Детали урока",
  };
}

export function selectStudentHomeHero({
  tasks,
  schoolLessons,
  plans,
  dashboard,
  now = new Date(),
}: SelectStudentHomeHeroInput): StudentHomeHero | null {
  const nowValue = now.getTime();
  const liveCandidates: Array<{
    startsAt: number;
    hero: StudentHomeHero;
  }> = [];

  schoolLessons.forEach((lesson) => {
    const startsAt = schoolDateTime(lesson, lesson.startTime).getTime();
    const endsAt = schoolDateTime(lesson, lesson.endTime).getTime();
    if (startsAt - nowValue <= 60 * MINUTE && endsAt >= nowValue) {
      liveCandidates.push({ startsAt, hero: liveSchoolHero(lesson, now) });
    }
  });
  liveCandidates.sort((left, right) => left.startsAt - right.startsAt);
  if (liveCandidates[0]) return liveCandidates[0].hero;

  const actionTasks = tasks.filter((task) => task.actionRequired);
  const revision = actionTasks.find((task) => task.status === "needs_revision");
  if (revision) return taskHero(revision);

  const overdue = actionTasks
    .filter((task) => task.timing.dueKind === "exact" && task.timing.overdue)
    .sort((left, right) => timeValue(left.timing.dueAt) - timeValue(right.timing.dueAt))[0];
  if (overdue) return taskHero(overdue);

  const exactDue = actionTasks
    .filter((task) => task.timing.dueKind === "exact" && !task.timing.overdue)
    .sort((left, right) => timeValue(left.timing.dueAt) - timeValue(right.timing.dueAt))[0];
  if (exactDue) return taskHero(exactDue);

  const planItems = plans.flatMap((plan) => plan.items.map((item) => ({ plan, item })));
  const planItem = planItems.find(({ item }) => item.status === "in_progress")
    ?? planItems.find(({ item }) => item.status === "planned");
  if (planItem) {
    return {
      kind: "plan",
      id: planItem.item.id,
      eyebrow: "Сейчас · план месяца",
      title: planItem.item.title,
      subtitle: planItem.plan.goal,
      detail: `${planItem.plan.progress.completed} из ${planItem.plan.progress.total} пунктов выполнено`,
      badge: planItem.item.status === "in_progress"
        ? { label: "В работе", tone: "warning" }
        : null,
      href: "/monthly-plan",
      actionLabel: "Открыть план",
    };
  }

  if (dashboard.currentCourse && dashboard.nextAvailableLesson) {
    return {
      kind: "course",
      id: dashboard.nextAvailableLesson.id,
      eyebrow: "Сейчас · самостоятельный курс",
      title: dashboard.nextAvailableLesson.title,
      subtitle: dashboard.currentCourse.title,
      detail: `${dashboard.completedLessonsCount} из ${dashboard.totalLessonsCount} уроков · ${dashboard.progressPercent}%`,
      badge: null,
      href: `/lessons/${dashboard.nextAvailableLesson.id}`,
      actionLabel: "Открыть урок",
    };
  }

  const futureLessons: Array<{ startsAt: number; hero: StudentHomeHero }> = [];
  schoolLessons.forEach((lesson) => {
    const startsAt = schoolDateTime(lesson, lesson.startTime).getTime();
    if (startsAt > nowValue) futureLessons.push({ startsAt, hero: upcomingSchoolHero(lesson) });
  });
  futureLessons.sort((left, right) => left.startsAt - right.startsAt);
  if (futureLessons[0]) return futureLessons[0].hero;

  return actionTasks[0] ? taskHero(actionTasks[0]) : null;
}
